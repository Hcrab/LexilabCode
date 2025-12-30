from flask import request, jsonify, Blueprint
from bson import ObjectId
from pymongo.errors import PyMongoError
from ..extensions import results_collection, quizzes_collection, logger
from werkzeug.exceptions import BadRequest
from ..config import BEIJING_TZ
from .ai import check_for_prompt_injection, grade_fill_in_the_blank_with_explanation
from datetime import datetime, timezone

results_bp = Blueprint('results', __name__, url_prefix='/results')

@results_bp.route("", methods=['POST'])
def create_result():
    try:
        data = request.get_json(force=True)
    except BadRequest:
        return jsonify(error="invalid JSON"), 400

    username = data.get("username")
    quiz_id = data.get("quiz_id")
    details = data.get("details")
    time_spent = data.get("time_spent", 0)

    if not (username and quiz_id and details and "questions" in details):
        return jsonify(error="missing required fields"), 400

    try:
        quiz_obj_id = ObjectId(quiz_id)
    except Exception:
        return jsonify(error="invalid quiz_id"), 400

    quiz = quizzes_collection.find_one({"_id": quiz_obj_id})
    if not quiz:
        return jsonify(error="quiz not found"), 404

    quiz_questions_map = {
        str(q["id"]): q for q in quiz.get("data", {}).get("items", []) if "id" in q
    }
    # Create a secondary map based on the word for lookup if ID is missing
    quiz_questions_by_word_map = {
        q["word"]: q for q in quiz.get("data", {}).get("items", []) if "word" in q
    }

    final_score = 0
    total_possible = 0
    FILL_BLANK_POINTS = 2
    SENTENCE_POINTS = 4

    processed_questions = []

    for submitted_q in details.get("questions", []):
        q_id = str(submitted_q.get("id")) if "id" in submitted_q else None
        db_question = quiz_questions_map.get(q_id)

        # If not found by ID, try to find by word (for legacy or malformed data)
        if not db_question and "word" in submitted_q:
            db_question = quiz_questions_by_word_map.get(submitted_q["word"])

        if not db_question:
            logger.warning(f"Submitted question could not be matched to a DB question: {submitted_q}")
            continue
        
        processed_q = submitted_q.copy()
        # Ensure the word from the database is always included in the final result
        processed_q["word"] = db_question.get("word")

        # Logic for fill-in-the-blank questions
        if submitted_q.get("type") == "fill-in-the-blank":
            total_possible += FILL_BLANK_POINTS
            # Trust the 'correct' field from the frontend payload
            if submitted_q.get("correct"):
                final_score += FILL_BLANK_POINTS
            # Ensure correctAnswer is populated from the database for consistency
            processed_q["correctAnswer"] = db_question.get("answer", "")

        # Logic for sentence-building questions
        elif "score" in submitted_q:
            total_possible += SENTENCE_POINTS
            final_score += submitted_q.get("score", 0)
        
        else:
            logger.warning(f"Question with unknown format found in submission: {submitted_q}")
            continue

        processed_questions.append(processed_q)

    passed = (final_score / total_possible) >= 0.6 if total_possible > 0 else False
    
    # Replace original details with processed ones
    details["questions"] = processed_questions

    result_doc = {
        "username": username,
        "quiz_id": quiz_obj_id,
        "correct": final_score,
        "total": total_possible,
        "passed": passed,
        "time_spent": time_spent,
        "details": details,
        "ts": datetime.now(timezone.utc)
    }

    try:
        result = results_collection.insert_one(result_doc)
        new_result_doc = {
            "id": str(result.inserted_id),
            "username": username,
            "quiz_id": str(quiz_obj_id),
            "correct": final_score,
            "total": total_possible,
            "passed": passed,
            "time_spent": time_spent,
            "details": details,
            "ts": result_doc["ts"].isoformat()
        }
        return jsonify(new_result_doc), 201
    except PyMongoError as e:
        logger.error(f"Error inserting result: {e}")
        return jsonify(error="database error"), 500

@results_bp.route("", methods=['GET'])
def list_results():
    username = request.args.get("username")
    quiz_id = request.args.get("quiz_id")
    logger.info(f"list_results called with username: {username}, quiz_id: {quiz_id}")

    if not username:
        return jsonify(error="username required"), 400

    match_stage = {"username": username}
    if quiz_id:
        try:
            match_stage["quiz_id"] = ObjectId(quiz_id)
        except Exception as e:
            logger.error(f"Invalid quiz_id '{quiz_id}': {e}")
            return jsonify(error="invalid quiz_id"), 400
    
    logger.info(f"Executing aggregation with match_stage: {match_stage}")

    pipeline = [
        {"$match": match_stage},
        {"$sort": {"ts": -1}},
        {"$lookup": {
            "from": "quizzes",
            "localField": "quiz_id",
            "foreignField": "_id",
            "as": "quiz_info"
        }},
        {"$unwind": {"path": "$quiz_info", "preserveNullAndEmptyArrays": True}},
        {"$project": {
            "id": {"$toString": "$_id"},
            "quiz_id": {"$toString": "$quiz_id"},
            "quiz_name": {"$ifNull": ["$quiz_info.name", "Deleted Quiz"]},
            "score": "$correct",
            "total_score": "$total",
            "passed": 1,
            "ts": 1,
            "_id": 0
        }}
    ]
    try:
        results = list(results_collection.aggregate(pipeline))
        logger.info(f"Aggregation returned {len(results)} results.")
        return jsonify(results)
    except Exception as e:
        logger.error(f"Aggregation pipeline failed: {e}")
        return jsonify(error="database aggregation failed"), 500

@results_bp.route("/<result_id>", methods=['GET'])
def get_result(result_id):
    logger.info(f"Received request for result_id: {result_id}")
    try:
        obj_id = ObjectId(result_id)
    except Exception as e:
        logger.error(f"Invalid result_id '{result_id}': {e}")
        return jsonify(error="invalid result_id"), 400
    
    try:
        result = results_collection.find_one({"_id": obj_id})
        if not result:
            logger.warning(f"Result with id '{result_id}' not found.")
            return jsonify(error="not found"), 404
        
        result['id'] = str(result.pop('_id'))
        result['score'] = result.pop('correct', 0)
        result['total_score'] = result.pop('total', 0)
        if 'quiz_id' in result:
            result['quiz_id'] = str(result['quiz_id'])

        logger.info(f"Successfully found result with id '{result_id}'.")
        return jsonify(result)
    except PyMongoError as e:
        logger.error(f"Database error fetching result '{result_id}': {e}")
        return jsonify(error="database error"), 500

@results_bp.route("/quizzes/<quiz_id>", methods=['GET'])
def get_results_by_quiz(quiz_id):
    username = request.args.get("username")
    logger.info(f"--- ENTERING get_results_by_quiz ---")
    logger.info(f"Raw quiz_id: {quiz_id}, Raw username: {username}")

    if not username:
        logger.warning("Username is missing")
        return jsonify(error="username required"), 400
    
    try:
        quiz_obj_id = ObjectId(quiz_id)
    except Exception as e:
        logger.error(f"Invalid quiz_id '{quiz_id}': {e}")
        return jsonify(error="invalid quiz_id"), 400

    pipeline = [
        {"$match": {
            "username": username,
            "quiz_id": quiz_obj_id
        }},
        {"$sort": {"ts": -1}},
        {"$lookup": {
            "from": "quizzes",
            "localField": "quiz_id",
            "foreignField": "_id",
            "as": "quiz_info"
        }},
        {"$unwind": {"path": "$quiz_info", "preserveNullAndEmptyArrays": True}},
        {"$project": {
            "id": {"$toString": "$_id"},
            "quiz_id": {"$toString": "$quiz_id"},
            "quiz_name": {"$ifNull": ["$quiz_info.name", "Deleted Quiz"]},
            "score": "$correct",
            "total_score": "$total",
            "passed": 1,
            "ts": 1,
            "_id": 0
        }}
    ]
    
    try:
        results = list(results_collection.aggregate(pipeline))
        return jsonify(results)
    except Exception as e:
        logger.error(f"Aggregation pipeline failed in get_results_by_quiz: {e}", exc_info=True)
        return jsonify(error="database aggregation failed"), 500

@results_bp.route("/<result_id>/rescore", methods=['PATCH'])
def rescore_update_result(result_id: str):
    """
    Update a single question inside a result after rescoring and recompute totals.
    Body:
      {
        "question_index": <int>,
        "question_update": { "correct": <bool>, "score": <int>, "feedback": <str> }
      }
    Only the provided fields in question_update are applied to the existing question.
    Returns the updated result document in the same shape as GET /results/<id>.
    """
    try:
        payload = request.get_json(force=True)
    except BadRequest:
        return jsonify(error="invalid JSON"), 400

    if not isinstance(payload, dict):
        return jsonify(error="invalid body"), 400

    q_index = payload.get("question_index")
    q_update = payload.get("question_update", {})
    if not isinstance(q_index, int) or q_index < 0:
        return jsonify(error="question_index required"), 400
    if not isinstance(q_update, dict):
        return jsonify(error="question_update must be object"), 400

    try:
        obj_id = ObjectId(result_id)
    except Exception:
        return jsonify(error="invalid result_id"), 400

    try:
        doc = results_collection.find_one({"_id": obj_id})
        if not doc:
            return jsonify(error="not found"), 404

        details = doc.get("details") or {}
        questions = list(details.get("questions") or [])
        if q_index >= len(questions):
            return jsonify(error="question_index out of range"), 400

        # Apply partial update to the targeted question
        current_q = dict(questions[q_index])
        for k in ("correct", "score", "feedback"):
            if k in q_update:
                current_q[k] = q_update[k]
        questions[q_index] = current_q

        # Recompute totals using the same point scheme
        FILL_BLANK_POINTS = 2
        SENTENCE_POINTS = 4
        total_possible = 0
        total_score = 0
        for q in questions:
            q_type = q.get("type")
            if q_type == "fill-in-the-blank":
                total_possible += FILL_BLANK_POINTS
                total_score += FILL_BLANK_POINTS if q.get("correct") else 0
            elif "score" in q:
                total_possible += SENTENCE_POINTS
                try:
                    total_score += int(q.get("score", 0))
                except Exception:
                    pass

        # Persist
        details["questions"] = questions
        results_collection.update_one(
            {"_id": obj_id},
            {"$set": {"details": details, "correct": total_score, "total": total_possible}}
        )

        # Prepare response in the same shape as GET
        doc["details"] = details
        doc["correct"] = total_score
        doc["total"] = total_possible

        doc['id'] = str(doc.pop('_id'))
        # map DB fields to API shape
        api_doc = dict(doc)
        api_doc['score'] = api_doc.pop('correct', 0)
        api_doc['total_score'] = api_doc.pop('total', 0)
        if 'quiz_id' in api_doc:
            api_doc['quiz_id'] = str(api_doc['quiz_id'])
        return jsonify(api_doc)
    except PyMongoError as e:
        logger.error(f"Database error updating result '{result_id}': {e}")
        return jsonify(error="database error"), 500

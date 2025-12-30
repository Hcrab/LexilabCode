import json
from flask import request, jsonify, Blueprint
from bson import ObjectId
from ..extensions import bookmarks_collection, quizzes_collection, logger
from ..config import beijing_now
from .ai import _generate_all_stages_for_word_logic

bm_bp = Blueprint('bookmarks', __name__, url_prefix='/bookmarks')

@bm_bp.route("/list", methods=['POST'])
def list_bookmarks_post():
    logger.info(f"--- ENTERING /bookmarks/list (POST) ---")
    try:
        data = request.get_json(force=True)
        username = data.get("username")
        bookmark_type = data.get("type")
        logger.info(f"Received POST data: username='{username}', type='{bookmark_type}'")

        if not (username and bookmark_type):
            return jsonify(error="username and type are required"), 400
        if bookmark_type not in ['error_question', 'vocabulary_word']:
            return jsonify(error="invalid type specified"), 400

        match_query = {"username": username, "type": bookmark_type}
        
        pipeline = [
            {"$match": match_query},
            {"$sort": {"created_at": -1}}
        ]

        if bookmark_type == 'error_question':
            pipeline.extend([
                {"$lookup": {
                    "from": "quizzes",
                    "localField": "quiz_id",
                    "foreignField": "_id",
                    "as": "quiz_info"
                }},
                {"$unwind": {"path": "$quiz_info", "preserveNullAndEmptyArrays": True}},
                {"$project": {
                    "_id": 1, "type": 1, "quiz_id": 1, "result_id": 1,
                    "question_index": 1, "user_answer": 1, "word": 1,
                    "created_at": 1, "quiz_name": {"$ifNull": ["$quiz_info.name", "Deleted Quiz"]},
                    "question_prompt": 1, "correct_answer": 1, "ai_feedback": 1,
                }}
            ])
        
        bookmarks = list(bookmarks_collection.aggregate(pipeline))
        return jsonify(bookmarks)
    except Exception as e:
        logger.error(f"--- UNCAUGHT EXCEPTION IN /bookmarks/list: {e} ---", exc_info=True)
        return jsonify(error="An unexpected error occurred in the server."), 500

@bm_bp.route("", methods=['GET'])
def list_bookmarks():
    try:
        username = request.args.get("username")
        bookmark_type = request.args.get("type")
        result_id = request.args.get("result_id")

        if not (username and bookmark_type):
            return jsonify(error="username and type are required"), 400
        if bookmark_type not in ['error_question', 'vocabulary_word']:
            return jsonify(error="invalid type specified"), 400

        match_query = {"username": username, "type": bookmark_type}
        
        if result_id:
            try:
                match_query["result_id"] = ObjectId(result_id)
            except Exception as e:
                logger.error(f"Failed to convert result_id '{result_id}' to ObjectId. Error: {e}", exc_info=True)
                return jsonify(error=f"invalid result_id format: {result_id}"), 400

        pipeline = [
            {"$match": match_query},
            {"$sort": {"created_at": -1}}
        ]

        if bookmark_type == 'error_question':
            pipeline.extend([
                {"$lookup": {
                    "from": "quizzes",
                    "localField": "quiz_id",
                    "foreignField": "_id",
                    "as": "quiz_info"
                }},
                {"$unwind": {"path": "$quiz_info", "preserveNullAndEmptyArrays": True}},
                {"$project": {
                    "_id": 1, "type": 1, "quiz_id": 1, "result_id": 1,
                    "question_index": 1, "user_answer": 1, "word": 1,
                    "created_at": 1, "quiz_name": {"$ifNull": ["$quiz_info.name", "Deleted Quiz"]}
                }}
            ])
        
        bookmarks = list(bookmarks_collection.aggregate(pipeline))
        return jsonify(bookmarks)
    except Exception as e:
        logger.error(f"--- UNCAUGHT EXCEPTION IN /bookmarks: {e} ---", exc_info=True)
        return jsonify(error="An unexpected error occurred in the server."), 500

@bm_bp.route("", methods=['POST'])
def add_bookmark():
    data = request.get_json(force=True)
    username = data.get("username")
    bookmark_type = data.get("type")
    if not (username and bookmark_type):
        return jsonify(error="missing username or type"), 400

    doc = {"username": username, "type": bookmark_type, "created_at": beijing_now()}
    
    if bookmark_type == 'error_question':
        required = ['quiz_id', 'result_id', 'question_index', 'user_answer', 'word']
        if not all(f in data for f in required):
            return jsonify(error="missing fields for error_question"), 400
        try:
            doc.update({
                "quiz_id": ObjectId(data['quiz_id']),
                "result_id": ObjectId(data['result_id']),
                "question_index": data['question_index'],
                "user_answer": data['user_answer'],
                "word": data['word'],
                "question_prompt": data.get("question_prompt"),
                "correct_answer": data.get("correct_answer"),
                "ai_feedback": data.get("ai_feedback"),
            })
        except Exception:
            return jsonify(error="invalid quiz_id or result_id"), 400
        
        query_filter = {
            "username": username,
            "type": "error_question",
            "result_id": doc["result_id"],
            "question_index": doc["question_index"]
        }
        update_result = bookmarks_collection.update_one(query_filter, {"$setOnInsert": doc}, upsert=True)
        
        if update_result.upserted_id:
            new_bookmark = bookmarks_collection.find_one({"_id": update_result.upserted_id})
            return jsonify(new_bookmark), 201
        else:
            return jsonify(message="Question already bookmarked"), 200

    elif bookmark_type == 'vocabulary_word':
        required = ['word', 'definition']
        if not all(f in data for f in required):
            return jsonify(error="missing fields for vocabulary_word"), 400
        
        word_to_add = data['word']
        definition_str = data['definition']

        query_filter = {"username": username, "type": "vocabulary_word", "word": word_to_add}
        existing = bookmarks_collection.find_one(query_filter)
        
        if existing:
            return jsonify(error=f"'{word_to_add}' already exists in your vocabulary."), 409

        # --- Generate Lab Content ---
        try:
            # The definition from the frontend is a string. We need to parse it for the AI function.
            # Example format: "Adj. able to withstand... (坚韧的)"
            parts = definition_str.split('.', 1)
            pos = parts[0].strip() if len(parts) > 1 else 'N/A'
            rest = parts[1] if len(parts) > 1 else definition_str
            
            en_cn_parts = rest.split('(', 1)
            en_def = en_cn_parts[0].strip()
            cn_def = en_cn_parts[1].replace(')', '').strip() if len(en_cn_parts) > 1 else 'N/A'

            definition_obj = {"pos": pos, "en": en_def, "cn": cn_def}

            generated_data = _generate_all_stages_for_word_logic(word_to_add, definition_obj)
            
            # Add generated stages to the document
            doc.update({
                "stage1": generated_data.get("stage1"),
                "stage3": generated_data.get("stage3"),
                "stage4": generated_data.get("stage4"),
            })

        except Exception as e:
            logger.error(f"--- FAILED to generate AI content for bookmark: {e} ---", exc_info=True)
            # Decide if you want to still save the bookmark without the extra data
            return jsonify(error="An internal error occurred during AI content generation."), 500
        # --- End of Lab Content Generation ---

        doc.update({"word": word_to_add, "definition": definition_str})
        result = bookmarks_collection.insert_one(doc)
        new_bookmark = bookmarks_collection.find_one({"_id": result.inserted_id})
        return jsonify(new_bookmark), 201

    else:
        return jsonify(error="invalid bookmark type"), 400

@bm_bp.route("/<bookmark_id>", methods=['DELETE'])
def delete_bookmark(bookmark_id):
    try:
        obj_id = ObjectId(bookmark_id)
    except Exception:
        return jsonify(error="invalid bookmark_id"), 400
    
    result = bookmarks_collection.delete_one({"_id": obj_id})
    if result.deleted_count == 0:
        return jsonify(error="not found"), 404
    return jsonify(ok=True)

@bm_bp.route("/vocabulary/deduplicate", methods=['POST'])
def deduplicate_vocabulary():
    data = request.get_json(force=True)
    username = data.get("username")
    if not username:
        return jsonify(error="username is required"), 400

    logger.info(f"--- Starting vocabulary deduplication for user: {username} ---")

    try:
        pipeline = [
            {"$match": {"username": username, "type": "vocabulary_word"}},
            {"$group": {
                "_id": {"word": "$word", "definition": "$definition"},
                "ids": {"$push": "$_id"},
                "count": {"$sum": 1}
            }},
            {"$match": {"count": {"$gt": 1}}}
        ]

        duplicates = list(bookmarks_collection.aggregate(pipeline))
        ids_to_delete = []
        for group in duplicates:
            ids_to_delete.extend(group['ids'][1:])

        if not ids_to_delete:
            return jsonify(deleted_count=0)

        result = bookmarks_collection.delete_many({"_id": {"$in": ids_to_delete}})
        deleted_count = result.deleted_count
        logger.info(f"Successfully deleted {deleted_count} duplicate entries for user: {username}")
        
        return jsonify(deleted_count=deleted_count)

    except Exception as e:
        logger.error(f"--- Error during vocabulary deduplication for user {username}: {e} ---", exc_info=True)
        return jsonify(error="An unexpected error occurred during deduplication."), 500


from datetime import timedelta

# ... (other imports)

@bm_bp.route("/vocabulary/mark-learned", methods=['POST'])
def mark_vocabulary_learned():
    """
    Initializes the Spaced Repetition System (SRS) schedule for a word
    once it has been mastered for the first time in the lab.
    """
    data = request.get_json(force=True)
    username = data.get("username")
    word = data.get("word")

    if not all([username, word]):
        return jsonify(error="username and word are required"), 400

    try:
        # First, check if a schedule already exists to prevent overwriting it.
        existing_bookmark = bookmarks_collection.find_one(
            {"username": username, "type": "vocabulary_word", "word": word}
        )
        if not existing_bookmark:
            return jsonify(error=f"Word '{word}' not found for user '{username}'."), 404
        
        if 'review_schedule' in existing_bookmark and existing_bookmark['review_schedule']:
            return jsonify(success=True, message="Review schedule already exists."), 200

        # --- Initialize SRS Schedule ---
        srs_intervals = [1, 3, 5, 7, 15, 30, 60, 90]
        now = beijing_now() # This is already timezone-aware
        
        review_dates = [now + timedelta(days=d) for d in srs_intervals]

        update_result = bookmarks_collection.update_one(
            {"_id": existing_bookmark['_id']},
            {
                "$set": {
                    "learned_at": now, # Marks the initial learning date
                    "review_schedule": review_dates,
                    "review_stage_index": 0, # Start at the first review date
                    "is_fully_mastered": False
                }
            }
        )
        
        return jsonify(success=True, modified_count=update_result.modified_count)

    except Exception as e:
        logger.error(f"--- Error initializing SRS for user {username}, word {word}: {e} ---", exc_info=True)
        return jsonify(error="An unexpected error occurred during SRS initialization."), 500

@bm_bp.route("/vocabulary/record-review", methods=['POST'])
def record_review_outcome():
    """
    Records the outcome of a review session for a word and updates the SRS stage.
    """
    data = request.get_json(force=True)
    username = data.get("username")
    word = data.get("word")
    is_correct = data.get("is_correct")

    if not all([username, word]) or is_correct is None:
        return jsonify(error="username, word, and is_correct are required"), 400

    try:
        bookmark = bookmarks_collection.find_one(
            {"username": username, "type": "vocabulary_word", "word": word}
        )
        if not bookmark or 'review_schedule' not in bookmark:
            return jsonify(error=f"Word '{word}' not found or not in SRS for user '{username}'."), 404

        current_stage = bookmark.get("review_stage_index", 0)
        schedule_length = len(bookmark.get("review_schedule", []))
        
        if is_correct:
            next_stage = current_stage + 1
            if next_stage >= schedule_length:
                # All stages completed
                update_data = {
                    "review_stage_index": next_stage,
                    "is_fully_mastered": True
                }
            else:
                update_data = {"review_stage_index": next_stage}
        else:
            # If incorrect, reset to the first stage for review
            update_data = {"review_stage_index": 0}

        result = bookmarks_collection.update_one(
            {"_id": bookmark["_id"]},
            {"$set": update_data}
        )
        return jsonify(success=True, modified_count=result.modified_count)

    except Exception as e:
        logger.error(f"--- Error recording review outcome for user {username}, word {word}: {e} ---", exc_info=True)
        return jsonify(error="An unexpected error occurred while recording the review."), 500

@bm_bp.route("/vocabulary/reschedule-for-tomorrow", methods=['POST'])
def reschedule_for_tomorrow():
    """
    Resets the SRS schedule for a word to start from today.
    This is used as a penalty for failing a review pre-test.
    """
    data = request.get_json(force=True)
    username = data.get("username")
    word = data.get("word")

    if not all([username, word]):
        return jsonify(error="username and word are required"), 400
    
    from ..config import beijing_now
    from datetime import timedelta

    try:
        srs_intervals = [1, 3, 5, 7, 15, 30, 60, 90]
        now = beijing_now()
        new_review_dates = [now + timedelta(days=d) for d in srs_intervals]

        result = bookmarks_collection.update_one(
            {"username": username, "type": "vocabulary_word", "word": word},
            {
                "$set": {
                    "learned_at": now,
                    "review_schedule": new_review_dates,
                    "review_stage_index": 0,
                    "is_fully_mastered": False
                }
            }
        )
        if result.matched_count == 0:
            return jsonify(error=f"Word '{word}' not found for user '{username}'."), 404
        
        return jsonify(success=True, modified_count=result.modified_count)

    except Exception as e:
        logger.error(f"--- Error rescheduling word for user {username}, word {word}: {e} ---", exc_info=True)
        return jsonify(error="An unexpected error occurred during rescheduling."), 500

def reset_missed_reviews():
    """
    Finds all words that are due for review today or earlier but haven't been reviewed,
    and resets their SRS schedule.
    This is intended to be called by a daily scheduler.
    """
    from ..config import beijing_now
    from datetime import timedelta

    try:
        now = beijing_now()
        start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)

        # Find bookmarks that are due and not yet fully mastered
        query = {
            "type": "vocabulary_word",
            "is_fully_mastered": {"$ne": True},
            "review_schedule": {"$exists": True, "$ne": []}
        }
        
        due_bookmarks = list(bookmarks_collection.find(query))
        
        words_to_reset = []
        for bm in due_bookmarks:
            stage = bm.get("review_stage_index", 0)
            schedule = bm.get("review_schedule", [])
            if stage < len(schedule) and schedule[stage] <= start_of_day:
                words_to_reset.append(bm["_id"])

        if not words_to_reset:
            logger.info("Nightly review reset: No words to reset.")
            return

        logger.info(f"Nightly review reset: Found {len(words_to_reset)} words to reset.")

        # For these words, reset their SRS schedule
        srs_intervals = [1, 3, 5, 7, 15, 30, 60, 90]
        new_review_dates = [now + timedelta(days=d) for d in srs_intervals]

        bookmarks_collection.update_many(
            {"_id": {"$in": words_to_reset}},
            {
                "$set": {
                    "learned_at": now, # Reset the learning date to today
                    "review_schedule": new_review_dates,
                    "review_stage_index": 0,
                    "is_fully_mastered": False
                }
            }
        )
        logger.info(f"Successfully reset SRS for {len(words_to_reset)} words.")

    except Exception as e:
        logger.error(f"--- CRITICAL: Nightly review reset task failed: {e} ---", exc_info=True)


@bm_bp.route("/vocabulary/content", methods=['POST'])
def get_vocabulary_content():
    """
    Fetches the full content for a list of vocabulary words for a user.
    This is used by the lab to get pre-generated quiz data.
    """
    data = request.get_json(force=True)
    username = data.get("username")
    words = data.get("words") # Expects a list of strings

    if not all([username, words]):
        return jsonify(error="username and words list are required"), 400
    
    if not isinstance(words, list):
        return jsonify(error="words must be a list"), 400

    try:
        query = {
            "username": username,
            "type": "vocabulary_word",
            "word": {"$in": words}
        }
        bookmarks = list(bookmarks_collection.find(query))
        
        # Convert ObjectId to string for JSON serialization
        for bm in bookmarks:
            bm['_id'] = str(bm['_id'])
            # The definition string needs to be parsed into the object structure the frontend expects
            definition_str = bm.get("definition", "")
            parts = definition_str.split('.', 1)
            pos = parts[0].strip() if len(parts) > 1 else 'N/A'
            rest = parts[1] if len(parts) > 1 else definition_str
            en_cn_parts = rest.split('(', 1)
            en_def = en_cn_parts[0].strip()
            cn_def = en_cn_parts[1].replace(')', '').strip() if len(en_cn_parts) > 1 else 'N/A'
            bm['definition'] = {"pos": pos, "en": en_def, "cn": cn_def}


        return jsonify(bookmarks)

    except Exception as e:
        logger.error(f"--- Error fetching vocabulary content for user {username}: {e} ---", exc_info=True)
        return jsonify(error="An unexpected error occurred."), 500

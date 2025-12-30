from flask import jsonify, Blueprint
from ..extensions import users_collection, quizzes_collection, results_collection, logger

progress_bp = Blueprint('progress', __name__)

@progress_bp.route("/progress/<username>", methods=['GET'])
def get_user_progress(username):
    """
    Generates a comprehensive progress report for a given user.
    """
    logger.info(f"--- Generating progress report for user: {username} ---")
    
    user = users_collection.find_one({"username": username})
    if not user:
        logger.warning(f"User '{username}' not found.")
        return jsonify(error="User not found"), 404

    all_quizzes = list(quizzes_collection.find({}, {"_id": 1, "name": 1, "type": 1}))
    logger.info(f"Found {len(all_quizzes)} total quizzes in the database.")

    first_attempts_map = {}
    user_quiz_ids = results_collection.distinct("quiz_id", {"username": username})
    logger.info(f"User '{username}' has attempts for {len(user_quiz_ids)} quizzes.")

    for quiz_id in user_quiz_ids:
        first_attempt = results_collection.find_one(
            {"username": username, "quiz_id": quiz_id},
            sort=[("ts", 1), ("_id", 1)]
        )
        if first_attempt:
            first_attempts_map[str(quiz_id)] = first_attempt
    
    logger.info(f"Built first_attempts_map with {len(first_attempts_map)} entries.")

    progress_report = []
    completed_count = 0
    for quiz in all_quizzes:
        quiz_id_str = str(quiz["_id"])
        report_item = {
            "quiz_id": quiz_id_str,
            "quiz_name": quiz.get("name", "Untitled Quiz"),
            "quiz_type": quiz.get("type", "unknown"),
        }

        if quiz_id_str in first_attempts_map:
            completed_count += 1
            report_item["status"] = "completed"
            attempt = first_attempts_map.get(quiz_id_str)
            
            if attempt:
                report_item["first_attempt"] = {
                    "score": attempt.get("correct"),
                    "total_score": attempt.get("total"),
                    "passed": attempt.get("passed"),
                    "attempt_date": attempt.get("ts").isoformat() if attempt.get("ts") else None,
                    "result_id": str(attempt.get("_id"))
                }
            else:
                report_item["first_attempt"] = {
                    "score": None,
                    "total_score": None,
                    "passed": False,
                    "attempt_date": None,
                    "result_id": None,
                    "error": "Corrupted attempt data"
                }
        else:
            report_item["status"] = "pending"
        
        progress_report.append(report_item)

    logger.info(f"Finished building report. Found {completed_count} completed quizzes for user '{username}'.")

    progress_report.sort(
        key=lambda item: (
            item['status'] == 'pending',
            item.get('first_attempt', {}).get('attempt_date', '')
        ),
        reverse=True
    )

    logger.info(f"--- Successfully generated progress report for user: {username} ---")
    return jsonify(progress_report)

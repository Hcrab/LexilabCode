from flask import request, jsonify, Blueprint
from bson import ObjectId
from datetime import date, timedelta, datetime, timezone
from ..extensions import users_collection, quizzes_collection, results_collection, logger
from .auth import admin_required

stats_bp = Blueprint('stats', __name__)


def calculate_streaks(user_results):
    if not user_results:
        return 0, 0

    dates = sorted(list({res['ts'].date() for res in user_results}), reverse=True)
    
    if not dates:
        return 0, 0

    # Calculate current streak
    current_streak = 0
    today = datetime.now(timezone.utc).date()
    
    # Check if the most recent quiz was yesterday or today
    if (today - dates[0]).days <= 1:
        current_streak = 1
        for i in range(len(dates) - 1):
            if (dates[i] - dates[i+1]).days == 1:
                current_streak += 1
            else:
                break
    
    # Calculate max streak
    max_streak = 0
    if dates:
        max_streak = 1
        current_max = 1
        for i in range(len(dates) - 1):
            if (dates[i] - dates[i+1]).days == 1:
                current_max += 1
            else:
                current_max = 1
            if current_max > max_streak:
                max_streak = current_max
                
    return current_streak, max_streak


@stats_bp.route("/stats/streaks", methods=['GET'])
def get_user_streaks():
    username = request.args.get('username')
    if not username:
        return jsonify(error="Username is required"), 400
    
    # --- Calculate streaks for the current user ---
    user_results = list(results_collection.find({"username": username}).sort("ts", -1))
    current_streak, max_streak = calculate_streaks(user_results)

    # --- Calculate percentile ---
    all_users_streaks = []
    all_users = users_collection.find({}, {"username": 1})
    
    for user in all_users:
        user_res = list(results_collection.find({"username": user['username']}).sort("ts", -1))
        c_streak, _ = calculate_streaks(user_res)
        all_users_streaks.append(c_streak)
        
    if not all_users_streaks:
        percentile = 100
    else:
        streaks_better_than_user = sum(1 for s in all_users_streaks if s > current_streak)
        total_users = len(all_users_streaks)
        percentile = ((total_users - streaks_better_than_user) / total_users) * 100 if total_users > 0 else 100

    return jsonify({
        "current_streak": current_streak,
        "max_streak": max_streak,
        "percentile": round(percentile, 2)
    })


@stats_bp.route("/stats/overview", methods=['GET'])
@admin_required
def stats_overview(current_user):
    user_count = users_collection.count_documents({})
    quiz_count = quizzes_collection.count_documents({})
    
    pipeline = [
        {"$group": {
            "_id": None,
            "total_attempts": {"$sum": 1},
            "pass_count": {"$sum": {"$cond": ["$passed", 1, 0]}}
        }}
    ]
    stats = list(results_collection.aggregate(pipeline))
    
    total_attempts = stats[0]['total_attempts'] if stats else 0
    pass_count = stats[0]['pass_count'] if stats else 0
    
    completion = (total_attempts / (user_count * quiz_count) * 100) if user_count and quiz_count else 0
    pass_rate = (pass_count / total_attempts * 100) if total_attempts else 0
    
    return jsonify({
        "user_count": user_count,
        "quiz_count": quiz_count,
        "completion_rate": round(completion, 2),
        "pass_rate": round(pass_rate, 2),
    })

@stats_bp.route("/stats/users/<username>", methods=['GET'])
def stats_user(username):
    total_quizzes = quizzes_collection.count_documents({})

    first_attempts_pipeline = [
        {"$match": {"username": username, "quiz_id": {"$exists": True, "$ne": None}}},
        {"$sort": {"ts": 1}},
        {"$group": {
            "_id": "$quiz_id",
            "first_attempt": {"$first": "$ROOT"}
        }}
    ]
    first_attempts = list(results_collection.aggregate(first_attempts_pipeline))

    completed_count = len(first_attempts)
    pass_count_on_first_attempt = 0
    total_score_on_first_attempt = 0
    total_possible_on_first_attempt = 0
    time_spent_on_first_attempt = 0

    if first_attempts:
        for attempt_group in first_attempts:
            attempt = attempt_group.get("first_attempt")
            if not attempt:
                continue

            if attempt.get("passed"):
                pass_count_on_first_attempt += 1
            total_score_on_first_attempt += attempt.get("correct", 0)
            total_possible_on_first_attempt += attempt.get("total", 0)
            time_spent_on_first_attempt += attempt.get("time_spent", 0)

    completion_rate = (completed_count / total_quizzes * 100) if total_quizzes > 0 else 0
    pass_rate = (pass_count_on_first_attempt / completed_count * 100) if completed_count > 0 else 0
    average_score = (total_score_on_first_attempt / total_possible_on_first_attempt * 100) if total_possible_on_first_attempt > 0 else 0

    all_user_results = list(results_collection.find({"username": username}, {"ts": 1}).sort("ts", -1))
    
    last_ts = all_user_results[0]['ts'] if all_user_results else None
    streak = 0
    if all_user_results:
        date_set = {res['ts'].date() for res in all_user_results}
        date_list = sorted(list(date_set), reverse=True)
        
        prev = None
        today = datetime.now(timezone.utc).date()
        if not date_list or (today - date_list[0]).days > 1:
            streak = 0
        else:
            for d in date_list:
                if prev is None:
                    streak = 1
                elif (prev - d).days == 1:
                    streak += 1
                else:
                    break
                prev = d

    return jsonify({
        "completion_rate": round(completion_rate, 2),
        "pass_rate": round(pass_rate, 2),
        "average_score": round(average_score, 2),
        "last_login": last_ts,
        "time_spent": time_spent_on_first_attempt,
        "streak": streak,
        "completed_quizzes": completed_count,
        "total_quizzes": total_quizzes
    })

@stats_bp.route("/stats/quizzes/<quiz_id>", methods=['GET'])
@admin_required
def stats_quiz(current_user, quiz_id):
    try:
        obj_id = ObjectId(quiz_id)
    except Exception:
        return jsonify(error="invalid quiz_id"), 400

    total_users = users_collection.count_documents({})

    pipeline = [
        {"$match": {"quiz_id": obj_id}},
        {"$group": {
            "_id": None,
            "attempts":  {"$sum": 1},
            "pass_count":{"$sum": {"$cond": ["$passed", 1, 0]}},
            "avg_time":  {"$avg": "$time_spent"},
        }},
    ]
    s = list(results_collection.aggregate(pipeline))
    attempts   = s[0]["attempts"]   if s else 0
    pass_count = s[0]["pass_count"] if s else 0
    avg_time   = s[0]["avg_time"]   if s else 0

    qstats = {}
    cursor = results_collection.find(
        {"quiz_id": obj_id, "details.questions": {"$exists": True}}
    )
    for doc in cursor:
        qs = doc.get("details", {}).get("questions", [])
        for i, ok in enumerate(qs):
            if isinstance(ok, bool):
                pair = qstats.setdefault(i, [0, 0])
                pair[0 if ok else 1] += 1

    completion = (attempts / total_users * 100) if total_users else 0
    pass_rate  = (pass_count / attempts * 100)  if attempts else 0

    return jsonify({
        "completion_rate": round(completion, 2),
        "pass_rate":       round(pass_rate, 2),
        "avg_time":        avg_time,
        "questions": {
            str(i): {"correct": c, "incorrect": w}
            for i, (c, w) in qstats.items()
        },
    })

@stats_bp.route("/stats/quizzes/<quiz_id>/question-details", methods=['GET'])
@admin_required
def get_quiz_question_details(current_user, quiz_id):
    try:
        quiz_obj_id = ObjectId(quiz_id)
    except Exception:
        return jsonify(error="Invalid quiz_id format"), 400

    pipeline = [
        {"$match": {"quiz_id": quiz_obj_id}},
        {"$unwind": {"path": "$details.questions", "includeArrayIndex": "question_index"}},
        {"$project": {
            "question_index": 1,
            "question_obj": "$details.questions",
            "score": {
                "$cond": {
                    "if": {"$eq": [{"$type": "$details.questions.score"}, "missing"]},
                    "then": {"$cond": {"if": "$details.questions.correct", "then": 2, "else": 0}},
                    "else": "$details.questions.score"
                }
            }
        }},
        {"$group": {
            "_id": "$question_index",
            "avg_score": {"$avg": "$score"},
            "attempts": {"$sum": 1},
            "question": {"$first": "$question_obj"}
        }},
        {"$sort": {"_id": 1}}
    ]
    
    try:
        results = list(results_collection.aggregate(pipeline))
        return jsonify(results)
    except Exception as e:
        logger.error(f"Error getting question details for quiz {quiz_id}: {e}", exc_info=True)
        return jsonify(error="An internal error occurred"), 500

@stats_bp.route("/analytics/quizzes/overview", methods=['GET'])
@admin_required
def analytics_quiz_overview(current_user):
    try:
        all_quizzes = {str(q["_id"]): q["name"] for q in quizzes_collection.find({}, {"name": 1})}
        total_user_count = users_collection.count_documents({})
        css_user_count = users_collection.count_documents({"username": {"$regex": "^css"}})
        non_css_user_count = total_user_count - css_user_count

        pipeline = [
            {"$group": {
                "_id": "$quiz_id",
                "completed_users": {"$addToSet": "$username"}
            }}
        ]
        completion_data = list(results_collection.aggregate(pipeline))
        completion_map = {str(item["_id"]): item["completed_users"] for item in completion_data}

        report = []
        for quiz_id, quiz_name in all_quizzes.items():
            completed_users = completion_map.get(quiz_id, [])
            
            total_completed_count = len(completed_users)
            css_completed_count = len([u for u in completed_users if u.startswith("css")])
            non_css_completed_count = total_completed_count - css_completed_count
            
            total_completion_rate = (total_completed_count / total_user_count * 100) if total_user_count > 0 else 0
            css_completion_rate = (css_completed_count / css_user_count * 100) if css_user_count > 0 else 0
            
            report.append({
                "quiz_id": quiz_id,
                "quiz_name": quiz_name,
                "total_completion_rate": round(total_completion_rate, 2),
                "css_completion_rate": round(css_completion_rate, 2),
                "total_completed_count": total_completed_count,
                "css_completed_count": css_completed_count,
                "non_css_completed_count": non_css_completed_count,
            })
        
        report.sort(key=lambda x: x["quiz_name"])
        return jsonify(report)
    except Exception as e:
        logger.error(f"Error generating quiz completion stats: {e}", exc_info=True)
        return jsonify(error="An internal error occurred"), 500

@stats_bp.route("/analytics/users/overview", methods=['GET'])
@admin_required
def analytics_users_overview(current_user):
    try:
        total_quizzes_count = quizzes_collection.count_documents({})
        all_users = list(users_collection.find({}, {"password_hash": 0}).sort("username", 1))
        users_map = {user["username"]: user for user in all_users}

        first_attempts_pipeline = [
            {"$sort": {"ts": 1}},
            {"$group": {
                "_id": {"quiz_id": "$quiz_id", "username": "$username"},
                "first_attempt": {"$first": "$ROOT"}
            }},
            {"$group": {
                "_id": "$_id.username",
                "completed_quizzes": {"$sum": 1},
                "total_score": {"$sum": "$first_attempt.correct"},
                "total_possible": {"$sum": "$first_attempt.total"}
            }}
        ]
        
        user_stats_cursor = results_collection.aggregate(first_attempts_pipeline)
        stats_map = {stat["_id"]: stat for stat in user_stats_cursor}

        report = []
        for username, user_data in users_map.items():
            stats = stats_map.get(username)
            
            if stats:
                completed_count = stats.get("completed_quizzes", 0)
                total_score = stats.get("total_score", 0)
                total_possible = stats.get("total_possible", 0)
                
                completion_rate = (completed_count / total_quizzes_count * 100) if total_quizzes_count > 0 else 0
                average_score = (total_score / total_possible * 100) if total_possible > 0 else 0
            else:
                completed_count = 0
                completion_rate = 0
                average_score = 0

            report.append({
                "user": user_data,
                "completed_quizzes": completed_count,
                "total_quizzes": total_quizzes_count,
                "completion_rate": round(completion_rate, 2),
                "average_score": round(average_score, 2)
            })
            
        return jsonify(report)
    except Exception as e:
        logger.error(f"Error generating user analytics overview: {e}", exc_info=True)
        return jsonify(error="An internal error occurred"), 500

@stats_bp.route("/admin/quizzes/<quiz_id>/attempts", methods=['GET'])
@admin_required
def get_user_attempts_for_quiz(current_user, quiz_id):
    username = request.args.get("username")

    try:
        quiz_obj_id = ObjectId(quiz_id)
    except Exception:
        return jsonify(error="Invalid quiz_id format"), 400

    query = {"quiz_id": quiz_obj_id}
    if username:
        query["username"] = username
    
    log_message = f"Error fetching attempts for quiz {quiz_id}"
    if username:
        log_message += f" and user {username}"

    try:
        attempts = list(results_collection.find(query).sort("ts", -1))
        
        usernames = list(set(att.get('username') for att in attempts))
        
        users_cursor = users_collection.find({'username': {'$in': usernames}}, {"password_hash": 0})
        users_map = {u['username']: u for u in users_cursor}

        for attempt in attempts:
            user_info = users_map.get(attempt.get('username'))
            if user_info:
                attempt['user'] = {
                    'username': user_info['username'],
                    'english_name': user_info.get('english_name')
                }

        return jsonify(attempts)
    except Exception as e:
        logger.error(f"{log_message}: {e}", exc_info=True)
        return jsonify(error="An internal error occurred"), 500
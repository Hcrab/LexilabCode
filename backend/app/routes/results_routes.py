from flask import Blueprint, request, jsonify, g, current_app
from bson.objectid import ObjectId
from ..decorators import token_required, admin_required
from datetime import datetime

results_bp = Blueprint('results_bp', __name__)


@results_bp.route('/api/results', methods=['POST'])
@token_required
def create_result():
    data = request.get_json(silent=True) or {}
    # Always trust token, not client-provided username
    username = g.current_user.get('username')
    quiz_id = data.get('quiz_id') or ''
    details = data.get('details') or {}
    time_spent = data.get('time_spent') or 0
    # Compute score and total if present in details
    score = 0
    total = 0
    try:
        questions = details.get('questions', []) if isinstance(details, dict) else []
        for q in questions:
            if isinstance(q, dict) and 'correct' in q:
                total += 1
                if q.get('correct'): score += 1
            elif isinstance(q, dict) and 'score' in q:
                # Sentence questions are scored 0-4
                total += 4
                try:
                    score += int(q.get('score') or 0)
                except Exception:
                    pass
    except Exception:
        pass

    doc = {
        'username': username,
        'quiz_id': quiz_id,
        'details': details,
        'time_spent': time_spent,
        'score': score,
        'total_score': total,
        'created_at': datetime.utcnow().isoformat()
    }
    res = current_app.db.results.insert_one(doc)
    return jsonify({'id': str(res.inserted_id), 'score': score, 'total_score': total}), 201


@results_bp.route('/api/results/<rid>', methods=['GET'])
@token_required
def get_result(rid):
    try:
        oid = ObjectId(rid)
    except Exception:
        return jsonify({'error': 'invalid id'}), 400
    doc = current_app.db.results.find_one({'_id': oid})
    if not doc:
        return jsonify({'error': 'not found'}), 404
    # Owner only: students can view their own result
    cur = g.current_user
    if doc.get('username') != cur.get('username'):
        return jsonify({'error': 'forbidden'}), 403
    # Normalize id field for frontend convenience
    doc['_id'] = str(doc['_id'])
    doc['id'] = doc['_id']
    # Backward compatibility: expose ts for UI using created_at
    if 'created_at' in doc and 'ts' not in doc:
        doc['ts'] = doc['created_at']
    return jsonify(doc), 200


@results_bp.route('/api/results', methods=['GET'])
@token_required
def list_results_for_user():
    """
    List all results for the current user (or optional ?username= must match current user).
    Returns lightweight summaries used to aggregate by quiz.
    """
    # Determine target username: token owner by default; allow admin to query others via ?username=
    req_username = (request.args.get('username') or '').strip()
    cur_user = g.current_user
    if req_username and req_username != cur_user.get('username') and cur_user.get('role') != 'admin':
        return jsonify({'error': 'forbidden'}), 403
    target_username = req_username or cur_user.get('username')

    try:
        cursor = current_app.db.results.find({'username': target_username})
        items = []
        for d in cursor:
            score = int(d.get('score') or 0)
            total = int(d.get('total_score') or 0)
            created = d.get('created_at') or datetime.utcnow().isoformat()
            details = d.get('details') or {}
            quiz_name = details.get('name') if isinstance(details, dict) else None
            items.append({
                'id': str(d.get('_id')),
                'quiz_id': d.get('quiz_id'),
                'quiz_name': quiz_name or 'Quiz',
                'correct': score,
                'total': total,
                'score': score,
                'total_score': total,
                'passed': 1 if (total > 0 and (score / max(total, 1)) >= 0.6) else 0,
                'ts': created,
            })
        return jsonify(items), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@results_bp.route('/api/results/<rid>/claim', methods=['POST'])
@token_required
def claim_result(rid):
    """
    Assign an unowned result (missing/empty username) to current user.
    Safe no-op if already owned by current user. Forbidden if owned by others.
    """
    try:
        oid = ObjectId(rid)
    except Exception:
        return jsonify({'error': 'invalid id'}), 400
    doc = current_app.db.results.find_one({'_id': oid})
    if not doc:
        return jsonify({'error': 'not found'}), 404
    cur_username = g.current_user.get('username')
    owner = (doc.get('username') or '').strip()
    if owner and owner != cur_username and g.current_user.get('role') != 'admin':
        return jsonify({'error': 'forbidden'}), 403
    if not owner:
        current_app.db.results.update_one({'_id': oid}, {'$set': {'username': cur_username}})
        doc = current_app.db.results.find_one({'_id': oid})
    doc['_id'] = str(doc['_id'])
    doc['id'] = doc['_id']
    if 'created_at' in doc and 'ts' not in doc:
        doc['ts'] = doc['created_at']
    return jsonify(doc), 200


@results_bp.route('/api/results/quizzes/<quiz_id>', methods=['GET'])
@token_required
def list_attempts_for_quiz(quiz_id):
    """
    List all attempts for a given quiz by the current user.
    Optional ?username= must match current user unless admin.
    """
    req_username = (request.args.get('username') or '').strip()
    cur_user = g.current_user
    if req_username and req_username != cur_user.get('username') and cur_user.get('role') != 'admin':
        return jsonify({'error': 'forbidden'}), 403
    target_username = req_username or cur_user.get('username')

    try:
        cursor = current_app.db.results.find({'username': target_username, 'quiz_id': quiz_id})
        out = []
        for d in cursor:
            score = int(d.get('score') or 0)
            total = int(d.get('total_score') or 0)
            created = d.get('created_at') or datetime.utcnow().isoformat()
            details = d.get('details') or {}
            quiz_name = details.get('name') if isinstance(details, dict) else None
            out.append({
                'id': str(d.get('_id')),
                'quiz_id': d.get('quiz_id'),
                'quiz_name': quiz_name or 'Quiz',
                'score': score,
                'total_score': total,
                'passed': (total > 0 and (score / max(total, 1)) >= 0.6),
                'ts': created,
            })
        return jsonify(out), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@results_bp.route('/api/admin/classes/<class_id>/quizzes/<quiz_id>/attempts', methods=['GET'])
@admin_required
def list_attempts_for_quiz_in_class(class_id, quiz_id):
    """
    Admin-only: List all attempts for a given quiz restricted to users in the class.
    Returns array of { _id, quiz_id, score, total_score, ts, user: { username, nickname } }.
    """
    # role enforced by @admin_required
    try:
        class_oid = ObjectId(class_id)
    except Exception:
        return jsonify({'error': 'invalid class id'}), 400
    # Load class and its students
    cls = current_app.db.classes.find_one({'_id': class_oid})
    if not cls:
        return jsonify({'error': 'class not found'}), 404
    student_ids = cls.get('students') or []
    if not student_ids:
        return jsonify([]), 200
    # Map usernames for those students
    users = list(current_app.db.users.find({'_id': {'$in': student_ids}}, {'username': 1, 'nickname': 1}))
    uname_to_user = {u.get('username'): {'username': u.get('username'), 'nickname': u.get('nickname', '')} for u in users}
    # Fetch attempts for this quiz_id
    cursor = current_app.db.results.find({'quiz_id': quiz_id, 'username': {'$in': list(uname_to_user.keys())}})
    out = []
    for d in cursor:
        created = d.get('created_at') or datetime.utcnow().isoformat()
        out.append({
            '_id': str(d.get('_id')),
            'quiz_id': d.get('quiz_id'),
            'score': int(d.get('score') or 0),
            'total_score': int(d.get('total_score') or 0),
            'ts': created,
            'user': uname_to_user.get(d.get('username'), {'username': d.get('username'), 'nickname': ''})
        })
    return jsonify(out), 200


@results_bp.route('/api/results/<rid>/rescore', methods=['PATCH'])
@token_required
def rescore_question(rid):
    """
    Update a single question within result.details.questions[index] and recompute totals.
    Body: { question_index: int, question_update: dict }
    Returns updated result document.
    """
    try:
        oid = ObjectId(rid)
    except Exception:
        return jsonify({'error': 'invalid id'}), 400

    data = request.get_json(silent=True) or {}
    idx = data.get('question_index')
    q_update = data.get('question_update') or {}
    if idx is None or not isinstance(q_update, dict):
        return jsonify({'error': 'missing fields'}), 400

    # Load and authorize (owner only unless admin)
    doc = current_app.db.results.find_one({'_id': oid})
    if not doc:
        return jsonify({'error': 'not found'}), 404
    if doc.get('username') != g.current_user.get('username') and g.current_user.get('role') != 'admin':
        return jsonify({'error': 'forbidden'}), 403

    # Update question in-memory
    details = doc.get('details') or {}
    questions = list((details.get('questions') or []))
    if idx < 0 or idx >= len(questions):
        return jsonify({'error': 'index out of range'}), 400
    q = dict(questions[idx]) if isinstance(questions[idx], dict) else {}
    q.update(q_update)
    questions[idx] = q

    # Recalculate totals: 1 point per correct blank, 0-4 for sentence
    score = 0
    total = 0
    for qq in questions:
        if not isinstance(qq, dict):
            continue
        if qq.get('type') == 'fill-in-the-blank':
            total += 1
            if qq.get('correct'):
                score += 1
        elif qq.get('type') == 'sentence':
            total += 4
            try:
                sc = int(qq.get('score') or 0)
            except Exception:
                sc = 0
            score += max(0, min(4, sc))

    # Persist
    details['questions'] = questions
    current_app.db.results.update_one({'_id': oid}, {'$set': {'details': details, 'score': score, 'total_score': total}})

    # Return updated
    updated = current_app.db.results.find_one({'_id': oid})
    updated['_id'] = str(updated['_id'])
    updated['id'] = updated['_id']
    if 'created_at' in updated and 'ts' not in updated:
        updated['ts'] = updated['created_at']
    return jsonify(updated), 200

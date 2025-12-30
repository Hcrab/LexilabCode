from flask import Blueprint, request, jsonify, g, current_app
from bson.objectid import ObjectId
from datetime import datetime, timedelta
import uuid
from ..decorators import admin_required, token_required
import pytz

quiz_bp = Blueprint('quiz_bp', __name__)


def _sanitize_items(items):
    if not isinstance(items, list):
        return []
    out = []
    for it in items:
        if not isinstance(it, dict):
            continue
        t = it.get('type')
        word = it.get('word')
        definition = it.get('definition', '')
        sentence = it.get('sentence', '')
        if t not in ('fill-in-the-blank', 'sentence'):
            continue
        if not isinstance(word, str) or not word:
            continue
        cleaned = {'type': t, 'word': word}
        if isinstance(definition, str) and definition:
            cleaned['definition'] = definition
        if t == 'fill-in-the-blank' and isinstance(sentence, str) and sentence:
            cleaned['sentence'] = sentence
        # Ensure stable item id for client-side operations
        cleaned['id'] = it.get('id') if isinstance(it.get('id'), str) and it.get('id') else str(uuid.uuid4())
        out.append(cleaned)
    return out


def _parse_iso_to_utc(dt_str: str):
    """Parse ISO string (supports trailing 'Z') into aware UTC datetime."""
    if not dt_str:
        return None
    try:
        # Normalize 'Z' to '+00:00' for fromisoformat
        if dt_str.endswith('Z'):
            dt_str = dt_str[:-1] + '+00:00'
        dt = datetime.fromisoformat(dt_str)
        if dt.tzinfo is None:
            # Assume UTC if naive
            return dt.replace(tzinfo=pytz.utc)
        return dt.astimezone(pytz.utc)
    except Exception:
        return None


@quiz_bp.route('/api/quizzes', methods=['GET'])
@admin_required
def list_quizzes():
    teacher_id = g.current_user.get('_id')
    cur = current_app.db.quizzes.find({'created_by': teacher_id}).sort('created_at', -1)
    results = []
    for q in cur:
        q['_id'] = str(q['_id'])
        q['created_by'] = str(q.get('created_by')) if q.get('created_by') else None
        q['class_ids'] = [str(cid) for cid in (q.get('class_ids') or [])]
        # Normalize naming to word_pool_id for clients
        if 'word_pool_id' not in q and q.get('pool_id') is not None:
            q['word_pool_id'] = q.get('pool_id')
            del q['pool_id']
        results.append(q)
    return jsonify({'quizzes': results}), 200


@quiz_bp.route('/api/quizzes/<quiz_id>', methods=['GET'])
@token_required
def get_quiz(quiz_id):
    """Return a single quiz by id for taking. Accessible to any authenticated user."""
    try:
        qid = ObjectId(quiz_id)
    except Exception:
        return jsonify({'error': 'invalid quiz id'}), 400
    q = current_app.db.quizzes.find_one({'_id': qid})
    if not q:
        return jsonify({'error': 'quiz not found'}), 404
    # Authorization: superadmin or quiz creator (admin) or student in assigned classes
    cur = g.current_user
    role = cur.get('role')
    if role != 'superadmin':
        if role == 'admin':
            if q.get('created_by') != cur.get('_id'):
                return jsonify({'error': 'forbidden'}), 403
        else:
            # Student must belong to any class assigned this quiz
            try:
                class_ids = q.get('class_ids') or []
                if class_ids:
                    found = current_app.db.classes.find_one({'_id': {'$in': class_ids}, 'students': cur.get('_id')}, {'_id': 1})
                    if not found:
                        return jsonify({'error': 'forbidden'}), 403
            except Exception:
                return jsonify({'error': 'forbidden'}), 403
    q['_id'] = str(q['_id'])
    q['created_by'] = str(q.get('created_by')) if q.get('created_by') else None
    q['class_ids'] = [str(cid) for cid in (q.get('class_ids') or [])]
    # Normalize field name for pool id
    if 'word_pool_id' not in q and q.get('pool_id') is not None:
        q['word_pool_id'] = q.get('pool_id')
        del q['pool_id']
    return jsonify(q), 200


@quiz_bp.route('/api/quizzes', methods=['POST'])
@admin_required
def create_quiz():
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    qtype = (data.get('type') or '').strip()  # e.g., weekday | saturday | custom
    payload = data.get('data') or {}
    items = _sanitize_items(payload.get('items') or [])
    status = (data.get('status') or 'draft').strip()
    publish_at = data.get('publish_at')
    pool_id = data.get('pool_id')
    class_ids = data.get('class_ids') or []

    if not name:
        return jsonify({'error': 'Quiz name is required'}), 400
    if not items:
        return jsonify({'error': 'At least one item is required'}), 400
    if status == 'published' and (not isinstance(class_ids, list) or len(class_ids) == 0):
        return jsonify({'error': 'Please select at least one class to publish'}), 400

    teacher_id = g.current_user.get('_id')

    class_oid_list = []
    for cid in class_ids:
        try:
            class_oid_list.append(ObjectId(cid))
        except Exception:
            return jsonify({'error': f'invalid class id: {cid}'}), 400

    # Determine status considering Shanghai timezone for scheduling
    sh_tz = pytz.timezone('Asia/Shanghai')
    now_sh = datetime.now(sh_tz)
    now_utc = now_sh.astimezone(pytz.utc)
    now = now_utc.isoformat()
    # If publish_at is in the future (Shanghai logic), set status to 'to be published'
    if status == 'published' and publish_at:
        publish_dt_utc = _parse_iso_to_utc(publish_at)
        if publish_dt_utc and publish_dt_utc > now_utc:
            status = 'to be published'
    doc = {
        'name': name,
        'type': qtype or 'custom',
        'data': {'items': items},
        'status': status,
        'publish_at': publish_at or None,
        'word_pool_id': pool_id or None,
        'class_ids': class_oid_list,
        'created_by': teacher_id,
        'created_at': now,
        'updated_at': now
    }

    res = current_app.db.quizzes.insert_one(doc)
    inserted = current_app.db.quizzes.find_one({'_id': res.inserted_id})
    inserted['_id'] = str(inserted['_id'])
    inserted['created_by'] = str(inserted.get('created_by')) if inserted.get('created_by') else None
    inserted['class_ids'] = [str(cid) for cid in (inserted.get('class_ids') or [])]
    return jsonify(inserted), 201


@quiz_bp.route('/api/quizzes/<quiz_id>', methods=['PUT'])
@admin_required
def update_quiz(quiz_id):
    try:
        qid = ObjectId(quiz_id)
    except Exception:
        return jsonify({'error': 'invalid quiz id'}), 400
    data = request.get_json(silent=True) or {}
    updates = {}
    if 'name' in data:
        updates['name'] = data.get('name')
    if 'data' in data and isinstance(data['data'], dict):
        updates['data'] = {'items': _sanitize_items(data['data'].get('items') or [])}
    if 'status' in data:
        updates['status'] = data.get('status')
    if 'publish_at' in data:
        updates['publish_at'] = data.get('publish_at')
    # Support pool_id -> word_pool_id mapping from clients
    if 'pool_id' in data:
        updates['word_pool_id'] = data.get('pool_id')
    if 'class_ids' in data and isinstance(data['class_ids'], list):
        oids = []
        for cid in data['class_ids']:
            try:
                oids.append(ObjectId(cid))
            except Exception:
                return jsonify({'error': f'invalid class id: {cid}'}), 400
        updates['class_ids'] = oids
    if not updates:
        return jsonify({'error': 'no valid fields to update'}), 400

    # Validate publishing requires classes
    if updates.get('status') == 'published':
        doc = current_app.db.quizzes.find_one({'_id': qid})
        class_ids = updates.get('class_ids', doc.get('class_ids') if doc else [])
        if not class_ids:
            return jsonify({'error': 'Please select at least one class to publish'}), 400

    # Shanghai scheduling logic: if publish_at in the future while publishing, mark as 'to be published'
    sh_tz = pytz.timezone('Asia/Shanghai')
    now_sh = datetime.now(sh_tz)
    now_utc = now_sh.astimezone(pytz.utc)
    if updates.get('status') == 'published':
        pa = updates.get('publish_at')
        publish_dt_utc = _parse_iso_to_utc(pa) if isinstance(pa, str) else None
        if publish_dt_utc and publish_dt_utc > now_utc:
            updates['status'] = 'to be published'

    updates['updated_at'] = now_utc.isoformat()
    res = current_app.db.quizzes.update_one({'_id': qid}, {'$set': updates})
    if res.matched_count == 0:
        return jsonify({'error': 'quiz not found'}), 404
    updated = current_app.db.quizzes.find_one({'_id': qid})
    updated['_id'] = str(updated['_id'])
    updated['created_by'] = str(updated.get('created_by')) if updated.get('created_by') else None
    updated['class_ids'] = [str(cid) for cid in (updated.get('class_ids') or [])]
    return jsonify(updated), 200


@quiz_bp.route('/api/quizzes/<quiz_id>', methods=['DELETE'])
@admin_required
def delete_quiz(quiz_id):
    try:
        qid = ObjectId(quiz_id)
    except Exception:
        return jsonify({'error': 'invalid quiz id'}), 400
    res = current_app.db.quizzes.delete_one({'_id': qid})
    if res.deleted_count == 0:
        return jsonify({'error': 'quiz not found'}), 404
    return jsonify({'message': 'deleted'}), 200


@quiz_bp.route('/api/student/quizzes', methods=['GET'])
@token_required
def list_quizzes_for_student():
    """
    List quizzes available to students. Returns published (or scheduled) quizzes.
    Optionally supports per_page/page params but currently returns all.
    """
    # Determine the classes the current student belongs to
    user_id = g.current_user.get('_id')
    class_cursor = current_app.db.classes.find({'students': user_id}, {'_id': 1})
    class_ids = [c['_id'] for c in class_cursor]
    if not class_ids:
        return jsonify({'quizzes': []}), 200

    # Only show quizzes assigned to any of the student's classes and published/scheduled
    cur = current_app.db.quizzes.find({
        'status': {'$in': ['published', 'to be published']},
        'class_ids': {'$in': class_ids}
    }).sort([
        ('publish_at', -1), ('created_at', -1)
    ])
    quizzes = []
    for q in cur:
        q['_id'] = str(q['_id'])
        q['created_by'] = str(q.get('created_by')) if q.get('created_by') else None
        q['class_ids'] = [str(cid) for cid in (q.get('class_ids') or [])]
        # normalize word_pool_id
        if 'word_pool_id' not in q and q.get('pool_id') is not None:
            q['word_pool_id'] = q.get('pool_id')
            del q['pool_id']
        quizzes.append(q)
    return jsonify({'quizzes': quizzes}), 200


@quiz_bp.route('/api/admin/classes/<class_id>/quizzes', methods=['GET'])
@admin_required
def list_quizzes_for_class(class_id):
    """List quizzes assigned to a specific class for admin view."""
    try:
        cid = ObjectId(class_id)
    except Exception:
        return jsonify({'error': 'invalid class id'}), 400
    try:
        cur = current_app.db.quizzes.find({
            'class_ids': {'$in': [cid]},
            'status': {'$in': ['published', 'to be published']}
        }).sort([
            ('publish_at', -1), ('created_at', -1)
        ])
        out = []
        for q in cur:
            out.append({
                '_id': str(q.get('_id')),
                'name': q.get('name', 'Quiz'),
                'type': q.get('type', 'custom'),
                'status': q.get('status', 'published'),
                'publish_at': q.get('publish_at')
            })
        return jsonify(out), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# --- Shared helpers ---
def compute_user_quiz_completion(username: str):
    """Compute quiz completion numbers and rate for a username.
    Returns a dict: { completed_quizzes, total_quizzes, completion_rate }
    """
    try:
        user_doc = current_app.db.users.find_one({'username': username})
        if not user_doc:
            return {'completed_quizzes': 0, 'total_quizzes': 0, 'completion_rate': 0}

        # Classes of the user
        class_cursor = current_app.db.classes.find({'students': user_doc.get('_id')}, {'_id': 1})
        class_ids = [c['_id'] for c in class_cursor]
        if not class_ids:
            return {'completed_quizzes': 0, 'total_quizzes': 0, 'completion_rate': 0}

        # Published quizzes assigned to user's classes
        published_quizzes = list(current_app.db.quizzes.find({
            'status': 'published',
            'class_ids': {'$in': class_ids}
        }, {'_id': 1}))
        total_quizzes = len(published_quizzes)
        if total_quizzes == 0:
            return {'completed_quizzes': 0, 'total_quizzes': 0, 'completion_rate': 0}

        published_ids = set(str(q['_id']) for q in published_quizzes)

        # Count distinct quizzes with at least one result
        res_cur = current_app.db.results.find({'username': username, 'quiz_id': {'$in': list(published_ids)}})
        attempted_ids = set()
        for r in res_cur:
            qid = r.get('quiz_id')
            if isinstance(qid, str) and qid in published_ids:
                attempted_ids.add(qid)
        completed_quizzes = len(attempted_ids)
        completion_rate = round((completed_quizzes / total_quizzes) * 100) if total_quizzes > 0 else 0
        return {
            'completed_quizzes': completed_quizzes,
            'total_quizzes': total_quizzes,
            'completion_rate': completion_rate
        }
    except Exception:
        # Be conservative on errors
        return {'completed_quizzes': 0, 'total_quizzes': 0, 'completion_rate': 0}


@quiz_bp.route('/api/stats/users/<username>', methods=['GET'])
@token_required
def user_quiz_stats(username):
    """
    Returns quiz-related statistics for the given username (must match current user unless admin).
    - completion_rate: completed_quizzes / total_quizzes (%), rounded to int
    - pass_rate: based on first attempts only, threshold > 40%
    - average_score: based on first attempts only, percentage, rounded to int
    - streak: consecutive days (Shanghai) with at least one quiz attempt ending today
    - completed_quizzes: number of unique quizzes attempted
    - total_quizzes: number of published quizzes available to the student (in their classes)
    """
    cur = g.current_user
    if username != cur.get('username') and cur.get('role') != 'admin':
        return jsonify({'error': 'forbidden'}), 403

    # Determine classes of this user
    user_doc = current_app.db.users.find_one({'username': username})
    if not user_doc:
        return jsonify({'error': 'user not found'}), 404
    class_cursor = current_app.db.classes.find({'students': user_doc.get('_id')}, {'_id': 1})
    class_ids = [c['_id'] for c in class_cursor]

    # Published quizzes assigned to user's classes
    published_quizzes = list(current_app.db.quizzes.find({
        'status': 'published',
        'class_ids': {'$in': class_ids}
    }, {'_id': 1, 'name': 1}))
    total_quizzes = len(published_quizzes)
    published_ids = set(str(q['_id']) for q in published_quizzes)

    # Pull results for this user limited to relevant quizzes
    res_cur = current_app.db.results.find({'username': username})
    by_quiz = {}
    # Collect first attempts and distinct completed quizzes
    for r in res_cur:
        qid = str(r.get('quiz_id') or '')
        if published_ids and qid not in published_ids:
            # Ignore results for quizzes not in current classes
            continue
        created = r.get('created_at') or r.get('ts') or ''
        try:
            # Normalize possible Z timezone
            if isinstance(created, str) and created.endswith('Z'):
                created = created[:-1] + '+00:00'
            dt = datetime.fromisoformat(created)
        except Exception:
            dt = datetime.utcnow()
        entry = {
            'score': int(r.get('score') or 0),
            'total': int(r.get('total_score') or 0),
            'ts': dt
        }
        if qid not in by_quiz:
            by_quiz[qid] = []
        by_quiz[qid].append(entry)

    completed_quizzes = len([qid for qid, lst in by_quiz.items() if len(lst) > 0])

    # First attempt list
    first_attempts = []
    for qid, lst in by_quiz.items():
        if not lst:
            continue
        first = sorted(lst, key=lambda x: x['ts'])[0]
        first_attempts.append(first)

    # Pass rate (>40%) and average score
    if first_attempts:
        passed_cnt = 0
        total_sc = 0
        total_possible = 0
        for a in first_attempts:
            total_sc += a['score']
            total_possible += max(1, a['total'])
            pct = (a['score'] / max(1, a['total'])) * 100.0
            if pct > 40.0:
                passed_cnt += 1
        pass_rate = round((passed_cnt / len(first_attempts)) * 100) if first_attempts else 0
        average_score = round((total_sc / total_possible) * 100) if total_possible > 0 else 0
    else:
        pass_rate = 0
        average_score = 0

    # Completion rate (reuse shared helper for consistency with admin views)
    try:
        comp = compute_user_quiz_completion(username)
        completion_rate = comp.get('completion_rate', 0)
        # For robustness, prefer helper's total/quizzes counts if available
        total_quizzes = comp.get('total_quizzes', total_quizzes)
        completed_quizzes = comp.get('completed_quizzes', completed_quizzes)
    except Exception:
        completion_rate = round((completed_quizzes / total_quizzes) * 100) if total_quizzes > 0 else 0

    # Streak calculation (days with at least one attempt, in Shanghai TZ)
    sh_tz = pytz.timezone('Asia/Shanghai')
    attempt_days = set()
    for qid, lst in by_quiz.items():
        for e in lst:
            day = e['ts'].astimezone(sh_tz).strftime('%Y-%m-%d') if e['ts'].tzinfo else sh_tz.localize(e['ts']).strftime('%Y-%m-%d')
            attempt_days.add(day)
    # Compute consecutive streak up to today
    streak = 0
    # Walk backward from today while dates exist
    cur_day = datetime.now(sh_tz)
    while True:
        day_str = cur_day.strftime('%Y-%m-%d')
        if day_str in attempt_days:
            streak += 1
            cur_day = cur_day - timedelta(days=1)
        else:
            break

    return jsonify({
        'completion_rate': completion_rate,
        'pass_rate': pass_rate,
        'average_score': average_score,
        'streak': streak,
        'completed_quizzes': completed_quizzes,
        'total_quizzes': total_quizzes,
    }), 200


@quiz_bp.route('/api/progress/<username>', methods=['GET'])
@token_required
def user_quiz_progress(username):
    """
    Returns a list of pending quizzes for this user (assigned to their classes, published, and not yet attempted).
    Each item: { quiz_id, quiz_name, quiz_type, status: 'pending', publish_status }
    """
    cur = g.current_user
    if username != cur.get('username') and cur.get('role') != 'admin':
        return jsonify({'error': 'forbidden'}), 403

    user_doc = current_app.db.users.find_one({'username': username})
    if not user_doc:
        return jsonify({'error': 'user not found'}), 404

    class_cursor = current_app.db.classes.find({'students': user_doc.get('_id')}, {'_id': 1})
    class_ids = [c['_id'] for c in class_cursor]
    if not class_ids:
        return jsonify([]), 200

    # Quizzes available to this user
    qcur = current_app.db.quizzes.find({
        'status': 'published',
        'class_ids': {'$in': class_ids}
    }, {'_id':1,'name':1,'type':1,'status':1})
    quizzes = list(qcur)
    qids = [str(q['_id']) for q in quizzes]

    # Find quizzes already attempted by user
    res_cur = current_app.db.results.find({'username': username, 'quiz_id': {'$in': qids}})
    attempted = set(r.get('quiz_id') for r in res_cur)

    pending = []
    for q in quizzes:
        qid = str(q['_id'])
        if qid in attempted:
            continue
        pending.append({
            'quiz_id': qid,
            'quiz_name': q.get('name', 'Quiz'),
            'quiz_type': q.get('type', 'custom'),
            'status': 'pending',
            'publish_status': q.get('status', 'published')
        })
    return jsonify(pending), 200

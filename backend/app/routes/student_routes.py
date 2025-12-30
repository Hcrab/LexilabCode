from flask import Blueprint, request, jsonify, g, current_app
from bson.objectid import ObjectId
from ..decorators import token_required, admin_required
import pytz
from datetime import datetime, timedelta
import random
from werkzeug.security import generate_password_hash
import json
import time
from collections import Counter


student_bp = Blueprint('student_bp', __name__)

# --- lightweight, extensible cache for streak distribution ---
# Caches all users' current streak (ending today) values for a short TTL.
# For multi-process deployments, consider replacing with Redis or Mongo materialized view.
_streak_cache = {
    'date': None,          # 'YYYY-MM-DD' for which the cache is valid
    'computed_at': 0.0,    # epoch seconds when cache was computed
    'hist': {},            # histogram {streak_value: count}
}

def _is_cache_valid(today_str: str, ttl_seconds: int = 60) -> bool:
    try:
        if _streak_cache.get('date') != today_str:
            return False
        return (time.time() - float(_streak_cache.get('computed_at') or 0)) < ttl_seconds
    except Exception:
        return False

def _build_streak_histogram(db, today_date) -> dict:
    """Scan users to build a histogram of current streak values ending at today_date."""
    def _to_date(s):
        try:
            return datetime.strptime(s, '%Y-%m-%d').date()
        except Exception:
            return None
    hist = Counter()
    cur = db.users.find({}, {'complete_exercise_day': 1, 'complete_revision_day': 1})
    for ud in cur:
        try:
            ex = set((ud.get('complete_exercise_day') or []))
            rv = set((ud.get('complete_revision_day') or []))
            inter = ex.intersection(rv)
            ds = sorted([_to_date(s) for s in inter if _to_date(s) is not None])
            ds_set = set(ds)
            cur_s = 0
            cursor = today_date
            while cursor in ds_set:
                cur_s += 1
                cursor = cursor - timedelta(days=1)
            hist[cur_s] += 1
        except Exception:
            # treat as 0 streak if malformed
            hist[0] += 1
    return dict(hist)

def _get_streak_histogram(db, today_date, today_str, ttl_seconds: int = 60) -> dict:
    if _is_cache_valid(today_str, ttl_seconds):
        return _streak_cache.get('hist') or {}
    # rebuild
    hist = _build_streak_histogram(db, today_date)
    _streak_cache['date'] = today_str
    _streak_cache['computed_at'] = time.time()
    _streak_cache['hist'] = hist
    return hist

@student_bp.route('/api/student/dashboard-summary', methods=['GET'])
@token_required
def get_student_dashboard_summary():
    """
    Fetches the summary for the student's dashboard.
    """
    user = g.current_user
    if user.get('role') != 'user':
        return jsonify({'message': 'Students only'}), 403

    # Ensure words_mastered is always a list; also perform ghost-word cleanup
    try:
        # Refresh latest user doc for accurate cleanup
        user_db = current_app.db.users.find_one({'_id': user.get('_id')}) or {}
        words_mastered = user_db.get('words_mastered', []) or []
        to_be_mastered = user_db.get('to_be_mastered', []) or []

        # Build set of valid words from words collection
        valid_words = set(w.get('word') for w in current_app.db.words.find({}, {'word': 1}))

        def extract_word(x):
            if isinstance(x, dict):
                return x.get('word')
            return x

        # 1) Remove ghost words that don't exist in dictionary
        wm_filtered = [e for e in words_mastered if extract_word(e) in valid_words]
        tbm_filtered = [e for e in to_be_mastered if extract_word(e) in valid_words]

        # 2) Ensure no overlap between mastered and to-be-mastered
        wm_set = set(extract_word(e) for e in wm_filtered)
        tbm_dedup_cross = [e for e in tbm_filtered if extract_word(e) not in wm_set]

        # Persist only if anything changed
        if (
            len(wm_filtered) != len(words_mastered)
            or len(tbm_filtered) != len(to_be_mastered)
            or len(tbm_dedup_cross) != len(tbm_filtered)
        ):
            current_app.db.users.update_one(
                {'_id': user.get('_id')},
                {'$set': {'words_mastered': wm_filtered, 'to_be_mastered': tbm_dedup_cross}}
            )
            # Reload latest user after mutation to ensure response matches DB
            user = current_app.db.users.find_one({'_id': user.get('_id')}) or user
            words_mastered = user.get('words_mastered', []) or []
    except Exception:
        # Cleanup errors should not block dashboard
        words_mastered = user.get('words_mastered', []) or []

    # Lazy daily completion marking: if both lists are cleared, record today
    try:
        maybe_mark_daily_completion(user_id=user.get('_id'), user_doc=user)
    except Exception:
        pass

    # Build teacher-assigned split from to_be_mastered entries (robust using vocab_mission fallback)
    tbm_entries = user.get('to_be_mastered', []) or []
    # Preserve DB order when splitting
    tbm_words_in_order = []
    for e in tbm_entries:
        try:
            w = e.get('word') if isinstance(e, dict) else e
            if isinstance(w, str) and w:
                tbm_words_in_order.append(w)
        except Exception:
            continue

    teacher_words = set()
    # 1) Entries explicitly marked as teacher
    for e in tbm_entries:
        try:
            if isinstance(e, dict) and e.get('source') == 'teacher' and isinstance(e.get('word'), str):
                teacher_words.add(e.get('word'))
        except Exception:
            continue
    # 2) Fallback: vocab_mission records marked as teacher
    try:
        for m in (user.get('vocab_mission') or []):
            if isinstance(m, dict) and m.get('source') == 'teacher' and isinstance(m.get('word'), str):
                teacher_words.add(m.get('word'))
    except Exception:
        pass

    teacher_assigned = [w for w in tbm_words_in_order if w in teacher_words]
    self_assigned = [w for w in tbm_words_in_order if w not in teacher_words]

    # Study goal quick stats (lightweight; detailed stats via /api/student/study-stats)
    beijing_tz = pytz.timezone('Asia/Shanghai')
    today_str = datetime.now(beijing_tz).strftime('%Y-%m-%d')
    logs = user.get('study_logs', []) or []
    today_learned = 0
    # Secret wordbook detection: only for students bound to teacher(s).
    # Prefer unique tracked own-private wordbook; fallback to legacy title match
    secret_set = set()
    try:
        udoc = current_app.db.users.find_one({'_id': user.get('_id')}, {'tracked_wordbooks':1, 'linked_teachers':1}) or {}
        linked = udoc.get('linked_teachers') or []
        if isinstance(linked, list) and len(linked) > 0:
            tracked = [oid for oid in (udoc.get('tracked_wordbooks') or []) if oid]
            tracked_docs = list(current_app.db.wordbooks.find({'_id': {'$in': tracked}}, {'_id':1,'title':1,'creator_id':1,'accessibility':1,'entries.word':1})) if tracked else []
            own_priv = [w for w in tracked_docs if w.get('creator_id') == user.get('_id') and w.get('accessibility') == 'private']
            candidate = own_priv[0] if len(own_priv) >= 1 else current_app.db.wordbooks.find_one({'creator_id': user.get('_id'), 'accessibility': 'private', 'title': '秘制词库'}, {'entries.word': 1})
            if candidate:
                for e in (candidate.get('entries') or []):
                    if isinstance(e, dict) and isinstance(e.get('word'), str):
                        secret_set.add(e.get('word'))
    except Exception:
        pass
    secret_today_learned = 0
    has_secret = False
    secret_wordbook_completed = False
    # Whether the student is linked to any teacher
    has_teacher = False
    try:
        udoc = current_app.db.users.find_one({'_id': user.get('_id')}, {'linked_teachers': 1}) or {}
        lt = udoc.get('linked_teachers') or []
        has_teacher = isinstance(lt, list) and len(lt) > 0
    except Exception:
        has_teacher = False
    for lg in logs:
        if isinstance(lg, dict) and lg.get('date') == today_str and lg.get('type') == 'learn':
            today_learned += 1
            w = lg.get('word')
            try:
                if isinstance(w, str) and w in secret_set:
                    secret_today_learned += 1
            except Exception:
                pass
    daily_goal = user.get('learning_goal', 0) or 0
    # Goal is measured against secret wordbook if exists; else total
    goal_basis = secret_today_learned if secret_set else today_learned
    goal_today_met = daily_goal > 0 and goal_basis >= daily_goal

    # Derive has_secret and whether the secret wordbook is fully mastered
    try:
        has_secret = len(secret_set) > 0
        if has_secret:
            # Build set of mastered words
            def _extract_word(e):
                if isinstance(e, dict):
                    return e.get('word')
                return e
            wm_set = set(_extract_word(e) for e in (words_mastered or []) if _extract_word(e))
            secret_wordbook_completed = all((w in wm_set) for w in secret_set) if secret_set else False
    except Exception:
        has_secret = False
        secret_wordbook_completed = False

    return jsonify({
        'to_be_mastered': tbm_entries,
        'words_mastered': words_mastered,
        'words_mastered_count': len(words_mastered),
        'tier': user.get('tier', 'tier_3'), # Default to tier_3 if not set
        'teacher_assigned': teacher_assigned,
        'teacher_assigned_count': len(teacher_assigned),
        'self_assigned_count': len(self_assigned),
        'learning_goal': daily_goal,
        'today_learned': today_learned,
        'secret_today_learned': secret_today_learned,
        'has_secret': has_secret,
        'secret_wordbook_completed': secret_wordbook_completed,
        'goal_today_met': goal_today_met,
        'first_login': bool(user.get('first_login', True)),
        'has_teacher': has_teacher
    }), 200

@student_bp.route('/api/student/master-word', methods=['POST'])
@token_required
def master_word():
    """
    Moves a list of words from 'to_be_mastered' to 'words_mastered' for the student.
    Sets up a spaced repetition schedule for review.
    """
    data = request.get_json()
    words_to_master = data.get('words')

    if not words_to_master or not isinstance(words_to_master, list):
        return jsonify({'message': 'Missing word list in request'}), 400

    user_id = g.current_user['_id']

    # 1. Pull the words from 'to_be_mastered'
    current_app.db.users.update_one(
        {'_id': user_id},
        {'$pull': {'to_be_mastered': {'word': {'$in': words_to_master}}}}
    )

    # 2. Add the words to 'words_mastered' with a review schedule
    beijing_tz = pytz.timezone('Asia/Shanghai')
    mastery_date = datetime.now(beijing_tz)
    
    review_intervals = [1, 3, 5, 7, 15, 30, 60, 90]
    review_dates = [(mastery_date + timedelta(days=d)).strftime('%Y-%m-%d') for d in review_intervals]

    mastery_entries = [
        {
            'word': word_name,
            'date_mastered': mastery_date.strftime('%Y-%m-%d'),
            'review_date': review_dates
        }
        for word_name in words_to_master
    ]
    
    if not mastery_entries:
        return jsonify({'message': 'No words to master'}), 200

    # Use $addToSet with $each to add multiple, unique entries
    current_app.db.users.update_one(
        {'_id': user_id},
        {'$addToSet': {'words_mastered': {'$each': mastery_entries}}}
    )
    # Study logs: record learned words for today
    try:
        beijing_tz = pytz.timezone('Asia/Shanghai')
        today_str = datetime.now(beijing_tz).strftime('%Y-%m-%d')
        logs = [{'date': today_str, 'word': w, 'type': 'learn'} for w in words_to_master]
        if logs:
            current_app.db.users.update_one({'_id': user_id}, {'$push': {'study_logs': {'$each': logs}}})
    except Exception:
        pass
    # After mastering, check daily completion status
    maybe_mark_daily_completion(user_id)

    return jsonify({'message': f'Great! Mastered {len(words_to_master)} words'}), 200


@student_bp.route('/api/student/review-words', methods=['GET'])
@token_required
def get_review_words(student_doc=None):
    """
    Fetches words scheduled for review today.
    If student_doc is provided, it calculates for that student.
    Otherwise, it defaults to the current logged-in student from g.
    """
    user = student_doc if student_doc is not None else g.current_user
    
    # This function can now be called internally without a request context,
    # so we handle the case where it might be a public endpoint.
    if student_doc is None:
        if user.get('role') != 'user':
            return jsonify({'message': '仅学生可访问'}), 403

    beijing_tz = pytz.timezone('Asia/Shanghai')
    today_str = datetime.now(beijing_tz).strftime('%Y-%m-%d')

    words_mastered = user.get('words_mastered', [])
    
    review_words = []
    for word_entry in words_mastered:
        if today_str in word_entry.get('review_date', []):
            review_words.append(word_entry['word'])

    # If called as an API endpoint, return JSON. Otherwise, return the list.
    if student_doc is None:
        return jsonify(review_words), 200
    else:
        return review_words


@student_bp.route('/api/student/study-stats', methods=['GET'])
@token_required
def get_study_stats():
    """
    Returns daily study counts for the last N days (default 30),
    including learned_count, reviewed_count, and whether today's review is empty.
    Also returns current learning_goal and computed streak of days meeting the goal.
    """
    user = g.current_user
    if user.get('role') != 'user':
        return jsonify({'message': 'Students only'}), 403

    try:
        # Reload fresh user doc
        user_doc = current_app.db.users.find_one({'_id': user.get('_id')}) or {}
        logs = user_doc.get('study_logs', []) or []

        beijing_tz = pytz.timezone('Asia/Shanghai')
        today = datetime.now(beijing_tz).date()

        # Determine the first day that has any study/review log; if none, return empty
        first_date = None
        for lg in logs:
            try:
                if not isinstance(lg, dict):
                    continue
                dstr = lg.get('date')
                if not dstr:
                    continue
                dval = datetime.strptime(dstr, '%Y-%m-%d').date()
                if (first_date is None) or (dval < first_date):
                    first_date = dval
            except Exception:
                continue

        if first_date is None:
            return jsonify({
                'by_day': [],
                'today_review_done': True,
                'learning_goal': user_doc.get('learning_goal', 0) or 0,
                'goal_streak_days': 0
            }), 200

        # Build date list (ascending, oldest -> newest) from first record day to today
        days_span = (today - first_date).days
        dates = [(first_date + timedelta(days=i)).strftime('%Y-%m-%d') for i in range(0, days_span + 1)]
        # Initialize daily buckets
        counts = {d: {'date': d, 'learned': 0, 'reviewed': 0, 'learned_words': [], 'reviewed_words': [], 'review_done': False} for d in dates}

        for lg in logs:
            if not isinstance(lg, dict):
                continue
            d = lg.get('date')
            t = lg.get('type')
            if d in counts:
                if t == 'learn':
                    counts[d]['learned'] += 1
                    w = lg.get('word')
                    if isinstance(w, str) and w:
                        counts[d]['learned_words'].append(w)
                elif t == 'review':
                    counts[d]['reviewed'] += 1
                    w = lg.get('word')
                    if isinstance(w, str) and w:
                        counts[d]['reviewed_words'].append(w)

        # Build secret set if applicable (only when linked_teachers exists)
        secret_set = set()
        has_secret = False
        try:
            if isinstance(user_doc.get('linked_teachers') or [], list) and len(user_doc.get('linked_teachers') or []) > 0:
                tracked = [oid for oid in (user_doc.get('tracked_wordbooks') or []) if oid]
                tracked_docs = list(current_app.db.wordbooks.find({'_id': {'$in': tracked}}, {'_id':1,'title':1,'creator_id':1,'accessibility':1,'entries.word':1})) if tracked else []
                own_priv = [w for w in tracked_docs if w.get('creator_id') == user.get('_id') and w.get('accessibility') == 'private']
                candidate = own_priv[0] if len(own_priv) >= 1 else current_app.db.wordbooks.find_one({'creator_id': user.get('_id'), 'accessibility': 'private', 'title': '秘制词库'}, {'entries.word': 1})
                if candidate:
                    has_secret = True
                    for e in (candidate.get('entries') or []):
                        if isinstance(e, dict) and isinstance(e.get('word'), str):
                            secret_set.add(e.get('word'))
        except Exception:
            pass

        # Per-day review completion flag (based on user's completion record)
        try:
            completed_days = set((user_doc.get('complete_revision_day') or []))
            for d in dates:
                if d in completed_days:
                    counts[d]['review_done'] = True
        except Exception:
            pass

        # Today review done?
        today_review_list = get_review_words(user_doc)
        today_review_done = isinstance(today_review_list, list) and len(today_review_list) == 0

        goal = user_doc.get('learning_goal', 0) or 0
        # Compute streak up to today
        streak = 0
        if goal > 0:
            # iterate backward from today until a day fails
            for d in reversed(dates):
                basis = 0
                if has_secret:
                    try:
                        basis = len([w for w in counts[d]['learned_words'] if isinstance(w, str) and w in secret_set])
                    except Exception:
                        basis = 0
                else:
                    basis = counts[d]['learned']
                if basis >= goal:
                    streak += 1
                else:
                    break

        # Today breakdown
        today_str = today.strftime('%Y-%m-%d')
        today_total_learned = counts.get(today_str, {}).get('learned', 0)
        today_secret_learned = 0
        if has_secret:
            try:
                today_secret_learned = len([w for w in counts.get(today_str, {}).get('learned_words', []) if isinstance(w, str) and w in secret_set])
            except Exception:
                today_secret_learned = 0

        return jsonify({
            'by_day': [counts[d] for d in dates],
            'today_review_done': today_review_done,
            'learning_goal': goal,
            'goal_streak_days': streak,
            'today_total_learned': today_total_learned,
            'today_secret_learned': today_secret_learned,
            'has_secret': has_secret
        }), 200
    except Exception as e:
        current_app.logger.error(f"Error in study-stats: {e}")
        return jsonify({'message': 'Failed to get study stats', 'error': str(e)}), 500


@student_bp.route('/api/student/learning-goal', methods=['PUT'])
@token_required
def set_learning_goal():
    user = g.current_user
    if user.get('role') != 'user':
        return jsonify({'message': 'Students only'}), 403
    # If learning goal is locked by class, block changes from student side
    try:
        fresh = current_app.db.users.find_one({'_id': user.get('_id')}, {'learning_goal_locked': 1, 'learning_goal_locked_by_class': 1}) or {}
        if fresh.get('learning_goal_locked') is True or fresh.get('learning_goal_locked_by_class'):
            return jsonify({'message': 'Learning goal is managed by your class and cannot be changed by student'}), 403
    except Exception:
        pass
    data = request.get_json() or {}
    try:
        goal = int(data.get('goal', 0))
    except Exception:
        return jsonify({'message': 'Invalid goal value'}), 400
    if goal < 0 or goal > 500:
        return jsonify({'message': 'Goal must be between 0 and 500'}), 400
    current_app.db.users.update_one({'_id': user.get('_id')}, {'$set': {'learning_goal': goal}})
    return jsonify({'message': 'Learning goal updated', 'learning_goal': goal}), 200

@student_bp.route('/api/student/invitations', methods=['GET'])
@token_required
def list_invitations():
    user = g.current_user
    if user.get('role') != 'user':
        return jsonify({'message': 'Students only'}), 403
    cur = current_app.db.invitations.find({'type':'teacher_student','student_id': user.get('_id'), 'status':'pending'})
    out = []
    for inv in cur:
        teacher = current_app.db.users.find_one({'_id': inv.get('teacher_id')}, {'username':1,'nickname':1}) or {}
        out.append({
            '_id': str(inv.get('_id')),
            'teacher': {
                '_id': str(inv.get('teacher_id')),
                'username': teacher.get('username'),
                'nickname': teacher.get('nickname')
            },
            'status': inv.get('status','pending')
        })
    return jsonify(out), 200

@student_bp.route('/api/student/invitations/<invite_id>/accept', methods=['PUT'])
@token_required
def accept_invitation(invite_id):
    user = g.current_user
    if user.get('role') != 'user':
        return jsonify({'message': 'Students only'}), 403
    try:
        iid = ObjectId(invite_id)
    except Exception:
        return jsonify({'message':'Invalid invitation ID'}), 400
    inv = current_app.db.invitations.find_one({'_id': iid, 'type': 'teacher_student', 'student_id': user.get('_id'), 'status':'pending'})
    if not inv:
        return jsonify({'message':'Invitation not found or already processed'}), 404
    teacher_id = inv.get('teacher_id')
    current_app.db.users.update_one({'_id': teacher_id}, {'$addToSet': {'linked_students': user.get('_id')}})
    current_app.db.users.update_one({'_id': user.get('_id')}, {'$addToSet': {'linked_teachers': teacher_id}})
    current_app.db.invitations.update_one({'_id': iid}, {'$set': {'status':'accepted'}})
    return jsonify({'message':'Invitation accepted'}), 200

@student_bp.route('/api/student/invitations/<invite_id>/reject', methods=['PUT'])
@token_required
def reject_invitation(invite_id):
    user = g.current_user
    if user.get('role') != 'user':
        return jsonify({'message': 'Students only'}), 403
    try:
        iid = ObjectId(invite_id)
    except Exception:
        return jsonify({'message':'Invalid invitation ID'}), 400
    inv = current_app.db.invitations.find_one({'_id': iid, 'type': 'teacher_student', 'student_id': user.get('_id'), 'status':'pending'})
    if not inv:
        return jsonify({'message':'Invitation not found or already processed'}), 404
    current_app.db.invitations.update_one({'_id': iid}, {'$set': {'status':'rejected'}})
    return jsonify({'message':'Invitation declined'}), 200


@student_bp.route('/api/student/first-login', methods=['PUT'])
@token_required
def set_first_login():
    """Update the user's first_login flag. Body: { first_login: bool }"""
    user = g.current_user
    if user.get('role') != 'user':
        return jsonify({'message': 'Students only'}), 403
    data = request.get_json() or {}
    val = data.get('first_login')
    if not isinstance(val, bool):
        return jsonify({'message': 'first_login 必须是布尔值'}), 400
    current_app.db.users.update_one({'_id': user.get('_id')}, {'$set': {'first_login': val}})
    return jsonify({'message': 'first_login 已更新', 'first_login': val}), 200


@student_bp.route('/api/student/learning-preference', methods=['GET'])
@token_required
def get_learning_preference():
    """
    Returns user's learning preference, currently supports:
    - priority_wordbook_id: a wordbook to prioritize after teacher assignments
    """
    user = g.current_user
    if user.get('role') != 'user':
        return jsonify({'message': 'Students only'}), 403
    doc = current_app.db.users.find_one({'_id': user.get('_id')}, {'learning_preference': 1}) or {}
    pref = (doc.get('learning_preference') or {})
    # normalize ObjectId
    out = {}
    p = pref.get('priority_wordbook_id')
    if p:
        try:
            out['priority_wordbook_id'] = str(p)
        except Exception:
            out['priority_wordbook_id'] = p
    else:
        out['priority_wordbook_id'] = ''
    return jsonify(out), 200


@student_bp.route('/api/student/learning-preference', methods=['PUT'])
@token_required
def set_learning_preference():
    """
    Sets user's learning preference.
    Body: { priority_wordbook_id: string|null }
    """
    user = g.current_user
    if user.get('role') != 'user':
        return jsonify({'message': 'Students only'}), 403
    data = request.get_json() or {}
    wb_id = data.get('priority_wordbook_id') or ''
    pref = {}
    if wb_id:
        try:
            pref['priority_wordbook_id'] = ObjectId(wb_id)
        except Exception:
            return jsonify({'message': '无效的词库ID'}), 400
    current_app.db.users.update_one({'_id': user.get('_id')}, {'$set': {'learning_preference': pref}})

    # After saving preference, reorder the user's to_be_mastered to reflect the priority
    try:
        udoc = current_app.db.users.find_one({'_id': user.get('_id')}, {'to_be_mastered': 1, 'vocab_mission': 1}) or {}
        tbm = udoc.get('to_be_mastered', []) or []
        if not tbm:
            return jsonify({'message': '学习顺序已更新（无待掌握单词）'}), 200

        def extract_word(x):
            if isinstance(x, dict):
                return x.get('word')
            return x

        # Identify teacher-assigned words (robust: from entry.source or vocab_mission)
        teacher_words = set()
        for e in tbm:
            try:
                if isinstance(e, dict) and e.get('source') == 'teacher' and isinstance(e.get('word'), str):
                    teacher_words.add(e.get('word'))
            except Exception:
                continue
        try:
            for m in (udoc.get('vocab_mission') or []):
                if isinstance(m, dict) and m.get('source') == 'teacher' and isinstance(m.get('word'), str):
                    teacher_words.add(m.get('word'))
        except Exception:
            pass

        # Priority wordbook words (if provided and accessible)
        priority_words = []
        if pref.get('priority_wordbook_id'):
            try:
                wb = current_app.db.wordbooks.find_one(
                    {
                        '_id': pref.get('priority_wordbook_id'),
                        '$or': [
                            {'accessibility': 'public'},
                            {'creator_id': user.get('_id')},
                            {'accessibility': {'$exists': False}}
                        ]
                    },
                    {'entries.word': 1, 'entries.number': 1}
                )
                if wb:
                    entries = wb.get('entries') or []
                    entries_sorted = sorted(entries, key=lambda e: e.get('number', 0))
                    priority_words = [e.get('word') for e in entries_sorted if isinstance(e, dict) and isinstance(e.get('word'), str)]
            except Exception:
                pass
        priority_set = set(priority_words)

        # Stable grouping with original order preserved
        indexed = [(i, e, extract_word(e)) for i, e in enumerate(tbm)]
        top_teacher = []
        top_priority = []
        rest = []
        used = set()
        # 1) teacher first
        for i, e, w in indexed:
            if isinstance(w, str) and w in teacher_words:
                top_teacher.append((i, e))
                used.add(i)
        # 2) priority wordbook next (excluding teacher and duplicates)
        for i, e, w in indexed:
            if i in used:
                continue
            if isinstance(w, str) and w in priority_set:
                top_priority.append((i, e))
                used.add(i)
        # 3) others
        for i, e, w in indexed:
            if i in used:
                continue
            rest.append((i, e))

        new_tbm = [e for _, e in (top_teacher + top_priority + rest)]
        current_app.db.users.update_one({'_id': user.get('_id')}, {'$set': {'to_be_mastered': new_tbm}})
    except Exception as e:
        current_app.logger.error(f"Error reordering to_be_mastered: {e}")

    return jsonify({'message': '学习顺序已更新'}), 200


def maybe_mark_daily_completion(user_id, user_doc=None):
    """
    If both today's to_be_mastered and review list are cleared (size == 0),
    append today's date into complete_exercise_day and complete_revision_day.
    Uses $addToSet; safe to call multiple times.
    """
    try:
        user = user_doc or current_app.db.users.find_one({'_id': user_id})
        if not user:
            return
        tbm_empty = len(user.get('to_be_mastered', []) or []) == 0
        review_list = get_review_words(user)
        rvw_empty = len(review_list or []) == 0
        if tbm_empty and rvw_empty:
            beijing_tz = pytz.timezone('Asia/Shanghai')
            today_str = datetime.now(beijing_tz).strftime('%Y-%m-%d')
            # Add completion flags for exercise and revision (idempotent)
            current_app.db.users.update_one(
                {'_id': user_id},
                {'$addToSet': {
                    'complete_exercise_day': today_str,
                    'complete_revision_day': today_str
                }}
            )
            # Also snapshot the learning goal for this date
            try:
                goal_val = int((user or {}).get('learning_goal') or 0)
            except Exception:
                goal_val = 0
            try:
                # ensure array exists
                current_app.db.users.update_one({'_id': user_id, 'daily_goal_records': {'$exists': False}}, {'$set': {'daily_goal_records': []}})
            except Exception:
                pass
            try:
                # remove existing record for today to avoid duplicates, then push new snapshot
                current_app.db.users.update_one({'_id': user_id}, {'$pull': {'daily_goal_records': {'date': today_str}}})
                current_app.db.users.update_one({'_id': user_id}, {'$push': {'daily_goal_records': {'date': today_str, 'goal': goal_val}}})
            except Exception:
                pass
    except Exception:
        pass


@student_bp.route('/api/student/stats', methods=['GET'])
@token_required
def get_student_compact_stats():
    """
    Unified stats endpoint for dashboard status panel.
    Computes today's completion, current streak (consecutive days), max streak over history,
    and a percentile vs other users based on current streak.
    Streak is defined as days when both complete_exercise_day and complete_revision_day contain the date.
    """
    user = g.current_user
    if user.get('role') != 'user':
        return jsonify({'message': 'Students only'}), 403

    try:
        user_doc = current_app.db.users.find_one({'_id': user.get('_id')}, {
            'complete_exercise_day': 1,
            'complete_revision_day': 1,
            'learning_goal': 1,
            'study_logs': 1,
            'daily_goal_records': 1
        }) or {}

        beijing_tz = pytz.timezone('Asia/Shanghai')
        today = datetime.now(beijing_tz).date()
        today_str = today.strftime('%Y-%m-%d')

        ex_days = set((user_doc.get('complete_exercise_day') or []))
        rv_days = set((user_doc.get('complete_revision_day') or []))
        both_days = sorted(list(ex_days.intersection(rv_days)))

        # Compute current streak up to today
        def _to_date(s):
            try:
                return datetime.strptime(s, '%Y-%m-%d').date()
            except Exception:
                return None

        both_dates = [d for d in (_to_date(s) for s in both_days) if d is not None]
        both_dates.sort()

        # max streak across history
        max_streak = 0
        cur_run = 0
        prev = None
        for d in both_dates:
            if prev is None or (d - prev).days == 1:
                cur_run += 1
            else:
                cur_run = 1
            max_streak = max(max_streak, cur_run)
            prev = d

        # current streak ending today
        current_streak = 0
        cursor = today
        days_set = set(both_dates)
        while cursor in days_set:
            current_streak += 1
            cursor = cursor - timedelta(days=1)

        today_achieved = (today in days_set)

        # Today's learned count (from logs) and today's goal snapshot if exists
        today_learned = 0
        for lg in (user_doc.get('study_logs') or []):
            try:
                if isinstance(lg, dict) and lg.get('type') == 'learn' and lg.get('date') == today_str:
                    today_learned += 1
            except Exception:
                pass

        today_goal = None
        try:
            for rec in (user_doc.get('daily_goal_records') or []):
                if isinstance(rec, dict) and rec.get('date') == today_str:
                    today_goal = int(rec.get('goal') or 0)
                    break
        except Exception:
            today_goal = None
        if today_goal is None:
            try:
                today_goal = int(user_doc.get('learning_goal') or 0)
            except Exception:
                today_goal = 0

        # Percentile: proportion of users with current_streak less than this user's
        # Percentile with lightweight cache: build histogram once per TTL
        try:
            hist = _get_streak_histogram(current_app.db, today, today_str, ttl_seconds=60)
            total = sum(hist.values()) or 0
            below = sum(cnt for streak_val, cnt in hist.items() if (streak_val or 0) < current_streak)
            better_than_pct = int((below * 100) / total) if total > 0 else 0
        except Exception:
            better_than_pct = 0

        return jsonify({
            'goal_today_met': bool(today_achieved),
            'current_streak_days': int(current_streak),
            'max_streak_days': int(max_streak),
            'better_than_pct': int(better_than_pct),
            'today_learned': int(today_learned),
            'today_goal': int(today_goal)
        }), 200
    except Exception as e:
        current_app.logger.error(f"Error in compact stats: {e}")
        return jsonify({'message': '获取统计失败', 'error': str(e)}), 500


@student_bp.route('/api/student/update-word-review', methods=['POST'])
@token_required
def update_word_review():
    """
    Updates a single word's review status based on the result.
    - 'pass': Pre-test passed. Increment review_times, remove today's review date.
    - 'fail': Pre-test failed and re-learned. Remove today's date, add tomorrow's.
    """
    data = request.get_json()
    word_to_update = data.get('word')
    result = data.get('result') # "pass" or "fail"

    if not word_to_update or result not in ['pass', 'fail']:
        return jsonify({'message': '请求中缺少单词或无效的结果'}), 400

    user_id = g.current_user['_id']
    
    beijing_tz = pytz.timezone('Asia/Shanghai')
    today = datetime.now(beijing_tz)
    today_str = today.strftime('%Y-%m-%d')
    
    update_query = {}
    
    if result == 'pass':
        # Pre-test passed: increment review count and remove today's review date.
        update_query = {
            '$inc': {'words_mastered.$.review_times': 1},
            '$pull': {'words_mastered.$.review_date': today_str}
        }
    elif result == 'fail':
        # Pre-test failed, re-learned: remove today's date and add tomorrow's.
        tomorrow_str = (today + timedelta(days=1)).strftime('%Y-%m-%d')
        update_query = {
            '$pull': {'words_mastered.$.review_date': today_str},
            '$addToSet': {'words_mastered.$.review_date': tomorrow_str}
        }

    # Use the positional operator `$` to update the correct element in the array
    db_result = current_app.db.users.update_one(
        {'_id': user_id, 'words_mastered.word': word_to_update},
        update_query
    )

    if db_result.matched_count == 0:
        return jsonify({'message': '在用户的掌握列表中未找到该单词'}), 404
        
    if db_result.modified_count == 0:
        # This can happen if the date was already removed, which is not a critical error.
        return jsonify({'message': '单词状态已是最新，无需更新'}), 200

    # After review update, check daily completion status
    maybe_mark_daily_completion(user_id)

    # Append review study log (one entry per update)
    try:
        beijing_tz = pytz.timezone('Asia/Shanghai')
        today_str = datetime.now(beijing_tz).strftime('%Y-%m-%d')
        current_app.db.users.update_one({'_id': user_id}, {'$push': {'study_logs': {'date': today_str, 'word': word_to_update, 'type': 'review'}}})
    except Exception:
        pass

    return jsonify({'message': f'单词 {word_to_update} 复习状态更新成功'}), 200


@student_bp.route('/api/student/word/cleanup', methods=['DELETE'])
@token_required
def cleanup_student_word():
    """
    Removes a non-existent word from all students' learning lists.
    """
    data = request.get_json()
    word_to_remove = data.get('word')

    if not word_to_remove:
        return jsonify({'message': '请求中缺少单词'}), 400

    # Pull the ghost word from all users' lists.
    result = current_app.db.users.update_many(
        {},  # Empty filter to apply to all users
        {
            '$pull': {
                'to_be_mastered': {'word': word_to_remove},
                'words_mastered': {'word': word_to_remove}
            }
        }
    )
    
    return jsonify({'message': f'全局清理成功，影响了 {result.modified_count} 个用户。'}), 200


@student_bp.route('/api/student/practice-session', methods=['POST'])
@token_required
def get_practice_session_data():
    """
    Fetches tailored exercise data for a list of words based on a specified tier.
    """
    data = request.get_json()
    word_list = data.get('word_list')
    tier = data.get('tier')

    if not word_list or not tier:
        return jsonify({'message': '请求中缺少 word_list 或 tier'}), 400
    
    if tier not in ['tier_1', 'tier_2', 'tier_3']:
        return jsonify({'message': '无效的 tier'}), 400

    try:
        # Fetch word documents including the 'word_root' field
        words_cursor = current_app.db.words.find(
            {'word': {'$in': word_list}},
            {'word': 1, 'definition_cn': 1, 'definition_en': 1, 'pos': 1, 'sample_sentences': 1, 'exercises': 1, 'word_root': 1}
        )

        session_data = []
        for word_doc in words_cursor:
            # Basic word info with safe defaults
            word_data = {
                'word': word_doc.get('word', ''),
                'word_root': word_doc.get('word_root') or '',  # ensure string
                'definition_cn': word_doc.get('definition_cn') or '',
                'definition_en': word_doc.get('definition_en') or '',
                'pos': word_doc.get('pos') or '',
                'sample_sentences': word_doc.get('sample_sentences') or [],
                'exercises': []
            }

            # Robustly coerce exercises to a list
            raw_exercises = word_doc.get('exercises')
            if not isinstance(raw_exercises, list):
                raw_exercises = []

            # Filter exercises based on the selected tier
            for exercise in raw_exercises:
                try:
                    exercise_type = (exercise or {}).get('type')
                    tiered_exercise = {}

                    if exercise_type == 'infer_meaning':
                        tiered_exercise = {
                            'type': 'infer_meaning',
                            'sentence': (exercise.get('sentences') or {}).get(tier),
                            'options_type': (exercise.get('options_type') or {}).get(tier)
                        }
                    elif exercise_type == 'sentence_reordering':
                        tiered_exercise = {
                            'type': 'sentence_reordering',
                            'sentence_answer': (exercise.get('sentence_answer') or {}).get(tier),
                            'sentence_answer_cn': (exercise.get('sentence_answer_cn') or {}).get(tier)
                        }
                    elif exercise_type == 'synonym_replacement':
                        tiered_exercise = {
                            'type': 'synonym_replacement',
                            'sentence': (exercise.get('sentence') or {}).get(tier)
                        }

                    # keep only non-empty tiered payloads
                    if isinstance(tiered_exercise, dict) and any(v for v in tiered_exercise.values()):
                        word_data['exercises'].append(tiered_exercise)
                except Exception:
                    # Skip malformed exercise entries
                    continue

            session_data.append(word_data)

        return jsonify(session_data), 200

    except Exception as e:
        current_app.logger.error(f"Error in practice-session: {e}")
        return jsonify({'message': '获取练习数据时发生错误', 'error': str(e)}), 500


@student_bp.route('/api/student/assign-words', methods=['POST'])
@token_required
def assign_words_to_self():
    """
    Allows the current student to add a list of words to their own to_be_mastered list.
    Skips words that are already in to_be_mastered or words_mastered.
    Request: { words: [string] }
    """
    data = request.get_json() or {}
    words = data.get('words') or []
    if not isinstance(words, list) or not words:
        return jsonify({'message': '请求中缺少单词列表'}), 400

    user = g.current_user
    if user.get('role') != 'user':
        return jsonify({'message': '仅学生可访问'}), 403

    try:
        # Refresh the latest user doc to avoid stale g.current_user
        user_doc = current_app.db.users.find_one({'_id': user.get('_id')}, {'to_be_mastered.word': 1, 'words_mastered.word': 1}) or {}
        existing = set()
        for e in (user_doc.get('to_be_mastered') or []):
            w = e.get('word') if isinstance(e, dict) else e
            if isinstance(w, str):
                existing.add(w)
        for e in (user_doc.get('words_mastered') or []):
            w = e.get('word') if isinstance(e, dict) else e
            if isinstance(w, str):
                existing.add(w)

        # Filter out existing
        to_add_words = [w for w in words if isinstance(w, str) and w and w not in existing]
        if not to_add_words:
            return jsonify({'message': '没有可添加的新单词', 'added': 0}), 200

        beijing_tz = pytz.timezone('Asia/Shanghai')
        now_in_beijing = datetime.now(beijing_tz)
        assigned_date = now_in_beijing.strftime('%Y-%m-%d')
        due_date = (now_in_beijing + timedelta(days=1)).strftime('%Y-%m-%d')

        entries = [{'word': w, 'assigned_date': assigned_date, 'due_date': due_date, 'source': 'student'} for w in to_add_words]

        current_app.db.users.update_one({'_id': user.get('_id')}, {'$addToSet': {'to_be_mastered': {'$each': entries}}})

        # Record vocab mission (unique by word)
        try:
            existing_missions = current_app.db.users.find_one({'_id': user.get('_id')}, {'vocab_mission.word': 1}) or {}
            existed = set()
            for m in (existing_missions.get('vocab_mission') or []):
                w = m.get('word') if isinstance(m, dict) else None
                if w:
                    existed.add(w)
            new_entries = [{'word': w, 'assigned_date': assigned_date, 'source': 'student'} for w in to_add_words if w not in existed]
            if new_entries:
                current_app.db.users.update_one({'_id': user.get('_id')}, {'$push': {'vocab_mission': {'$each': new_entries}}})
        except Exception:
            pass

        return jsonify({'message': f'成功加入 {len(entries)} 个单词到待掌握列表', 'added': len(entries), 'words': to_add_words}), 200
    except Exception as e:
        current_app.logger.error(f"Error assigning words to self: {e}")
        return jsonify({'message': '加入单词失败', 'error': str(e)}), 500


@student_bp.route('/api/student/submissions', methods=['GET'])
@token_required
def get_student_submissions():
    # Removed: assignment submission history not supported in simplified app
    return jsonify([]), 200



@student_bp.route('/api/student/classes', methods=['GET'])
@token_required
def get_student_classes():
    """
    Returns a list of classes the current student belongs to.
    """
    user = g.current_user
    if user.get('role') != 'user':
        return jsonify({'message': '仅学生可访问'}), 403

    try:
        classes = list(current_app.db.classes.find({'students': user.get('_id')}, {'_id': 1, 'name': 1}))
        for c in classes:
            c['_id'] = str(c['_id'])
        return jsonify(classes), 200
    except Exception as e:
        current_app.logger.error(f"Error fetching student classes: {e}")
        return jsonify({'message': '获取学生班级失败', 'error': str(e)}), 500


@student_bp.route('/api/student/submissions/cleanup-ghosts', methods=['DELETE'])
@token_required
def cleanup_ghost_submissions():
    """
    Deletes submissions of the current student whose linked assignment no longer exists.
    """
    user = g.current_user
    if user.get('role') != 'user':
        return jsonify({'message': '仅学生可访问'}), 403

    try:
        # Collect all assignment_ids from this student's submissions
        subs = list(current_app.db.submissions.find({'student_id': user.get('_id')}, {'assignment_id': 1}))
        assignment_ids = list({s['assignment_id'] for s in subs if s.get('assignment_id')})
        if not assignment_ids:
            return jsonify({'message': '没有可清理的提交', 'deleted_count': 0}), 200

        # Find which assignment_ids still exist
        existing = set(a['_id'] for a in current_app.db.assignments.find({'_id': {'$in': assignment_ids}}, {'_id': 1}))
        ghost_ids = [aid for aid in assignment_ids if aid not in existing]

        if not ghost_ids:
            return jsonify({'message': '未发现幽灵测验', 'deleted_count': 0}), 200

        # Delete submissions that reference ghost assignments
        result = current_app.db.submissions.delete_many({'student_id': user.get('_id'), 'assignment_id': {'$in': ghost_ids}})
        return jsonify({'message': '已清理幽灵测验提交', 'deleted_count': result.deleted_count}), 200
    except Exception as e:
        current_app.logger.error(f"Error cleaning ghost submissions: {e}")
        return jsonify({'message': '清理幽灵测验提交失败', 'error': str(e)}), 500


@student_bp.route('/api/student/words/cleanup-duplicates', methods=['POST'])
@token_required
def cleanup_duplicate_words():
    """
    Finds and removes duplicate words from a student's lists, keeping the last entry.
    """
    user_id = g.current_user['_id']
    user = current_app.db.users.find_one({'_id': user_id})

    if not user:
        return jsonify({'message': 'User not found'}), 404

    words_to_check = [
        ('to_be_mastered', user.get('to_be_mastered', [])),
        ('words_mastered', user.get('words_mastered', []))
    ]
    
    total_removed_count = 0
    
    for list_name, word_list in words_to_check:
        if not word_list:
            continue

        seen = {}
        indices_to_keep = []
        
        # Iterate backwards to easily find the last occurrence
        for i in range(len(word_list) - 1, -1, -1):
            entry = word_list[i]
            word_name = entry.get('word')
            if word_name not in seen:
                seen[word_name] = True
                indices_to_keep.append(i)
        
        # The list of items to keep is the reverse of indices_to_keep
        # because we iterated backwards
        indices_to_keep.reverse()
        
        original_count = len(word_list)
        if len(indices_to_keep) < original_count:
            # Duplicates were found
            cleaned_list = [word_list[i] for i in indices_to_keep]
            
            current_app.db.users.update_one(
                {'_id': user_id},
                {'$set': {list_name: cleaned_list}}
            )
            total_removed_count += original_count - len(cleaned_list)

    if total_removed_count > 0:
        return jsonify({
            'message': f'Removed {total_removed_count} duplicate words.',
            'removed_count': total_removed_count
        }), 200
    else:
        return jsonify({'message': 'No duplicate words found.'}), 200

@student_bp.route('/api/students/<student_id>/details', methods=['GET'])
@admin_required
def get_student_details(student_id):
    """
    Fetches detailed information for a single student.
    """
    try:
        student_object_id = ObjectId(student_id)
    except Exception:
        return jsonify({'message': '无效的学生ID格式'}), 400

    student = current_app.db.users.find_one(
        {'_id': student_object_id, 'role': 'user'},
        {'password': 0}
    )

    if not student:
        return jsonify({'message': '未找到指定学生'}), 404

    # Convert any ObjectId values (nested) to strings to avoid JSON errors
    def _sanitize(obj):
        from bson.objectid import ObjectId as _OID
        if isinstance(obj, dict):
            out = {}
            for k, v in obj.items():
                out[k] = _sanitize(v)
            return out
        if isinstance(obj, list):
            return [_sanitize(x) for x in obj]
        if isinstance(obj, tuple):
            return tuple(_sanitize(x) for x in obj)
        if isinstance(obj, set):
            return [_sanitize(x) for x in obj]
        try:
            if isinstance(obj, _OID):
                return str(obj)
        except Exception:
            pass
        return obj

    student = _sanitize(student)
    student['_id'] = str(student['_id'])
    return jsonify(student), 200


@student_bp.route('/api/students/<student_id>/tier', methods=['PUT'])
@admin_required
def update_student_tier(student_id):
    """
    Updates the tier for a specific student.
    """
    data = request.get_json()
    new_tier = data.get('tier')

    if not new_tier or new_tier not in ['tier_1', 'tier_2', 'tier_3']:
        return jsonify({'message': '无效的层级'}), 400

    try:
        student_object_id = ObjectId(student_id)
    except Exception:
        return jsonify({'message': '无效的学生ID格式'}), 400

    result = current_app.db.users.update_one(
        {'_id': student_object_id, 'role': 'user'},
        {'$set': {'tier': new_tier}}
    )

    if result.matched_count == 0:
        return jsonify({'message': '未找到指定学生'}), 404

    return jsonify({'message': '学生层级更新成功'}), 200

@student_bp.route('/api/users/students', methods=['GET'])
@admin_required
def get_all_students():
    """
    Fetches all users with the 'user' role who are not assigned to any class.
    """
    try:
        # 1. Find all unique student IDs that are part of any class
        pipeline = [
            {'$unwind': '$students'},
            {'$group': {'_id': None, 'all_students_in_classes': {'$addToSet': '$students'}}}
        ]
        result = list(current_app.db.classes.aggregate(pipeline))
        
        student_ids_in_any_class = []
        if result:
            student_ids_in_any_class = result[0].get('all_students_in_classes', [])

        # 2. Query for students who are not in the list of students already in a class
        query = {
            'role': 'user',
            '_id': {'$nin': student_ids_in_any_class}
        }

        students = list(current_app.db.users.find(query, {'_id': 1, 'username': 1, 'nickname': 1}))
        for student in students:
            student['_id'] = str(student['_id'])
            
        return jsonify(students), 200
        
    except Exception as e:
        current_app.logger.error(f"Error fetching unassigned students: {e}")
        return jsonify({'message': '获取学生列表时发生错误', 'error': str(e)}), 500

@student_bp.route('/api/users/create-student', methods=['POST'])
@admin_required
def create_student():
    """
    Creates a new student user.
    """
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    nickname = data.get('nickname') # Optional

    if not username or not password:
        return jsonify({'message': '请求中缺少用户名或密码'}), 400

    if current_app.db.users.find_one({'username': username}):
        return jsonify({'message': '用户名已存在'}), 409

    new_student = {
        'username': username,
        'password': generate_password_hash(password),
        'role': 'user',
        'tier': 'tier_3',
        'ai_calls': 0,
        'words_mastered': [],
        'to_be_mastered': []
    }
    
    if nickname:
        new_student['nickname'] = nickname

    try:
        result = current_app.db.users.insert_one(new_student)
        created_user = {
            '_id': str(result.inserted_id),
            'username': username,
        }
        if nickname:
            created_user['nickname'] = nickname
            
        return jsonify(created_user), 201
    except Exception as e:
        return jsonify({'message': '创建学生时发生错误', 'error': str(e)}), 500

@student_bp.route('/api/students/<student_id>/assignments', methods=['GET'])
@admin_required
def get_student_assignment_status(student_id):
    # Removed: assignment status per student not supported in simplified app
    return jsonify([]), 200


@student_bp.route('/api/student/wordbooks', methods=['GET'])
@token_required
def list_wordbooks_for_student():
    """
    Public wordbook list for students to choose from.
    Returns minimal fields: _id, title, description.
    """
    user = g.current_user
    if user.get('role') != 'user':
        return jsonify({'message': '仅学生可访问'}), 403
    try:
        # Auto-deduplicate student's private wordbooks by title: keep newest, delete others
        priv = list(current_app.db.wordbooks.find({'creator_id': user.get('_id'), 'accessibility': 'private'}, {'_id':1,'title':1}))
        groups = {}
        for b in priv:
            t = (b.get('title') or '').strip()
            groups.setdefault(t, []).append(b)
        to_delete = []
        title_keep_map = {}
        deleted_to_kept = {}
        from bson.objectid import ObjectId as _OID
        for t, lst in groups.items():
            if not t or len(lst) <= 1:
                continue
            # Keep the newest by ObjectId
            lst_sorted = sorted(lst, key=lambda x: x['_id'])
            keep = lst_sorted[-1]['_id']
            title_keep_map[t] = keep
            for x in lst_sorted[:-1]:
                to_delete.append(x['_id'])
                deleted_to_kept[x['_id']] = keep
        if to_delete:
            current_app.db.wordbooks.delete_many({'_id': {'$in': to_delete}})
            # Clean up tracked_wordbooks to only existing and map to kept if necessary
            udoc = current_app.db.users.find_one({'_id': user.get('_id')}, {'tracked_wordbooks':1}) or {}
            tracked = [oid for oid in (udoc.get('tracked_wordbooks') or []) if oid]
            # Remove non-existing and remap deleted to kept per title if possible
            existing_ids = set(x['_id'] for x in current_app.db.wordbooks.find({'_id': {'$in': tracked}}, {'_id':1}))
            new_tracked = []
            added = set()
            for oid in tracked:
                if oid in existing_ids:
                    new_tracked.append(oid)
                    added.add(oid)
                elif oid in deleted_to_kept:
                    kept_id = deleted_to_kept[oid]
                    if kept_id not in added:
                        new_tracked.append(kept_id)
                        added.add(kept_id)
            current_app.db.users.update_one({'_id': user.get('_id')}, {'$set': {'tracked_wordbooks': new_tracked}})

        # Show only public books or student's own private books
        books = list(current_app.db.wordbooks.find(
            {
                '$or': [
                    {'accessibility': 'public'},
                    {'creator_id': user.get('_id')},
                    {'accessibility': {'$exists': False}}  # backward compatible: treat as public
                ]
            },
            {'_id': 1, 'title': 1, 'description': 1, 'accessibility': 1}
        ))
        for b in books:
            b['_id'] = str(b['_id'])
        return jsonify(books), 200
    except Exception as e:
        current_app.logger.error(f"Error listing wordbooks for student: {e}")
        return jsonify({'message': '获取词库失败', 'error': str(e)}), 500


@student_bp.route('/api/student/wordbooks/<wordbook_id>/assign', methods=['POST'])
@token_required
def assign_from_wordbook(wordbook_id):
    """
    Assign up to `count` new words from the specified wordbook to the student's to_be_mastered list.
    Excludes any words already in to_be_mastered or words_mastered, and words not existing in the words collection.
    Body: { count: number } (default 10)
    """
    user = g.current_user
    if user.get('role') != 'user':
        return jsonify({'message': '仅学生可访问'}), 403

    try:
        try:
            wb_oid = ObjectId(wordbook_id)
        except Exception:
            return jsonify({'message': '无效的词库ID格式'}), 400

        body = request.get_json(silent=True) or {}
        count = body.get('count', 10)
        try:
            count = int(count)
        except Exception:
            count = 10
        if count <= 0:
            return jsonify({'message': 'count 必须为正整数'}), 400

        # Enforce access: public or own private (or missing accessibility treated as public)
        wb = current_app.db.wordbooks.find_one(
            {
                '_id': wb_oid,
                '$or': [
                    {'accessibility': 'public'},
                    {'creator_id': user.get('_id')},
                    {'accessibility': {'$exists': False}}
                ]
            },
            {'entries': 1, 'title': 1}
        )
        if not wb:
            return jsonify({'message': '未找到指定词库'}), 404

        # Build exclusion set from user's current lists
        user_doc = current_app.db.users.find_one({'_id': user.get('_id')}, {'to_be_mastered.word': 1, 'words_mastered.word': 1}) or {}
        existing = set()
        for e in (user_doc.get('to_be_mastered') or []):
            w = e.get('word') if isinstance(e, dict) else e
            if isinstance(w, str):
                existing.add(w)
        for e in (user_doc.get('words_mastered') or []):
            w = e.get('word') if isinstance(e, dict) else e
            if isinstance(w, str):
                existing.add(w)

        # Valid words from words collection
        valid_words = set(doc.get('word') for doc in current_app.db.words.find({}, {'word': 1}) if doc.get('word'))

        entries = wb.get('entries') or []
        # Build eligible pool then randomly sample n words
        pool = []
        seen_pool = set()
        for e in entries:
            w = e.get('word') if isinstance(e, dict) else None
            if not w or w in seen_pool:
                continue
            if w in existing:
                continue
            if w not in valid_words:
                continue
            seen_pool.add(w)
            pool.append(w)

        if pool:
            if len(pool) > count:
                candidates = random.sample(pool, count)
            else:
                candidates = list(pool)
        else:
            candidates = []

        if not candidates:
            return jsonify({'message': '该词库中没有可添加的新单词', 'added': 0, 'words': []}), 200

        # Assign selected words into to_be_mastered
        beijing_tz = pytz.timezone('Asia/Shanghai')
        now_in_beijing = datetime.now(beijing_tz)
        assigned_date = now_in_beijing.strftime('%Y-%m-%d')
        due_date = (now_in_beijing + timedelta(days=1)).strftime('%Y-%m-%d')
        entries_to_add = [{'word': w, 'assigned_date': assigned_date, 'due_date': due_date, 'source': 'student'} for w in candidates]

        current_app.db.users.update_one({'_id': user.get('_id')}, {'$addToSet': {'to_be_mastered': {'$each': entries_to_add}}})

        # Record vocab mission (unique by word)
        try:
            existing_missions = current_app.db.users.find_one({'_id': user.get('_id')}, {'vocab_mission.word': 1}) or {}
            existed = set()
            for m in (existing_missions.get('vocab_mission') or []):
                w = m.get('word') if isinstance(m, dict) else None
                if w:
                    existed.add(w)
            new_entries = [{'word': w, 'assigned_date': assigned_date, 'source': 'student'} for w in candidates if w not in existed]
            if new_entries:
                current_app.db.users.update_one({'_id': user.get('_id')}, {'$push': {'vocab_mission': {'$each': new_entries}}})
        except Exception:
            pass

        # Reorder to_be_mastered: put newly added candidates to the very front (preserve original order), then the rest
        try:
            udoc = current_app.db.users.find_one({'_id': user.get('_id')}, {'to_be_mastered': 1}) or {}
            tbm = udoc.get('to_be_mastered', []) or []
            if tbm:
                can_set = set(candidates)
                def wof(x):
                    if isinstance(x, dict):
                        return x.get('word')
                    return x
                # Keep order: first the newly added in the order of candidates, then others in their original order
                by_word = {}
                for e in tbm:
                    try:
                        by_word[wof(e)] = e
                    except Exception:
                        continue
                new_front = [by_word.get(w) for w in candidates if w in by_word]
                rest = [e for e in tbm if wof(e) not in can_set]
                new_tbm = [e for e in new_front if e is not None] + rest
                current_app.db.users.update_one({'_id': user.get('_id')}, {'$set': {'to_be_mastered': new_tbm}})
        except Exception:
            pass

        return jsonify({'message': f"成功加入 {len(entries_to_add)} 个单词到待掌握列表", 'added': len(entries_to_add), 'words': candidates, 'wordbook_title': wb.get('title', '')}), 200
    except Exception as e:
        current_app.logger.error(f"Error assigning from wordbook: {e}")
        return jsonify({'message': '从词库分配单词失败', 'error': str(e)}), 500


@student_bp.route('/api/student/wordbooks/<wordbook_id>/preview', methods=['GET'])
@token_required
def preview_from_wordbook(wordbook_id):
    """
    Preview up to `count` new words from the specified wordbook for the student, without assigning.
    Query param: count (default 10)
    Uses the same filtering rules as assign_from_wordbook.
    """
    user = g.current_user
    if user.get('role') != 'user':
        return jsonify({'message': '仅学生可访问'}), 403

    try:
        try:
            wb_oid = ObjectId(wordbook_id)
        except Exception:
            return jsonify({'message': '无效的词库ID格式'}), 400

        # parse count
        count_param = request.args.get('count', '10')
        try:
            count = int(count_param)
        except Exception:
            count = 10
        if count <= 0:
            return jsonify({'message': 'count 必须为正整数'}), 400

        wb = current_app.db.wordbooks.find_one(
            {
                '_id': wb_oid,
                '$or': [
                    {'accessibility': 'public'},
                    {'creator_id': user.get('_id')},
                    {'accessibility': {'$exists': False}}
                ]
            },
            {'entries': 1, 'title': 1}
        )
        if not wb:
            return jsonify({'message': '未找到指定词库'}), 404

        # Exclusion set from current user lists
        user_doc = current_app.db.users.find_one({'_id': user.get('_id')}, {'to_be_mastered.word': 1, 'words_mastered.word': 1}) or {}
        existing = set()
        for e in (user_doc.get('to_be_mastered') or []):
            w = e.get('word') if isinstance(e, dict) else e
            if isinstance(w, str):
                existing.add(w)
        for e in (user_doc.get('words_mastered') or []):
            w = e.get('word') if isinstance(e, dict) else e
            if isinstance(w, str):
                existing.add(w)

        # Valid words from words collection
        valid_words = set(doc.get('word') for doc in current_app.db.words.find({}, {'word': 1}) if doc.get('word'))

        entries = wb.get('entries') or []
        # Build eligible pool then randomly sample n words for preview
        pool = []
        seen_pool = set()
        for e in entries:
            w = e.get('word') if isinstance(e, dict) else None
            if not w or w in seen_pool:
                continue
            if w in existing:
                continue
            if w not in valid_words:
                continue
            seen_pool.add(w)
            pool.append(w)
        if pool:
            if len(pool) > count:
                sampled = random.sample(pool, count)
            else:
                sampled = list(pool)
        else:
            sampled = []

        return jsonify({'count': len(sampled), 'words': sampled, 'wordbook_title': wb.get('title', '')}), 200
    except Exception as e:
        current_app.logger.error(f"Error previewing from wordbook: {e}")
        return jsonify({'message': '预览词库失败', 'error': str(e)}), 500


@student_bp.route('/api/student/learning-plan', methods=['POST'])
@token_required
def build_learning_plan():
    """
    Compose a learning plan for the current student given a wordbook and a target count.
    Priority: student's to_be_mastered (teacher-assigned first), then supplement from the specified wordbook.
    Body: { wordbook_id: string, count: number }
    Returns: { words: [string], base_count: number, supplement_count: number, wordbook_title: string }
    """
    user = g.current_user
    if user.get('role') != 'user':
        return jsonify({'message': '仅学生可访问'}), 403
    data = request.get_json(silent=True) or {}
    wb_id = data.get('wordbook_id') or ''
    try:
        wb_oid = ObjectId(wb_id)
    except Exception:
        return jsonify({'message': '无效的词库ID格式'}), 400
    try:
        count = int(data.get('count', 10))
    except Exception:
        count = 10
    if count <= 0:
        return jsonify({'message': 'count 必须为正整数'}), 400

    try:
        # Reload latest user doc to avoid stale g.current_user
        user_doc = current_app.db.users.find_one({'_id': user.get('_id')}) or {}

        # 1) Build base list from to_be_mastered (teacher first)
        tbm_entries = (user_doc.get('to_be_mastered') or [])
        teacher_words = set()
        for e in tbm_entries:
            try:
                if isinstance(e, dict) and e.get('source') == 'teacher' and isinstance(e.get('word'), str):
                    teacher_words.add(e.get('word'))
            except Exception:
                continue
        try:
            for m in (user_doc.get('vocab_mission') or []):
                if isinstance(m, dict) and m.get('source') == 'teacher' and isinstance(m.get('word'), str):
                    teacher_words.add(m.get('word'))
        except Exception:
            pass

        tbm_words = []
        for e in tbm_entries:
            w = e.get('word') if isinstance(e, dict) else e
            if isinstance(w, str) and w:
                tbm_words.append(w)
        # Randomly select base words from TBM (no fixed A-Z or number order)
        if tbm_words:
            if len(tbm_words) > count:
                base = random.sample(tbm_words, count)
            else:
                base = list(tbm_words)
        else:
            base = []

        # 2) Supplement from specified wordbook if needed
        need = max(0, count - len(base))
        supplement = []
        wb = None
        if need > 0:
            wb = current_app.db.wordbooks.find_one(
                {
                    '_id': wb_oid,
                    '$or': [
                        {'accessibility': 'public'},
                        {'creator_id': user.get('_id')},
                        {'accessibility': {'$exists': False}}
                    ]
                },
                {'entries.word': 1, 'entries.number': 1, 'title': 1}
            )
            if not wb:
                return jsonify({'message': '未找到指定词库'}), 404

            # Build exclusion set from current lists
            exclude = set(base)
            for e in (user_doc.get('to_be_mastered') or []):
                w = e.get('word') if isinstance(e, dict) else e
                if isinstance(w, str):
                    exclude.add(w)
            for e in (user_doc.get('words_mastered') or []):
                w = e.get('word') if isinstance(e, dict) else e
                if isinstance(w, str):
                    exclude.add(w)

            # Valid words set
            valid_words = set(doc.get('word') for doc in current_app.db.words.find({}, {'word': 1}) if doc.get('word'))

            entries = wb.get('entries') or []
            # Build supplement pool and randomly pick
            supp_pool = []
            seen2 = set()
            for e in entries:
                w = e.get('word') if isinstance(e, dict) else None
                if not w or w in seen2:
                    continue
                if w in exclude:
                    continue
                if w not in valid_words:
                    continue
                seen2.add(w)
                supp_pool.append(w)
            if supp_pool:
                if len(supp_pool) > need:
                    supplement = random.sample(supp_pool, need)
                else:
                    supplement = list(supp_pool)

        # 3) Compose output
        words = base + supplement
        title = (wb or {}).get('title', '')
        return jsonify({
            'words': words,
            'base_count': len(base),
            'supplement_count': len(supplement),
            'wordbook_title': title
        }), 200
    except Exception as e:
        current_app.logger.error(f"Error building learning-plan: {e}")
        return jsonify({'message': '生成学习计划失败', 'error': str(e)}), 500


@student_bp.route('/api/student/wordbooks/<wordbook_id>/tbm-words', methods=['GET'])
@token_required
def tbm_words_from_wordbook(wordbook_id):
    """
    Returns the list of words that are in both the specified wordbook and
    the current student's to_be_mastered list. Respects access rules
    (public or student's own private or missing accessibility treated as public).
    """
    user = g.current_user
    if user.get('role') != 'user':
        return jsonify({'message': '仅学生可访问'}), 403
    try:
        try:
            wb_oid = ObjectId(wordbook_id)
        except Exception:
            return jsonify({'message': '无效的词库ID格式'}), 400

        wb = current_app.db.wordbooks.find_one(
            {
                '_id': wb_oid,
                '$or': [
                    {'accessibility': 'public'},
                    {'creator_id': user.get('_id')},
                    {'accessibility': {'$exists': False}}
                ]
            },
            {'entries.word': 1, 'entries.number': 1, 'title': 1}
        )
        if not wb:
            return jsonify({'message': '未找到指定词库'}), 404

        tbm = user.get('to_be_mastered', []) or []
        tbm_set = set()
        for e in tbm:
            if isinstance(e, dict):
                w = e.get('word')
            else:
                w = e
            if isinstance(w, str) and w:
                tbm_set.add(w)

        entries = wb.get('entries') or []
        entries_sorted = sorted(entries, key=lambda e: e.get('number', 0))
        words = [e.get('word') for e in entries_sorted if isinstance(e, dict) and isinstance(e.get('word'), str)]
        intersection = [w for w in words if w in tbm_set]

        return jsonify({'count': len(intersection), 'words': intersection, 'wordbook_title': wb.get('title', '')}), 200
    except Exception as e:
        current_app.logger.error(f"Error tbm-words from wordbook: {e}")
        return jsonify({'message': '获取待掌握交集失败', 'error': str(e)}), 500


@student_bp.route('/api/student/wordbooks/<wordbook_id>/progress', methods=['GET'])
@token_required
def wordbook_progress(wordbook_id):
    """
    Returns learning and review progress for a wordbook for the current student.
    - learning_progress: number of words in this book that are either in to_be_mastered or words_mastered.
    - review_progress: aggregated review units completed across mastered words in this book; each word counts as 8 units.
    Response:
      { total_count, learned_count, review_done_units, review_total_units, mastered_count }
    """
    user = g.current_user
    if user.get('role') != 'user':
        return jsonify({'message': '仅学生可访问'}), 403
    try:
        try:
            wb_oid = ObjectId(wordbook_id)
        except Exception:
            return jsonify({'message': '无效的词库ID格式'}), 400

        wb = current_app.db.wordbooks.find_one(
            {
                '_id': wb_oid,
                '$or': [
                    {'accessibility': 'public'},
                    {'creator_id': user.get('_id')},
                    {'accessibility': {'$exists': False}}
                ]
            },
            {'entries.word': 1, 'entries.number': 1, 'title': 1}
        )
        if not wb:
            return jsonify({'message': '未找到指定词库'}), 404

        entries = wb.get('entries') or []
        words_in_book = [e.get('word') for e in entries if isinstance(e, dict) and isinstance(e.get('word'), str)]
        total_count = len(words_in_book)
        set_book = set(words_in_book)

        # Build user sets
        tbm_set = set()
        for e in (user.get('to_be_mastered') or []):
            if isinstance(e, dict):
                w = e.get('word')
            else:
                w = e
            if isinstance(w, str):
                tbm_set.add(w)

        mastered_map = {}
        for e in (user.get('words_mastered') or []):
            if not isinstance(e, dict):
                continue
            w = e.get('word')
            if not isinstance(w, str):
                continue
            mastered_map[w] = e

        # Learning progress = words that have completed at least one learning session
        # i.e., words present in words_mastered
        learned_words = set(mastered_map.keys()) & set_book
        learned_count = len(learned_words)

        # Review units: 8 per word when fully completed. Done units per mastered word = 8 - remaining scheduled dates
        review_total_units = total_count * 8
        review_done_units = 0
        mastered_count = 0
        for w in set_book:
            e = mastered_map.get(w)
            if not e:
                continue
            mastered_count += 1
            remaining = 0
            try:
                remaining = len(e.get('review_date') or [])
            except Exception:
                remaining = 0
            done = max(0, 8 - remaining)
            if done > 8:
                done = 8
            review_done_units += done

        return jsonify({
            'wordbook_id': str(wb['_id']),
            'title': wb.get('title', ''),
            'total_count': total_count,
            'learned_count': learned_count,
            'mastered_count': mastered_count,
            'review_total_units': review_total_units,
            'review_done_units': review_done_units
        }), 200
    except Exception as e:
        current_app.logger.error(f"Error wordbook_progress: {e}")
        return jsonify({'message': '获取词库进度失败', 'error': str(e)}), 500


@student_bp.route('/api/student/tracked-wordbooks', methods=['GET'])
@token_required
def get_tracked_wordbooks():
    user = g.current_user
    if user.get('role') != 'user':
        return jsonify({'message': '仅学生可访问'}), 403
    doc = current_app.db.users.find_one({'_id': user.get('_id')}, {'tracked_wordbooks': 1}) or {}
    ids = []
    for _id in (doc.get('tracked_wordbooks') or []):
        try:
            ids.append(str(_id))
        except Exception:
            continue
    return jsonify({'ids': ids}), 200


@student_bp.route('/api/student/tracked-wordbooks', methods=['PUT'])
@token_required
def set_tracked_wordbooks():
    user = g.current_user
    if user.get('role') != 'user':
        return jsonify({'message': '仅学生可访问'}), 403
    data = request.get_json() or {}
    ids = data.get('ids') or []
    if not isinstance(ids, list):
        return jsonify({'message': 'ids 必须为数组'}), 400
    # Validate and convert to ObjectIds; allow only accessible wordbooks
    valid_oids = []
    for sid in ids:
        try:
            oid = ObjectId(sid)
        except Exception:
            continue
        ok = current_app.db.wordbooks.find_one(
            {
                '_id': oid,
                '$or': [
                    {'accessibility': 'public'},
                    {'creator_id': user.get('_id')},
                    {'accessibility': {'$exists': False}}
                ]
            }, {'_id': 1})
        if ok:
            valid_oids.append(oid)
    current_app.db.users.update_one({'_id': user.get('_id')}, {'$set': {'tracked_wordbooks': valid_oids}})
    return jsonify({'message': '已更新追踪词库', 'count': len(valid_oids)}), 200


@student_bp.route('/api/student/wordbooks/create', methods=['POST'])
@token_required
def create_private_wordbook():
    """
    Allows a student to create a private wordbook from a list of words.
    Body can be:
      { title: string (optional), words: [string] } or { title, words_text: string }
    Only words existing in the words collection are included.
    """
    user = g.current_user
    if user.get('role') != 'user':
        return jsonify({'message': '仅学生可访问'}), 403
    data = request.get_json() or {}
    title = (data.get('title') or '').strip()
    words = data.get('words')
    if not words:
        text = data.get('words_text') or ''
        # Split by any whitespace/newline
        words = [w.strip() for w in text.replace('\r','\n').split('\n')]
        # Also split by spaces for any remaining combined tokens
        out = []
        for w in words:
            out.extend([t for t in w.split() if t])
        words = out
    # If payload is not a list, treat as empty list (allow empty creation)
    if not isinstance(words, list):
        words = []
    # Deduplicate and normalize
    words = sorted({w for w in words if isinstance(w, str) and w})
    # Filter existing in dictionary with case-insensitive fallback (prefer exact)
    existing_exact = set(doc.get('word') for doc in current_app.db.words.find({'word': {'$in': words}}, {'word': 1}))
    missing = [w for w in words if w not in existing_exact]
    lower_candidates = sorted({w.lower() for w in missing if isinstance(w, str)})
    existing_lower = set()
    if lower_candidates:
        existing_lower = set(doc.get('word') for doc in current_app.db.words.find({'word': {'$in': lower_candidates}}, {'word': 1}))

    valid_mapped = []
    invalid = []
    seen = set()
    for w in words:
        if w in existing_exact:
            key = w
        else:
            lw = w.lower()
            key = lw if lw in existing_lower else None
        if key:
            if key not in seen:
                valid_mapped.append(key)
                seen.add(key)
        else:
            invalid.append(w)
    valid = valid_mapped
    # If user provided some words but none are valid, return error; otherwise allow empty wordbook
    if words and not valid:
        return jsonify({'message': 'None of the provided words exist in the dictionary', 'invalid_words': invalid, 'invalid_count': len(invalid)}), 400
    # Determine title
    if not title:
        from datetime import datetime
        title = f"My Wordbook {datetime.now().strftime('%Y%m%d %H%M')}"
    else:
        # Prevent duplicate titles for the same student
        existing = current_app.db.wordbooks.find_one({
            'creator_id': user.get('_id'),
            'accessibility': 'private',
            'title': title
        })
        if existing:
            return jsonify({'message': 'A wordbook with the same title already exists'}), 409
    # Build entries with incremental numbers
    entries = [{'number': idx+1, 'word': w, 'tags': []} for idx, w in enumerate(valid)]
    doc = {
        'title': title,
        'description': f"Private wordbook created by {user.get('username','student')}",
        'categories': [],
        'entries': entries,
        'creator_id': user.get('_id'),
        'accessibility': 'private'
    }
    # Flag default favorites list to prevent deletion
    try:
        if title.strip() == 'My Favorites':
            doc['is_favorites'] = True
    except Exception:
        pass
    res = current_app.db.wordbooks.insert_one(doc)
    # Auto-track newly created private wordbook for the student
    try:
        current_app.db.users.update_one({'_id': user.get('_id')}, {'$addToSet': {'tracked_wordbooks': res.inserted_id}})
    except Exception:
        pass
    return jsonify({'message': 'Created', 'wordbook_id': str(res.inserted_id), 'added': len(entries), 'title': title, 'invalid_words': invalid, 'invalid_count': len(invalid)}), 201


@student_bp.route('/api/student/wordbooks/mine', methods=['GET'])
@token_required
def list_my_private_wordbooks():
    user = g.current_user
    if user.get('role') != 'user':
        return jsonify({'message': 'Students only'}), 403
    # Deduplicate by title for this student's private wordbooks
    try:
        priv = list(current_app.db.wordbooks.find({'creator_id': user.get('_id'), 'accessibility': 'private'}, {'_id':1,'title':1}))
        groups = {}
        for b in priv:
            t = (b.get('title') or '').strip()
            groups.setdefault(t, []).append(b)
        to_delete = []
        deleted_to_kept = {}
        for t, lst in groups.items():
            if not t or len(lst) <= 1:
                continue
            lst_sorted = sorted(lst, key=lambda x: x['_id'])
            keep = lst_sorted[-1]['_id']
            for x in lst_sorted[:-1]:
                to_delete.append(x['_id'])
                deleted_to_kept[x['_id']] = keep
        if to_delete:
            current_app.db.wordbooks.delete_many({'_id': {'$in': to_delete}})
            # Cleanup tracked_wordbooks mapping
            udoc = current_app.db.users.find_one({'_id': user.get('_id')}, {'tracked_wordbooks':1}) or {}
            tracked = [oid for oid in (udoc.get('tracked_wordbooks') or []) if oid]
            existing_ids = set(x['_id'] for x in current_app.db.wordbooks.find({'_id': {'$in': tracked}}, {'_id':1}))
            new_tracked = []
            added = set()
            for oid in tracked:
                if oid in existing_ids:
                    new_tracked.append(oid)
                    added.add(oid)
                elif oid in deleted_to_kept:
                    kept_id = deleted_to_kept[oid]
                    if kept_id not in added:
                        new_tracked.append(kept_id)
                        added.add(kept_id)
            current_app.db.users.update_one({'_id': user.get('_id')}, {'$set': {'tracked_wordbooks': new_tracked}})
    except Exception:
        pass
    books = list(current_app.db.wordbooks.find(
        {'creator_id': user.get('_id'), 'accessibility': 'private'},
        {'_id': 1, 'title': 1, 'description': 1, 'entries.word': 1, 'is_favorites': 1, 'locked_by_teacher': 1}
    ))
    for b in books:
        b['_id'] = str(b['_id'])
    return jsonify(books), 200


@student_bp.route('/api/student/wordbooks/<wordbook_id>', methods=['DELETE'])
@token_required
def delete_my_wordbook(wordbook_id):
    user = g.current_user
    if user.get('role') != 'user':
        return jsonify({'message': '仅学生可访问'}), 403
    try:
        wb_oid = ObjectId(wordbook_id)
    except Exception:
        return jsonify({'message': 'Invalid wordbook ID'}), 400
    wb = current_app.db.wordbooks.find_one({'_id': wb_oid, 'creator_id': user.get('_id'), 'accessibility': 'private'})
    if not wb:
        return jsonify({'message': 'Wordbook not found or no permission'}), 404
    if wb.get('locked_by_teacher'):
        return jsonify({'message': 'This wordbook is managed by teacher and cannot be deleted'}), 403
    if wb.get('is_favorites') or (wb.get('title') == 'My Favorites'):
        return jsonify({'message': '"My Favorites" cannot be deleted'}), 400
    current_app.db.wordbooks.delete_one({'_id': wb_oid})
    return jsonify({'message': 'Deleted'}), 200


@student_bp.route('/api/student/wordbooks/<wordbook_id>/rename', methods=['PUT'])
@token_required
def rename_my_wordbook(wordbook_id):
    user = g.current_user
    if user.get('role') != 'user':
        return jsonify({'message': 'Students only'}), 403
    try:
        wb_oid = ObjectId(wordbook_id)
    except Exception:
        return jsonify({'message': 'Invalid wordbook ID'}), 400
    data = request.get_json() or {}
    new_title = (data.get('title') or '').strip()
    if not new_title:
        return jsonify({'message': 'Missing new title'}), 400
    # Prevent duplicate titles for the same student
    dup = current_app.db.wordbooks.find_one({
        'creator_id': user.get('_id'),
        'accessibility': 'private',
        'title': new_title,
        '_id': {'$ne': wb_oid}
    })
    if dup:
        return jsonify({'message': 'Wordbook with the same title already exists'}), 409
    # Check locked
    wb = current_app.db.wordbooks.find_one({'_id': wb_oid, 'creator_id': user.get('_id'), 'accessibility': 'private'})
    if not wb:
        return jsonify({'message': 'Wordbook not found or no permission'}), 404
    if wb.get('locked_by_teacher'):
        return jsonify({'message': 'This wordbook is managed by teacher and cannot be renamed'}), 403
    res = current_app.db.wordbooks.update_one({'_id': wb_oid}, {'$set': {'title': new_title}})
    if res.matched_count == 0:
        return jsonify({'message': 'Wordbook not found or no permission'}), 404
    return jsonify({'message': 'Updated', 'title': new_title}), 200


def _normalize_words_payload(data):
    words = data.get('words')
    if not words:
        text = data.get('words_text') or ''
        tmp = [w.strip() for w in text.replace('\r', '\n').split('\n')]
        out = []
        for w in tmp:
            out.extend([t for t in w.split() if t])
        words = out
    if not isinstance(words, list):
        return []
    return [w for w in words if isinstance(w, str) and w]


@student_bp.route('/api/student/wordbooks/<wordbook_id>/add-words', methods=['POST'])
@token_required
def add_words_to_my_wordbook(wordbook_id):
    user = g.current_user
    if user.get('role') != 'user':
        return jsonify({'message': 'Students only'}), 403
    try:
        wb_oid = ObjectId(wordbook_id)
    except Exception:
        return jsonify({'message': 'Invalid wordbook ID'}), 400
    data = request.get_json() or {}
    words = sorted(set(_normalize_words_payload(data)))
    if not words:
        return jsonify({'message': 'Missing words'}), 400
    # Filter existing in dictionary (case sensitive first)
    existing_exact = set(doc.get('word') for doc in current_app.db.words.find({'word': {'$in': words}}, {'word': 1}))
    # For those not found exactly, try lowercase fallback
    missing = [w for w in words if w not in existing_exact]
    lower_candidates = sorted({w.lower() for w in missing if isinstance(w, str)})
    existing_lower = set()
    if lower_candidates:
        existing_lower = set(doc.get('word') for doc in current_app.db.words.find({'word': {'$in': lower_candidates}}, {'word': 1}))

    # Build final valid list: exact matches keep original; otherwise use lowercase match if available
    valid_mapped = []
    invalid = []
    seen = set()
    for w in words:
        if w in existing_exact:
            key = w
        else:
            lw = w.lower()
            key = lw if lw in existing_lower else None
        if key:
            if key not in seen:
                valid_mapped.append(key)
                seen.add(key)
        else:
            invalid.append(w)
    valid = valid_mapped
    if not valid:
        return jsonify({'message': 'None of the provided words exist in the dictionary', 'invalid_words': invalid, 'invalid_count': len(invalid)}), 400
    wb = current_app.db.wordbooks.find_one({'_id': wb_oid, 'creator_id': user.get('_id'), 'accessibility': 'private'})
    if not wb:
        return jsonify({'message': 'Wordbook not found or no permission'}), 404
    if wb.get('locked_by_teacher'):
        return jsonify({'message': 'This wordbook is managed by teacher and cannot be modified'}), 403
    entries = wb.get('entries') or []
    already = set(e.get('word') for e in entries if isinstance(e, dict))
    to_add = [w for w in valid if w not in already]
    if not to_add:
        return jsonify({'message': 'No new words to add'}), 200
    max_number = 0
    for e in entries:
        try:
            n = int(e.get('number') or 0)
            if n > max_number:
                max_number = n
        except Exception:
            continue
    new_entries = [{'number': max_number + i + 1, 'word': w, 'tags': []} for i, w in enumerate(to_add)]
    current_app.db.wordbooks.update_one({'_id': wb_oid}, {'$push': {'entries': {'$each': new_entries}}})
    return jsonify({'message': f'Added {len(new_entries)} words', 'added': len(new_entries), 'invalid_words': invalid, 'invalid_count': len(invalid)}), 200


@student_bp.route('/api/student/wordbooks/<wordbook_id>/remove-words', methods=['DELETE'])
@token_required
def remove_words_from_my_wordbook(wordbook_id):
    user = g.current_user
    if user.get('role') != 'user':
        return jsonify({'message': 'Students only'}), 403
    try:
        wb_oid = ObjectId(wordbook_id)
    except Exception:
        return jsonify({'message': 'Invalid wordbook ID'}), 400
    data = request.get_json() or {}
    words = sorted(set(_normalize_words_payload(data)))
    if not words:
        return jsonify({'message': 'Missing words'}), 400
    # Only owner private wordbook
    wb = current_app.db.wordbooks.find_one({'_id': wb_oid, 'creator_id': user.get('_id'), 'accessibility': 'private'})
    if not wb:
        return jsonify({'message': 'Wordbook not found or no permission'}), 404
    if wb.get('locked_by_teacher'):
        return jsonify({'message': 'This wordbook is managed by teacher and cannot be modified'}), 403
    # Pull entries
    current_app.db.wordbooks.update_one({'_id': wb_oid}, {'$pull': {'entries': {'word': {'$in': words}}}})
    # Optionally, renumber entries sequentially
    wb2 = current_app.db.wordbooks.find_one({'_id': wb_oid})
    entries = wb2.get('entries') or []
    entries_sorted = sorted(entries, key=lambda e: e.get('number', 0))
    for idx, e in enumerate(entries_sorted):
        e['number'] = idx + 1
    current_app.db.wordbooks.update_one({'_id': wb_oid}, {'$set': {'entries': entries_sorted}})
    return jsonify({'message': 'Removed and re-numbered', 'remaining': len(entries_sorted)}), 200


@student_bp.route('/api/student/log-reordering-error', methods=['POST'])
@token_required
def log_reordering_error():
    """
    Record a sentence reordering mistake for the current user.
    Payload: { user_answer, correct_answer, explanation, word }
    Keeps only the most recent 200 records.
    """
    user = g.current_user
    if user.get('role') != 'user':
        return jsonify({'message': '仅学生可访问'}), 403
    data = request.get_json(silent=True) or {}
    user_answer = (data.get('user_answer') or '').strip()
    correct_answer = (data.get('correct_answer') or '').strip()
    explanation = (data.get('explanation') or '').strip()
    word = (data.get('word') or '').strip()
    try:
        from datetime import datetime
        import pytz
        beijing_tz = pytz.timezone('Asia/Shanghai')
        now_cn = datetime.now(beijing_tz)
        entry = {
            'ts': now_cn.strftime('%Y-%m-%d %H:%M:%S %z'),  # Shanghai time
            'word': word,
            'user_answer': user_answer,
            'correct_answer': correct_answer,
            'explanation': explanation,
            'type': 'sentence_reordering'
        }
        # Deduplicate: if last log is identical, skip
        last = current_app.db.users.find_one({'_id': user.get('_id')}, {'reordering_error_logs': {'$slice': -1}}) or {}
        last_entry = None
        try:
            arr = last.get('reordering_error_logs') or []
            if isinstance(arr, list) and len(arr) == 1 and isinstance(arr[0], dict):
                last_entry = arr[0]
        except Exception:
            last_entry = None
        if last_entry and \
           last_entry.get('word') == entry['word'] and \
           last_entry.get('user_answer') == entry['user_answer'] and \
           last_entry.get('correct_answer') == entry['correct_answer'] and \
           last_entry.get('explanation') == entry['explanation']:
            return jsonify({'message': 'skipped_duplicate'}), 200
        current_app.db.users.update_one(
            {'_id': user.get('_id')},
            {'$push': {'reordering_error_logs': {'$each': [entry], '$slice': -200}}}
        )
        return jsonify({'message': 'logged'}), 200
    except Exception as e:
        return jsonify({'message': 'log failed', 'error': str(e)}), 500


@student_bp.route('/api/student/practice-session', methods=['POST'])
@token_required
def build_practice_session():
    """
    Build a practice payload for a given word list and tier.
    Body: { word_list: string[] | string, tier: 'tier_1'|'tier_2'|'tier_3' }

    - Flattens tiered exercise fields.
    - Ensures sentence_reordering returns both sentence_answer and sentence_answer_cn as strings.
    """
    user = g.current_user
    if user.get('role') != 'user':
        return jsonify({'message': 'Students only'}), 403

    data = request.get_json(silent=True) or {}
    tier = data.get('tier') or user.get('tier') or 'tier_3'
    raw_list = data.get('word_list')

    # Normalize word list
    words = []
    try:
        if isinstance(raw_list, list):
            words = [str(w).strip() for w in raw_list if isinstance(w, (str,)) and str(w).strip()]
        elif isinstance(raw_list, str):
            parts = [p.strip() for p in raw_list.replace(',', '\n').split('\n')]
            words = [p for p in parts if p]
        else:
            words = []
    except Exception:
        words = []
    if not words:
        return jsonify({'message': 'word_list is empty'}), 400

    def pick_tier(val, t):
        if val is None:
            return ''
        if isinstance(val, str):
            return val
        if isinstance(val, dict):
            # accept keys like tier_1/tier1
            keys = [t, t.replace('tier_', 'tier'), 'tier_3', 'tier3'] if isinstance(t, str) else ['tier_3', 'tier3']
            for k in keys:
                v = val.get(k)
                if isinstance(v, str) and v.strip():
                    return v
            # fallback to first string
            for v in val.values():
                if isinstance(v, str) and v.strip():
                    return v
        return ''

    out_items = []
    try:
        cur = current_app.db.words.find({'word': {'$in': words}})
        for doc in cur:
            try:
                exercises = []
                for ex in (doc.get('exercises') or []):
                    if not isinstance(ex, dict):
                        continue
                    etype = ex.get('type')
                    if etype == 'infer_meaning':
                        sent = ex.get('sentence')
                        if not isinstance(sent, str):
                            sent = pick_tier(ex.get('sentences'), tier)
                        item_ex = {'type': 'infer_meaning'}
                        if sent:
                            item_ex['sentence'] = sent
                        if ex.get('options_type') is not None:
                            item_ex['options_type'] = ex.get('options_type')
                        exercises.append(item_ex)
                    elif etype == 'sentence_reordering':
                        ans_en = pick_tier(ex.get('sentence_answer'), tier)
                        ans_cn = pick_tier(ex.get('sentence_answer_cn'), tier)
                        exercises.append({
                            'type': 'sentence_reordering',
                            'sentence_answer': ans_en,
                            'sentence_answer_cn': ans_cn,
                        })
                    elif etype == 'synonym_replacement':
                        sent = ex.get('sentence')
                        if not isinstance(sent, str):
                            sent = pick_tier(ex.get('sentences'), tier)
                        exercises.append({
                            'type': 'synonym_replacement',
                            'sentence': sent,
                        })
                    else:
                        exercises.append(ex)

                item = {
                    'word': doc.get('word'),
                    'word_root': doc.get('word_root') or doc.get('word'),
                    'pos': doc.get('pos_en') or doc.get('pos_cn') or '',
                    # Keep top-level definition fields to match existing clients
                    'definition_cn': doc.get('definition_cn') or doc.get('definition_cn_raw') or '',
                    'definition_en': doc.get('definition_en') or '',
                    'sample_sentences': doc.get('sample_sentences') or [],
                    'exercises': exercises,
                }
                out_items.append(item)
            except Exception:
                continue
    except Exception as e:
        return jsonify({'message': 'DB error building session', 'error': str(e)}), 500

    # Preserve the order of requested words
    order_map = {w: i for i, w in enumerate(words)}
    out_items.sort(key=lambda x: order_map.get(x.get('word'), 10**9))

    # Minimal response: return array to match existing clients
    return jsonify(out_items), 200

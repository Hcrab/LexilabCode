from flask import Blueprint, request, jsonify, g, current_app
from bson.objectid import ObjectId
from ..decorators import admin_required, token_required, superadmin_required
from .student_routes import get_review_words
import re
import pytz
from datetime import datetime, timedelta

admin_bp = Blueprint('admin_bp', __name__)

def _user_projection(u):
    return {
        '_id': str(u.get('_id')),
        'username': u.get('username'),
        'nickname': u.get('nickname'),
        'tier': u.get('tier', 'tier_3'),
    }

@admin_bp.route('/api/admin/students/search', methods=['GET'])
@admin_required
def search_students():
    q = (request.args.get('q') or '').strip()
    if not q:
        return jsonify([]), 200
    try:
        regex = re.compile(re.escape(q), re.IGNORECASE)
        cur = current_app.db.users.find({'role': 'user', 'username': {'$regex': regex}}, {'username':1,'nickname':1,'tier':1})
        out = [_user_projection(u) for u in cur]
        return jsonify(out), 200
    except Exception as e:
        return jsonify({'message':'Search failed','error':str(e)}), 500

@admin_bp.route('/api/admin/invitations', methods=['POST'])
@admin_required
def create_invitation():
    data = request.get_json() or {}
    student_id = data.get('student_id')
    username = data.get('username')
    if not student_id and not username:
        return jsonify({'message':'Missing student id or username'}), 400
    try:
        if student_id:
            stu = current_app.db.users.find_one({'_id': ObjectId(student_id), 'role':'user'})
        else:
            stu = current_app.db.users.find_one({'username': username, 'role':'user'})
        if not stu:
            return jsonify({'message':'Student not found'}), 404
        teacher_id = g.current_user.get('_id')
        inv = current_app.db.invitations.find_one({'type':'teacher_student','teacher_id':teacher_id,'student_id':stu.get('_id'),'status':'pending'})
        if inv:
            return jsonify({'message':'Invitation sent, awaiting confirmation'}), 200
        doc = {
            'type':'teacher_student',
            'teacher_id': teacher_id,
            'student_id': stu.get('_id'),
            'status':'pending',
            'created_at': datetime.utcnow()
        }
        current_app.db.invitations.insert_one(doc)
        return jsonify({'message':'Invitation sent'}), 200
    except Exception as e:
        return jsonify({'message':'Send failed','error':str(e)}), 500

@admin_bp.route('/api/admin/invitations/sent', methods=['GET'])
@admin_required
def list_sent_invitations():
    """List pending invitations sent by the current teacher."""
    teacher_id = g.current_user.get('_id')
    try:
        cur = current_app.db.invitations.find({
            'type': 'teacher_student',
            'teacher_id': teacher_id,
            'status': 'pending'
        })
        out = []
        for inv in cur:
            stu = current_app.db.users.find_one({'_id': inv.get('student_id')}, {'username':1,'nickname':1}) or {}
            out.append({
                '_id': str(inv.get('_id')),
                'student': {
                    '_id': str(inv.get('student_id')),
                    'username': stu.get('username'),
                    'nickname': stu.get('nickname')
                },
                'status': inv.get('status','pending'),
                'created_at': inv.get('created_at').isoformat() if inv.get('created_at') else None
            })
        return jsonify(out), 200
    except Exception as e:
        return jsonify({'message': 'Failed to fetch invitations', 'error': str(e)}), 500

@admin_bp.route('/api/admin/students/linked', methods=['GET'])
@admin_required
def get_linked_students():
    teacher_id = g.current_user.get('_id')
    doc = current_app.db.users.find_one({'_id': teacher_id}, {'linked_students':1}) or {}
    ids = doc.get('linked_students') or []
    if not ids:
        return jsonify([]), 200
    cur = current_app.db.users.find({'_id': {'$in': ids}}, {'username':1,'nickname':1,'tier':1})
    return jsonify([_user_projection(u) for u in cur]), 200

@admin_bp.route('/api/admin/students/<student_id>/nickname', methods=['PUT'])
@admin_required
def set_student_nickname(student_id):
    """Allow admin to set or change a student's nickname regardless of existing value."""
    try:
        sid = ObjectId(student_id)
    except Exception:
        return jsonify({'message': 'Invalid student id'}), 400
    data = request.get_json(silent=True) or {}
    nickname = (data.get('nickname') or '').strip()
    # Accept empty string to clear nickname if needed
    try:
        stu = current_app.db.users.find_one({'_id': sid, 'role': 'user'})
        if not stu:
            return jsonify({'message': 'Student not found'}), 404
        current_app.db.users.update_one({'_id': sid}, {'$set': {'nickname': nickname}})
        return jsonify({'message': 'Nickname updated', 'nickname': nickname}), 200
    except Exception as e:
        return jsonify({'message': 'Update failed', 'error': str(e)}), 500

# ===== Secret Box (admin's own private wordbooks) =====

def _parse_words_text(words_text: str):
    if not isinstance(words_text, str):
        return []
    parts = re.split(r"[\s,;\n\t]+", words_text)
    out = []
    for p in parts:
        w = (p or '').strip().lower()
        if not w:
            continue
        # keep ascii letters, hyphen and space (like frontend)
        if re.match(r'^[A-Za-z\-\s]+$', w):
            out.append(w)
    # dedupe preserving order
    seen = set()
    uniq = []
    for w in out:
        if w in seen:
            continue
        seen.add(w)
        uniq.append(w)
    return uniq

# Admin secret-box endpoints for teacher_secret wordbooks are defined below.

@admin_bp.route('/api/admin/secret-boxes/<box_id>/add-words', methods=['POST'])
@admin_required
def add_words_secret_box(box_id):
    try:
        oid = ObjectId(box_id)
    except Exception:
        return jsonify({'message':'Invalid ID'}), 400
    data = request.get_json() or {}
    words_text = data.get('words_text') or ''
    words = _parse_words_text(words_text)
    admin_id = g.current_user.get('_id')
    wb = current_app.db.wordbooks.find_one({'_id': oid, 'creator_id': admin_id, 'accessibility': 'teacher_secret'})
    if not wb:
        return jsonify({'message':'Not found'}), 404

    # current max number
    max_number = 0
    for e in (wb.get('entries') or []):
        try:
            n = int(e.get('number') or 0)
            if n > max_number:
                max_number = n
        except Exception:
            continue

    # filter by dictionary
    existing = set(d.get('word') for d in current_app.db.words.find({'word': {'$in': words}}, {'word':1})) if words else set()
    valid = [w for w in words if w in existing]
    invalid = [w for w in words if w not in existing]

    # skip duplicates already in entries
    in_book = set(e.get('word') for e in (wb.get('entries') or []) if isinstance(e, dict) and e.get('word'))
    to_add = [w for w in valid if w not in in_book]

    new_entries = []
    for i, w in enumerate(to_add, 1):
        new_entries.append({'number': max_number + i, 'word': w, 'tags': []})

    if new_entries:
        current_app.db.wordbooks.update_one({'_id': oid}, {'$push': {'entries': {'$each': new_entries}}})

    return jsonify({'message': 'Added', 'added': len(new_entries), 'invalid_count': len(invalid), 'invalid_words': invalid}), 200

@admin_bp.route('/api/admin/secret-boxes/<box_id>/remove-words', methods=['DELETE'])
@admin_required
def remove_words_secret_box(box_id):
    try:
        oid = ObjectId(box_id)
    except Exception:
        return jsonify({'message':'Invalid ID'}), 400
    data = request.get_json() or {}
    words = data.get('words') or []
    if not isinstance(words, list) or not words:
        return jsonify({'message':'Missing words'}), 400
    admin_id = g.current_user.get('_id')
    wb = current_app.db.wordbooks.find_one({'_id': oid, 'creator_id': admin_id, 'accessibility': 'teacher_secret'})
    if not wb:
        return jsonify({'message':'Not found'}), 404
    current_app.db.wordbooks.update_one({'_id': oid}, {'$pull': {'entries': {'word': {'$in': words}}}})
    return jsonify({'message':'Removed'}), 200

@admin_bp.route('/api/admin/students/<student_id>/overview', methods=['GET'])
@admin_required
def get_student_overview(student_id):
    try:
        sid = ObjectId(student_id)
    except Exception:
        return jsonify({'message':'Invalid student id'}), 400
    stu = current_app.db.users.find_one({'_id': sid, 'role':'user'})
    if not stu:
        return jsonify({'message':'Student not found'}), 404
    tbm_entries = stu.get('to_be_mastered', []) or []
    tbm_words = []
    for e in tbm_entries:
        if isinstance(e, dict):
            w = e.get('word')
        else:
            w = e
        if isinstance(w, str) and w:
            tbm_words.append(w)
    teacher_words = set()
    for e in tbm_entries:
        try:
            if isinstance(e, dict) and e.get('source') == 'teacher' and isinstance(e.get('word'), str):
                teacher_words.add(e.get('word'))
        except Exception:
            continue
    try:
        for m in (stu.get('vocab_mission') or []):
            if isinstance(m, dict) and m.get('source') == 'teacher' and isinstance(m.get('word'), str):
                teacher_words.add(m.get('word'))
    except Exception:
        pass
    teacher_assigned = [w for w in tbm_words if w in teacher_words]

    review_today = get_review_words(student_doc=stu) or []

    beijing_tz = pytz.timezone('Asia/Shanghai')
    today = datetime.now(beijing_tz).date()
    # Determine first activity day from student's logs
    logs = (stu.get('study_logs') or [])
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
        # Still return secret_wordbook_title for UI banner even when no logs yet
        # Reuse detection logic below to compute title
        secret_title = None
        try:
            stu_doc = current_app.db.users.find_one({'_id': sid}, {'tracked_wordbooks': 1}) or {}
            raw_ids = stu_doc.get('tracked_wordbooks') or []
            tracked_ids = []
            for oid in raw_ids:
                try:
                    tracked_ids.append(oid if not isinstance(oid, str) else ObjectId(oid))
                except Exception:
                    continue
            tracked_docs = list(current_app.db.wordbooks.find({'_id': {'$in': tracked_ids}}, {'_id':1,'title':1,'creator_id':1,'accessibility':1})) if tracked_ids else []
            own_private_tracked = [w for w in tracked_docs if w.get('creator_id') == sid and w.get('accessibility') == 'private']
            candidate = own_private_tracked[0] if len(own_private_tracked) >= 1 else current_app.db.wordbooks.find_one({'creator_id': sid, 'accessibility': 'private', 'title': 'Custom Wordbook'}, {'title': 1})
            if candidate:
                secret_title = candidate.get('title') or 'Custom Wordbook'
        except Exception:
            pass
        return jsonify({
            'student': _user_projection(stu),
            'tier': stu.get('tier','tier_3'),
            'tbm_all': [],
            'tbm_teacher_assigned': [],
            'review_today': [],
            'study_by_day': [],
            'secret_wordbook_title': secret_title,
            'learning_goal': stu.get('learning_goal', 0) or 0
        }), 200
    span = (today - first_date).days
    dates = [(first_date + timedelta(days=i)).strftime('%Y-%m-%d') for i in range(0, span + 1)]
    counts = {d: {
        'date': d,
        'learned': 0,
        'reviewed': 0,
        'learned_words': [],
        'secret_learned_words': [],
        'other_learned_words': [],
        'assigned_completed_words': [],
        'reviewed_words': [],
        'review_done': False
    } for d in dates}

    # If the student tracks exactly one private self-created wordbook, treat it as custom; otherwise fallback to legacy title match
    secret_set = set()
    secret_title = None
    try:
        stu_doc = current_app.db.users.find_one({'_id': sid}, {'tracked_wordbooks': 1}) or {}
        raw_ids = stu_doc.get('tracked_wordbooks') or []
        tracked_ids = []
        for oid in raw_ids:
            try:
                tracked_ids.append(oid if not isinstance(oid, str) else ObjectId(oid))
            except Exception:
                continue
        tracked_docs = list(current_app.db.wordbooks.find({'_id': {'$in': tracked_ids}}, {'_id':1,'title':1,'creator_id':1,'accessibility':1,'entries.word':1})) if tracked_ids else []
        own_private_tracked = [w for w in tracked_docs if w.get('creator_id') == sid and w.get('accessibility') == 'private']
        candidate = None
        if len(own_private_tracked) >= 1:
            candidate = own_private_tracked[0]
        else:
            candidate = current_app.db.wordbooks.find_one({'creator_id': sid, 'accessibility': 'private', 'title': 'Custom Wordbook'}, {'entries.word': 1, 'title': 1})
        if candidate:
            secret_title = candidate.get('title') or 'Custom Wordbook'
            for e in (candidate.get('entries') or []):
                if isinstance(e, dict) and isinstance(e.get('word'), str):
                    secret_set.add(e.get('word'))
    except Exception:
        pass
    for lg in logs:
        if not isinstance(lg, dict):
            continue
        d = lg.get('date')
        t = lg.get('type')
        if d in counts:
            if t == 'learn':
                w = lg.get('word')
                # Always count total learned
                counts[d]['learned'] += 1
                if isinstance(w, str) and w:
                    counts[d]['learned_words'].append(w)
                    if w in secret_set:
                        counts[d]['secret_learned_words'].append(w)
                    else:
                        counts[d]['other_learned_words'].append(w)
                # Track completed assigned words (learned words that were assigned by teacher)
                try:
                    if isinstance(w, str) and w in teacher_words:
                        counts[d]['assigned_completed_words'].append(w)
                except Exception:
                    pass
            elif t == 'review':
                counts[d]['reviewed'] += 1
                w = lg.get('word')
                if isinstance(w, str) and w:
                    counts[d]['reviewed_words'].append(w)

    # Mark days completed revision based on student's record
    try:
        completed_days = set((stu.get('complete_revision_day') or []))
        for d in dates:
            if d in completed_days:
                counts[d]['review_done'] = True
    except Exception:
        pass

    # Align today's status with live schedule (same as student view)
    try:
        beijing_tz = pytz.timezone('Asia/Shanghai')
        today_str = datetime.now(beijing_tz).strftime('%Y-%m-%d')
        rv_today = get_review_words(student_doc=stu) or []
        counts[today_str]['review_done'] = isinstance(rv_today, list) and len(rv_today) == 0
    except Exception:
        pass

    # Prepare reordering error logs (latest first, limit 100)
    try:
        raw_logs = (stu.get('reordering_error_logs') or [])
        # ensure list of dicts and sort by ts if present
        def _ts(x):
            try:
                return x.get('ts')
            except Exception:
                return None
        logs_sorted = sorted([e for e in raw_logs if isinstance(e, dict)], key=_ts, reverse=True)
        re_logs = logs_sorted[:100]
    except Exception:
        re_logs = []

    return jsonify({
        'student': _user_projection(stu),
        'tier': stu.get('tier','tier_3'),
        'tbm_all': tbm_words,
        'tbm_teacher_assigned': teacher_assigned,
        'review_today': review_today,
        'study_by_day': [counts[d] for d in dates],
        'secret_wordbook_title': secret_title,
        'learning_goal': stu.get('learning_goal', 0) or 0,
        'reordering_error_logs': re_logs
    }), 200

# ---------------- Secret Boxes (teacher-only wordbooks) ----------------

# list_secret_boxes defined below; keep only one definition

@admin_bp.route('/api/admin/secret-boxes/<box_id>/rename', methods=['PUT'])
@admin_required
def rename_secret_box(box_id):
    data = request.get_json(silent=True) or {}
    new_title = (data.get('title') or '').strip()
    if not new_title:
        return jsonify({'message': 'Title is required'}), 400
    try:
        bid = ObjectId(box_id)
    except Exception:
        return jsonify({'message': 'Invalid wordbook ID'}), 400
    res = current_app.db.wordbooks.update_one({'_id': bid, 'creator_id': g.current_user.get('_id'), 'accessibility': 'teacher_secret'}, {'$set': {'title': new_title}})
    if res.matched_count == 0:
        return jsonify({'message': 'Not found or no permission'}), 404
    return jsonify({'message': 'Renamed', 'title': new_title}), 200

@admin_bp.route('/api/admin/students/<student_id>/daily-wordlist', methods=['GET'])
@admin_required
def get_student_daily_wordlist(student_id):
    """Return learned words for a specific date with Chinese definitions.

    Query params:
      - date: YYYY-MM-DD (defaults to today Asia/Shanghai)
    Response:
      { date: 'YYYY-MM-DD', words: [ { word, definition_cn } ] }
    """
    try:
        sid = ObjectId(student_id)
    except Exception:
        return jsonify({'message': 'Invalid student id'}), 400

    stu = current_app.db.users.find_one({'_id': sid, 'role': 'user'}, {'study_logs': 1})
    if not stu:
        return jsonify({'message': 'Student not found'}), 404

    # Resolve target date (default today in Beijing time)
    beijing_tz = pytz.timezone('Asia/Shanghai')
    today_str = datetime.now(beijing_tz).strftime('%Y-%m-%d')
    date_str = (request.args.get('date') or today_str).strip()

    # Collect learned words for the day
    learned = []
    for lg in (stu.get('study_logs') or []):
        try:
            if not isinstance(lg, dict):
                continue
            if lg.get('date') == date_str and lg.get('type') == 'learn':
                w = lg.get('word')
                if isinstance(w, str) and w:
                    learned.append(w)
        except Exception:
            continue

    # Deduplicate while keeping order
    seen = set()
    ordered = []
    for w in learned:
        if w not in seen:
            seen.add(w)
            ordered.append(w)

    if not ordered:
        return jsonify({'date': date_str, 'words': []}), 200

    # Fetch Chinese definitions from dictionary
    cur = current_app.db.words.find({'word': {'$in': ordered}}, {'word': 1, 'definition_cn': 1})
    defs = {doc.get('word'): (doc.get('definition_cn') or '') for doc in cur}

    out = [{'word': w, 'definition_cn': defs.get(w, '')} for w in ordered]
    return jsonify({'date': date_str, 'words': out}), 200

@admin_bp.route('/api/admin/students/<student_id>/tier', methods=['PUT'])
@admin_required
def set_student_tier(student_id):
    try:
        sid = ObjectId(student_id)
    except Exception:
        return jsonify({'message':'Invalid student id'}), 400
    data = request.get_json() or {}
    tier = data.get('tier')
    if tier not in ['tier_1','tier_2','tier_3']:
        return jsonify({'message':'Invalid tier'}), 400
    current_app.db.users.update_one({'_id': sid}, {'$set': {'tier': tier}})
    return jsonify({'message':'Updated', 'tier': tier}), 200

@admin_bp.route('/api/admin/students/<student_id>/learning-goal', methods=['PUT'])
@admin_required
def set_student_learning_goal(student_id):
    """Allow teacher to set a student's daily learning goal."""
    try:
        sid = ObjectId(student_id)
    except Exception:
        return jsonify({'message':'Invalid student id'}), 400
    data = request.get_json(silent=True) or {}
    try:
        goal = int(data.get('goal', 0))
    except Exception:
        return jsonify({'message':'Invalid goal value'}), 400
    if goal < 0 or goal > 500:
        return jsonify({'message':'Goal must be between 0 and 500'}), 400
    res = current_app.db.users.update_one({'_id': sid, 'role': 'user'}, {'$set': {'learning_goal': goal}})
    if res.matched_count == 0:
        return jsonify({'message': 'Student not found'}), 404
    return jsonify({'message': 'Learning goal updated', 'learning_goal': goal}), 200

@admin_bp.route('/api/admin/students/<student_id>/assign', methods=['POST'])
@admin_required
def assign_words_to_student(student_id):
    try:
        sid = ObjectId(student_id)
    except Exception:
        return jsonify({'message':'Invalid student id'}), 400
    data = request.get_json() or {}
    words = data.get('words')
    if not words or not isinstance(words, list):
        return jsonify({'message':'Missing word list'}), 400
    valid = set(w.get('word') for w in current_app.db.words.find({'word': {'$in': words}}, {'word':1}))
    words = [w for w in words if isinstance(w, str) and w in valid]
    if not words:
        return jsonify({'message':'No valid words'}), 400
    now = datetime.utcnow().strftime('%Y-%m-%d')
    entries = [{'word': w, 'source':'teacher', 'assigned_date': now} for w in words]
    stu = current_app.db.users.find_one({'_id': sid}, {'to_be_mastered':1,'words_mastered.word':1}) or {}
    tbm_set = set()
    for e in (stu.get('to_be_mastered') or []):
        if isinstance(e, dict) and isinstance(e.get('word'), str): tbm_set.add(e.get('word'))
        elif isinstance(e, str): tbm_set.add(e)
    mastered_set = set(e.get('word') for e in (stu.get('words_mastered') or []) if isinstance(e, dict))
    new_entries = [e for e in entries if e['word'] not in tbm_set and e['word'] not in mastered_set]
    if not new_entries:
        return jsonify({'message':'No new words to assign'}), 200
    current_app.db.users.update_one({'_id': sid}, {'$push': {'to_be_mastered': {'$each': new_entries}}})
    return jsonify({'message': f'Assigned {len(new_entries)} words', 'added': len(new_entries)}), 200

# ===== Secret wordbook utilities (admin) =====

@admin_bp.route('/api/admin/students/<student_id>/secret-wordbook', methods=['POST'])
@admin_required
def create_or_update_secret_wordbook(student_id):
    try:
        sid = ObjectId(student_id)
    except Exception:
        return jsonify({'message': 'Invalid student id'}), 400
    stu = current_app.db.users.find_one({'_id': sid, 'role': 'user'})
    if not stu:
        return jsonify({'message': 'Student not found'}), 404

    data = request.get_json(silent=True) or {}
    text = (data.get('words_text') or '').replace('\r', '\n')
    # Parse words from text (one per line or whitespace)
    words = []
    if text:
        tmp = [t.strip() for t in text.split('\n')]
        out = []
        for t in tmp:
            out.extend([x for x in t.split() if x])
        words = out

    # Ensure secret wordbook exists (schema compatible; identify/create by default title)
    wb = current_app.db.wordbooks.find_one({'creator_id': sid, 'accessibility': 'private', 'title': 'Custom Wordbook'})
    created = False
    if not wb:
        res = current_app.db.wordbooks.insert_one({
            'title': 'Custom Wordbook',
            'description': f"Custom wordbook for {stu.get('username','student')}",
            'categories': [],
            'entries': [],
            'creator_id': sid,
            'accessibility': 'private'
        })
        wb = current_app.db.wordbooks.find_one({'_id': res.inserted_id})
        created = True
    wb_id = wb.get('_id')

    added = 0
    invalid = []
    if words:
        # Normalize and dedup
        words = sorted({w for w in words if isinstance(w, str) and w})
        existing_exact = set(doc.get('word') for doc in current_app.db.words.find({'word': {'$in': words}}, {'word': 1}))
        missing = [w for w in words if w not in existing_exact]
        lower_candidates = sorted({w.lower() for w in missing})
        existing_lower = set()
        if lower_candidates:
            existing_lower = set(doc.get('word') for doc in current_app.db.words.find({'word': {'$in': lower_candidates}}, {'word': 1}))

        wb_doc = current_app.db.wordbooks.find_one({'_id': wb_id}) or {}
        entries = wb_doc.get('entries') or []
        already = set(e.get('word') for e in entries if isinstance(e, dict))
        max_number = 0
        for e in entries:
            try:
                n = int(e.get('number') or 0)
                if n > max_number:
                    max_number = n
            except Exception:
                continue

        new_entries = []
        for w in words:
            if w in existing_exact:
                key = w
            else:
                lw = w.lower()
                key = lw if lw in existing_lower else None
            if key and key not in already:
                max_number += 1
                new_entries.append({'number': max_number, 'word': key, 'tags': []})
                already.add(key)
            elif not key:
                invalid.append(w)

        if new_entries:
            current_app.db.wordbooks.update_one({'_id': wb_id}, {'$push': {'entries': {'$each': new_entries}}})
            added = len(new_entries)

    # Track this wordbook (retain student's other follows) and lock by teacher
    current_app.db.users.update_one({'_id': sid}, {'$addToSet': {'tracked_wordbooks': wb_id}})
    try:
        current_app.db.wordbooks.update_one({'_id': wb_id}, {'$set': {'locked_by_teacher': True}})
    except Exception:
        pass

    return jsonify({
        'message': 'Custom wordbook is ready',
        'wordbook_id': str(wb_id),
        'created': created,
        'added': added,
        'invalid_count': len(invalid),
        'invalid_words': invalid
    }), 200

@admin_bp.route('/api/admin/secret-boxes', methods=['GET'])
@admin_required
def list_secret_boxes():
    teacher_id = g.current_user.get('_id')
    boxes = list(current_app.db.wordbooks.find({'creator_id': teacher_id, 'accessibility': 'teacher_secret'}, {'_id':1,'title':1,'entries.word':1}))
    out = []
    for b in boxes:
        out.append({'_id': str(b['_id']), 'title': b.get('title',''), 'count': len(b.get('entries') or [])})
    return jsonify(out), 200

@admin_bp.route('/api/admin/secret-boxes', methods=['POST'])
@admin_required
def create_secret_box():
    teacher_id = g.current_user.get('_id')
    data = request.get_json(silent=True) or {}
    title = (data.get('title') or '').strip() or 'Untitled Wordbook'
    text = (data.get('words_text') or '').replace('\r','\n')
    # Parse words
    words = []
    if text:
        tmp = [t.strip() for t in text.split('\n')]
        out = []
        for t in tmp:
            out.extend([x for x in t.split() if x])
        words = out
    # Build entries
    entries = []
    if words:
        words = sorted({w for w in words if isinstance(w, str) and w})
        existing = set(doc.get('word') for doc in current_app.db.words.find({'word': {'$in': words}}, {'word': 1}))
        missing = [w for w in words if w not in existing]
        lower_candidates = sorted({w.lower() for w in missing})
        existing_lower = set()
        if lower_candidates:
            existing_lower = set(doc.get('word') for doc in current_app.db.words.find({'word': {'$in': lower_candidates}}, {'word': 1}))
        n = 0
        seen = set()
        for w in words:
            if w in existing:
                key = w
            else:
                lw = w.lower()
                key = lw if lw in existing_lower else None
            if key and key not in seen:
                n += 1
                entries.append({'number': n, 'word': key, 'tags': []})
                seen.add(key)

    res = current_app.db.wordbooks.insert_one({
        'title': title,
        'description': f"Teacher-created wordbook",
        'categories': [],
        'entries': entries,
        'creator_id': teacher_id,
        'accessibility': 'teacher_secret'
    })
    return jsonify({'_id': str(res.inserted_id), 'title': title, 'count': len(entries)}), 201

@admin_bp.route('/api/admin/secret-boxes/<box_id>', methods=['DELETE'])
@admin_required
def delete_secret_box(box_id):
    teacher_id = g.current_user.get('_id')
    try:
        bid = ObjectId(box_id)
    except Exception:
        return jsonify({'message': 'Invalid wordbook ID'}), 400
    res = current_app.db.wordbooks.delete_one({'_id': bid, 'creator_id': teacher_id, 'accessibility': 'teacher_secret'})
    if res.deleted_count == 0:
        return jsonify({'message': 'Wordbook not found or no permission'}), 404
    return jsonify({'message': 'Deleted'}), 200

# ===== Public wordbooks for admin (teacher) =====

@admin_bp.route('/api/admin/public-wordbooks', methods=['GET'])
@admin_required
def list_public_wordbooks_for_admin():
    """List public wordbooks for teachers to use as word lists.
    Returns minimal fields: _id, title, description.
    """
    try:
        cur = current_app.db.wordbooks.find(
            {
                '$or': [
                    {'accessibility': 'public'},
                    {'accessibility': {'$exists': False}}
                ]
            },
            {'_id': 1, 'title': 1, 'description': 1}
        )
        out = []
        for wb in cur:
            out.append({
                '_id': str(wb.get('_id')),
                'title': wb.get('title'),
                'description': wb.get('description')
            })
        return jsonify(out), 200
    except Exception as e:
        return jsonify({'message': 'Failed to fetch public wordbooks', 'error': str(e)}), 500

@admin_bp.route('/api/admin/wordbooks/<wordbook_id>', methods=['GET'])
@admin_required
def get_wordbook_details_for_admin(wordbook_id):
    """Get wordbook entries for admin (teachers) without superadmin privileges.
    Supports limit=0 to return all entries; returns minimal fields for entries.
    """
    try:
        wid = ObjectId(wordbook_id)
    except Exception:
        return jsonify({'message': 'Invalid wordbook id'}), 400
    try:
        wb = current_app.db.wordbooks.find_one({'_id': wid})
        if not wb:
            return jsonify({'message': 'Wordbook not found'}), 404
        # Read limit param
        try:
            limit = int((request.args.get('limit') or '50'))
        except Exception:
            limit = 50
        entries = wb.get('entries') or []
        # Sort by word for stable view
        try:
            entries.sort(key=lambda e: (e.get('word') or '').lower())
        except Exception:
            pass
        if limit and limit > 0:
            entries_slice = entries[:limit]
        else:
            entries_slice = entries
        # Minimal map
        out_entries = []
        for e in entries_slice:
            if isinstance(e, dict):
                out_entries.append({'word': e.get('word'), 'tags': e.get('tags', [])})
        return jsonify({
            '_id': str(wb.get('_id')),
            'title': wb.get('title'),
            'description': wb.get('description'),
            'entries': out_entries
        }), 200
    except Exception as e:
        current_app.logger.error(f"admin get wordbook details failed: {e}")
        return jsonify({'message': 'Failed to fetch wordbook details', 'error': str(e)}), 500

@admin_bp.route('/api/admin/students/<student_id>/secret-wordbook-from-box', methods=['POST'])
@admin_required
def assign_secret_from_box(student_id):
    try:
        sid = ObjectId(student_id)
    except Exception:
        return jsonify({'message': 'Invalid student id'}), 400
    data = request.get_json(silent=True) or {}
    box_id = data.get('box_id')
    try:
        bid = ObjectId(box_id)
    except Exception:
        return jsonify({'message': 'Invalid wordbook id'}), 400
    teacher_id = g.current_user.get('_id')
    box = current_app.db.wordbooks.find_one({'_id': bid, 'creator_id': teacher_id, 'accessibility': 'teacher_secret'})
    if not box:
        return jsonify({'message': 'Wordbook not found or no permission'}), 404

    # Ensure student's private secret wordbook exists
    stu = current_app.db.users.find_one({'_id': sid, 'role': 'user'})
    if not stu:
        return jsonify({'message': 'Student not found'}), 404
    wb = current_app.db.wordbooks.find_one({'creator_id': sid, 'accessibility':'private', 'title': 'Custom Wordbook'})
    if not wb:
        r = current_app.db.wordbooks.insert_one({
            'title': 'Custom Wordbook',
            'description': f"Custom wordbook for {stu.get('username','student')}",
            'categories': [],
            'entries': [],
            'creator_id': sid,
            'accessibility': 'private'
        })
        wb = current_app.db.wordbooks.find_one({'_id': r.inserted_id})
    wb_id = wb.get('_id')

    # Rename student's secret book to match the selected box title
    try:
        current_app.db.wordbooks.update_one({'_id': wb_id}, {'$set': {'title': box.get('title', 'Custom Wordbook')}})
    except Exception:
        pass

    # Merge entries from box into student's secret book
    box_entries = box.get('entries') or []
    wb_doc = current_app.db.wordbooks.find_one({'_id': wb_id}) or {}
    entries = wb_doc.get('entries') or []
    already = set(e.get('word') for e in entries if isinstance(e, dict))
    max_number = 0
    for e in entries:
        try:
            n = int(e.get('number') or 0)
            if n > max_number:
                max_number = n
        except Exception:
            continue
    new_entries = []
    for e in box_entries:
        w = e.get('word') if isinstance(e, dict) else None
        if isinstance(w, str) and w and w not in already:
            max_number += 1
            new_entries.append({'number': max_number, 'word': w, 'tags': []})
            already.add(w)
    if new_entries:
        current_app.db.wordbooks.update_one({'_id': wb_id}, {'$push': {'entries': {'$each': new_entries}}})

    # Track this wordbook for the student (retain others) and lock by teacher
    current_app.db.users.update_one({'_id': sid}, {'$addToSet': {'tracked_wordbooks': wb_id}})
    try:
        current_app.db.wordbooks.update_one({'_id': wb_id}, {'$set': {'locked_by_teacher': True}})
    except Exception:
        pass

    return jsonify({'message': 'Applied custom wordbook from box', 'wordbook_id': str(wb_id), 'added': len(new_entries)}), 200

# ===== Superadmin utilities =====

@admin_bp.route('/api/superadmin/dau', methods=['GET'])
@superadmin_required
def superadmin_dau():
    try:
        days = int(request.args.get('days', 14))
    except Exception:
        days = 14
    days = max(1, min(days, 60))

    from datetime import datetime, timedelta
    import pytz
    beijing_tz = pytz.timezone('Asia/Shanghai')
    today = datetime.now(beijing_tz).date()

    stats = []
    for i in range(days):
        d = today - timedelta(days=i)
        d_str = d.strftime('%Y-%m-%d')
        try:
            count = current_app.db.users.count_documents({'login_days': d_str, 'role': {'$in': ['user', 'admin']}})
        except Exception:
            count = 0
        stats.append({'date': d_str, 'active_users': count})

    return jsonify(list(reversed(stats))), 200

@admin_bp.route('/api/superadmin/users', methods=['GET'])
@superadmin_required
def superadmin_users():
    try:
        # Include tier so SuperAdmin can see each student's difficulty tier
        cursor = current_app.db.users.find({}, {'username': 1, 'role': 1, 'last_login': 1, 'tier': 1})
        users = []
        for u in cursor:
            users.append({
                'id': str(u['_id']),
                'username': u.get('username'),
                'role': u.get('role'),
                'last_login': u.get('last_login'),
                'tier': u.get('tier')
            })
        return jsonify(users), 200
    except Exception as e:
        return jsonify({'message': 'Failed to fetch user data', 'error': str(e)}), 500

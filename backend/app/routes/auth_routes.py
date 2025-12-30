import jwt
import os
from datetime import datetime, timezone, timedelta
from flask import Blueprint, request, jsonify, current_app
from werkzeug.security import check_password_hash, generate_password_hash
import pytz
from ..decorators import superadmin_required

auth_bp = Blueprint('auth_bp', __name__)

def _is_strong_password(pw: str) -> bool:
    """Check password has >=8 chars with letters, digits and symbols."""
    if not isinstance(pw, str) or len(pw) < 8 or len(pw) > 128:
        return False
    has_letter = any(c.isalpha() for c in pw)
    has_digit = any(c.isdigit() for c in pw)
    has_symbol = any(not c.isalnum() for c in pw)
    return has_letter and has_digit and has_symbol

@auth_bp.route('/api/register', methods=['POST'])
def register():
    data = request.get_json() or {}
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    confirm_password = data.get('confirm_password') or ''
    # Public registration is allowed, but only for normal users
    role = 'user'

    # Hard limit: at most 300 users allowed
    try:
        total_users = current_app.db.users.count_documents({})
        if total_users >= 300:
            return jsonify({'message': 'Registration limit reached. Registration is temporarily closed.'}), 403
    except Exception:
        return jsonify({'message': 'Server error. Please try again later.'}), 500

    # Basic validation
    if not username or not password:
        return jsonify({'message': 'Missing username or password.'}), 400
    if len(username) < 3 or len(username) > 32:
        return jsonify({'message': 'Username length must be between 3 and 32.'}), 400
    # Confirm password check
    if password != confirm_password:
        return jsonify({'message': 'Passwords do not match.'}), 400

    # Disallow any non-user roles from this endpoint
    if role != 'user':
        return jsonify({'message': 'Invalid role.'}), 400

    # Ensure unique username
    existing = current_app.db.users.find_one({'username': username})
    if existing:
        return jsonify({'message': 'Username already taken.'}), 409

    # Create user
    try:
        beijing_tz = pytz.timezone('Asia/Shanghai')
        now = datetime.now(beijing_tz)
        user_doc = {
            'username': username,
            'password': generate_password_hash(password),
            'role': role,
            'first_login': True,
            'created_at': now.isoformat(),
            'learning_goal': 0,
            'tier': 'tier_3',
            'to_be_mastered': [],
            'words_mastered': [],
            'study_logs': [],
            'last_login': None,
            'login_days': [],
        }
        res = current_app.db.users.insert_one(user_doc)
        # 不再在注册时自动追踪任何词库（对齐“教师批量导入”的行为）
        try:
            current_app.db.users.update_one({'_id': res.inserted_id}, {'$set': {'tracked_wordbooks': []}})
        except Exception:
            pass
        return jsonify({'message': 'Registered successfully.'}), 201
    except Exception:
        return jsonify({'message': 'Registration failed. Please try again later.'}), 500

@auth_bp.route('/api/login', methods=['POST'])
def login():
    auth = request.json
    if not auth or not auth.get('username') or not auth.get('password'):
        return jsonify({'message': 'Cannot verify; missing username or password.'}), 401

    user = current_app.db.users.find_one({'username': auth.get('username')})

    # Do not reveal whether the username exists; use a generic message
    if not user:
        return jsonify({'message': 'Incorrect username or password.'}), 401

    if check_password_hash(user['password'], auth.get('password')):
        # If teacher account is pending approval, block login
        if user.get('role') == 'admin' and not user.get('approved', False):
            return jsonify({'message': 'Teacher account is pending approval. Please contact a Superadmin.'}), 403
        # On successful login, if the user is a student, lazily mark today's completion if both lists are empty
        try:
            if user.get('role') == 'user':
                # Determine if to_be_mastered is empty and today's review list is empty
                tbm_empty = len(user.get('to_be_mastered', []) or []) == 0
                # Compute today's review list by scanning words_mastered.review_date for today
                beijing_tz = pytz.timezone('Asia/Shanghai')
                today_str = datetime.now(beijing_tz).strftime('%Y-%m-%d')
                rvw_empty = True
                for w in (user.get('words_mastered', []) or []):
                    if today_str in (w.get('review_date') or []):
                        rvw_empty = False
                        break
                if tbm_empty and rvw_empty:
                    current_app.db.users.update_one(
                        {'_id': user['_id']},
                        {'$addToSet': {
                            'complete_exercise_day': today_str,
                            'complete_revision_day': today_str
                        }}
                    )
        except Exception:
            # Non-critical; ignore failures
            pass
        # Record last login and daily mark
        try:
            beijing_tz = pytz.timezone('Asia/Shanghai')
            now = datetime.now(beijing_tz)
            today_str = now.strftime('%Y-%m-%d')
            current_app.db.users.update_one(
                {'_id': user['_id']},
                {'$set': {'last_login': now.isoformat()}, '$addToSet': {'login_days': today_str}}
            )
        except Exception:
            pass

        token = jwt.encode({
            'user_id': str(user['_id']),
            'role': user.get('role', 'user'),
            'exp': datetime.now(timezone.utc) + timedelta(hours=24)
        }, current_app.config['SECRET_KEY'], algorithm="HS256")

        return jsonify({'token': token})

    # Incorrect password: use the same generic message as above
    return jsonify({'message': 'Incorrect username or password.'}), 401


@auth_bp.route('/api/forgot-password', methods=['POST'])
def forgot_password():
    # Disabled as per requirements
    return jsonify({'message': 'Endpoint disabled'}), 404


@auth_bp.route('/api/forgot-password/check-user', methods=['POST'])
def forgot_password_check_user():
    # Disabled as per requirements
    return jsonify({'message': 'Endpoint disabled'}), 404


@auth_bp.route('/api/forgot-password/verify-answer', methods=['POST'])
def forgot_password_verify_answer():
    # Disabled as per requirements
    return jsonify({'message': 'Endpoint disabled'}), 404


@auth_bp.route('/api/superadmin/register', methods=['POST'])
def superadmin_register():
    return jsonify({'message': 'Superadmin registration is disabled.'}), 403


@auth_bp.route('/api/superadmin/login', methods=['POST'])
def superadmin_login():
    auth = request.json
    if not auth or not auth.get('username') or not auth.get('password'):
        return jsonify({'message': 'Cannot verify; missing username or password.'}), 401

    user = current_app.db.users.find_one({'username': auth.get('username')})
    if not user or user.get('role') != 'superadmin':
        return jsonify({'message': 'User not found or insufficient permissions.'}), 401
    if not check_password_hash(user['password'], auth.get('password')):
        return jsonify({'message': 'Cannot verify; incorrect password.'}), 401

    try:
        beijing_tz = pytz.timezone('Asia/Shanghai')
        now = datetime.now(beijing_tz)
        today_str = now.strftime('%Y-%m-%d')
        current_app.db.users.update_one(
            {'_id': user['_id']},
            {'$set': {'last_login': now.isoformat()}, '$addToSet': {'login_days': today_str}}
        )
    except Exception:
        pass

    token = jwt.encode({
        'user_id': str(user['_id']),
        'role': 'superadmin',
        'exp': datetime.now(timezone.utc) + timedelta(hours=24)
    }, current_app.config['SECRET_KEY'], algorithm="HS256")
    return jsonify({'token': token}), 200


@auth_bp.route('/api/superadmin/pending-teachers', methods=['GET'])
@superadmin_required
def superadmin_pending_teachers():
    # Extra origin hardening: if FRONT_ORIGIN configured, enforce it
    front = os.getenv('FRONT_ORIGIN')
    origin = request.headers.get('Origin')
    if front and origin and origin.rstrip('/') != front.rstrip('/'):
        return jsonify({'message': 'Forbidden'}), 403
    try:
        cursor = current_app.db.users.find({'role': 'admin', '$or': [{'approved': {'$exists': False}}, {'approved': False}]}, {
            '_id': 1, 'username': 1, 'created_at': 1, 'approved': 1
        })
        data = [{
            'user_id': str(doc['_id']),
            'username': doc.get('username'),
            'created_at': doc.get('created_at'),
            'approved': bool(doc.get('approved', False))
        } for doc in cursor]
        return jsonify(data), 200
    except Exception:
        return jsonify({'message': 'Failed to fetch pending teachers'}), 500


@auth_bp.route('/api/superadmin/approve-teacher', methods=['POST'])
@superadmin_required
def superadmin_approve_teacher():
    # Extra origin hardening: if FRONT_ORIGIN configured, enforce it
    front = os.getenv('FRONT_ORIGIN')
    origin = request.headers.get('Origin')
    if front and origin and origin.rstrip('/') != front.rstrip('/'):
        return jsonify({'message': 'Forbidden'}), 403
    data = request.get_json() or {}
    username = (data.get('username') or '').strip()
    user_id = (data.get('user_id') or '').strip()
    if not username and not user_id:
        return jsonify({'message': 'Missing username or user_id'}), 400
    try:
        query = {'role': 'admin', 'approved': {'$ne': True}}
        if user_id:
            from bson.objectid import ObjectId
            try:
                query['_id'] = ObjectId(user_id)
            except Exception:
                return jsonify({'message': 'Invalid user_id'}), 400
        else:
            query['username'] = username
        result = current_app.db.users.update_one(query, {'$set': {'approved': True}})
        if result.matched_count == 0:
            return jsonify({'message': 'No pending teacher found'}), 404
        return jsonify({'message': 'Approved'}), 200
    except Exception:
        return jsonify({'message': 'Approval failed'}), 500


@auth_bp.route('/api/superadmin/impersonate', methods=['POST'])
@superadmin_required
def superadmin_impersonate():
    """Issue a JWT for the specified account (admin or user) so Superadmin can log in as them."""

    data = request.get_json(silent=True) or {}
    username = (data.get('username') or '').strip()
    user_id = (data.get('user_id') or '').strip()
    if not username and not user_id:
        return jsonify({'message': 'Missing username or user_id'}), 400
    try:
        # Locate target user
        if user_id:
            from bson.objectid import ObjectId
            try:
                oid = ObjectId(user_id)
            except Exception:
                return jsonify({'message': 'Invalid user_id'}), 400
            target = current_app.db.users.find_one({'_id': oid})
        else:
            target = current_app.db.users.find_one({'username': username})
        if not target:
            return jsonify({'message': 'Target user not found'}), 404

        # Build token using target's role
        role = target.get('role', 'user')
        token = jwt.encode({
            'user_id': str(target['_id']),
            'role': role,
            'exp': datetime.now(timezone.utc) + timedelta(hours=24)
        }, current_app.config['SECRET_KEY'], algorithm="HS256")

        # Update last_login/login_days for visibility
        try:
            beijing_tz = pytz.timezone('Asia/Shanghai')
            now = datetime.now(beijing_tz)
            today_str = now.strftime('%Y-%m-%d')
            current_app.db.users.update_one(
                {'_id': target['_id']},
                {'$set': {'last_login': now.isoformat()}, '$addToSet': {'login_days': today_str}}
            )
        except Exception:
            pass

        return jsonify({'token': token, 'role': role, 'username': target.get('username')}), 200
    except Exception as e:
        return jsonify({'message': 'Impersonation failed', 'error': str(e)}), 500

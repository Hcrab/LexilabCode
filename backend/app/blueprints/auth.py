import jwt
from functools import wraps
from flask import request, jsonify, Blueprint, current_app
from werkzeug.security import check_password_hash, generate_password_hash
from ..extensions import users_collection, logger
from ..config import BEIJING_TZ
from datetime import timedelta, datetime, timezone

auth_bp = Blueprint('auth', __name__)

def auth_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        logger.info(f"--- ENTERING auth_required for endpoint: {request.path} ---")
        token = None
        auth_header = request.headers.get('Authorization')
        fallback_header = request.headers.get('x-access-token')
        
        logger.info(f"Headers received: Authorization='{auth_header}', x-access-token='{fallback_header}'")

        if auth_header:
            parts = auth_header.split()
            if len(parts) == 2 and parts[0].lower() == 'bearer':
                token = parts[1]
                logger.info("Token found in 'Authorization: Bearer' header.")
            else:
                logger.warning("Authorization header is malformed.")
        elif fallback_header:
            token = fallback_header
            logger.info("Token found in fallback 'x-access-token' header.")

        if not token:
            logger.error("Authentication failed: Token is missing from all expected headers.")
            return jsonify({'message': 'Token is missing or in an invalid format!'}), 401

        try:
            data = jwt.decode(token, current_app.config['SECRET_KEY'], algorithms=["HS256"])
            username = data.get('username')
            logger.info(f"Token decoded successfully for username: '{username}'")

            current_user = users_collection.find_one({'username': username})
            
            if not current_user:
                logger.error(f"Authentication failed: User '{username}' from token not found in database.")
                return jsonify({'message': 'User not found.'}), 401
            
            logger.info(f"--- EXITING auth_required (SUCCESS) for user '{username}' ---")
            return f(current_user, *args, **kwargs)

        except jwt.ExpiredSignatureError:
            logger.error("Authentication failed: Token has expired.", exc_info=True)
            return jsonify({'message': 'Token has expired!'}), 401
        except jwt.InvalidTokenError as e:
            logger.error(f"Authentication failed: Token is invalid. Error: {e}", exc_info=True)
            return jsonify({'message': 'Token is invalid!'}), 401
        except Exception as e:
            logger.error(f"An unexpected error occurred during token validation: {e}", exc_info=True)
            return jsonify({'message': 'Internal server error during authentication.'}), 500
        
    return decorated_function

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        logger.info(f"--- ENTERING admin_required for endpoint: {request.path} ---")
        token = None
        auth_header = request.headers.get('Authorization')
        fallback_header = request.headers.get('x-access-token')
        
        logger.info(f"Headers received: Authorization='{auth_header}', x-access-token='{fallback_header}'")

        if auth_header:
            parts = auth_header.split()
            if len(parts) == 2 and parts[0].lower() == 'bearer':
                token = parts[1]
                logger.info("Token found in 'Authorization: Bearer' header.")
            else:
                logger.warning("Authorization header is malformed.")
        elif fallback_header:
            token = fallback_header
            logger.info("Token found in fallback 'x-access-token' header.")

        if not token:
            logger.error("Authentication failed: Token is missing from all expected headers.")
            return jsonify({'message': 'Token is missing or in an invalid format!'}), 401

        try:
            data = jwt.decode(token, current_app.config['SECRET_KEY'], algorithms=["HS256"])
            username = data.get('username')
            logger.info(f"Token decoded successfully for username: '{username}'")

            current_user = users_collection.find_one({'username': username})
            
            if not current_user:
                logger.error(f"Authentication failed: User '{username}' from token not found in database.")
                return jsonify({'message': 'User not found.'}), 401

            user_role = current_user.get('role')
            logger.info(f"User '{username}' found in DB with role: '{user_role}'")

            if user_role != 'admin':
                logger.error(f"Authorization failed: User '{username}' role '{user_role}' is not 'admin'.")
                return jsonify({'message': 'Admin access required.'}), 403
            
            logger.info(f"--- EXITING admin_required (SUCCESS) for user '{username}' ---")
            return f(current_user, *args, **kwargs)

        except jwt.ExpiredSignatureError:
            logger.error("Authentication failed: Token has expired.", exc_info=True)
            return jsonify({'message': 'Token has expired!'}), 401
        except jwt.InvalidTokenError as e:
            logger.error(f"Authentication failed: Token is invalid. Error: {e}", exc_info=True)
            return jsonify({'message': 'Token is invalid!'}), 401
        except Exception as e:
            logger.error(f"An unexpected error occurred during token validation: {e}", exc_info=True)
            return jsonify({'message': 'Internal server error during authentication.'}), 500
        
    return decorated_function

def get_user_or_none():
    token = None
    auth_header = request.headers.get('Authorization')
    fallback_header = request.headers.get('x-access-token')

    if auth_header:
        parts = auth_header.split()
        if len(parts) == 2 and parts[0].lower() == 'bearer':
            token = parts[1]
    elif fallback_header:
        token = fallback_header

    if not token:
        return None

    try:
        data = jwt.decode(token, current_app.config['SECRET_KEY'], algorithms=["HS256"])
        username = data.get('username')
        return users_collection.find_one({'username': username})
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None

@auth_bp.route("/login", methods=['POST'])
def login():
    data = request.get_json(force=True)
    username = data.get("username")
    password = data.get("password")
    if not (username and password):
        return jsonify(error="missing fields"), 400

    user = users_collection.find_one({"username": username})

    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify(error="invalid credentials"), 401

    users_collection.update_one(
        {"_id": user["_id"]},
        {"$set": {"last_login": datetime.now(timezone.utc)}}
    )
    
    token = jwt.encode({
        'username': user['username'],
        'role': user.get('role'),
        'exp': datetime.now(timezone.utc) + timedelta(hours=24)
    }, current_app.config['SECRET_KEY'], algorithm="HS256")

    return jsonify(
        token=token,
        role=user.get("role"), 
        english_name=user.get("english_name")
    )

@auth_bp.route("/account/password", methods=['PUT'])
@admin_required
def update_password(current_user):
    data = request.get_json(force=True)
    old_password = data.get("old_password")
    new_password = data.get("new_password")

    if not (old_password and new_password):
        return jsonify(error="missing fields"), 400

    if not check_password_hash(current_user["password_hash"], old_password):
        return jsonify(error="Invalid old password"), 401

    new_password_hash = generate_password_hash(new_password)
    users_collection.update_one(
        {"_id": current_user["_id"]},
        {"$set": {"password_hash": new_password_hash}}
    )

    return jsonify(ok=True)

@auth_bp.route("/user/password", methods=['PUT'])
def update_user_password():
    token = None
    auth_header = request.headers.get('Authorization')
    fallback_header = request.headers.get('x-access-token')

    if auth_header:
        parts = auth_header.split()
        if len(parts) == 2 and parts[0].lower() == 'bearer':
            token = parts[1]
    elif fallback_header:
        token = fallback_header

    if not token:
        return jsonify({'message': 'Token is missing!'}), 401

    try:
        data = jwt.decode(token, current_app.config['SECRET_KEY'], algorithms=["HS256"])
        username = data.get('username')
        current_user = users_collection.find_one({'username': username})
        if not current_user:
            return jsonify({'message': 'User not found.'}), 401
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return jsonify({'message': 'Token is invalid or expired!'}), 401

    data = request.get_json(force=True)
    old_password = data.get("old_password")
    new_password = data.get("new_password")

    if not (old_password and new_password):
        return jsonify(error="missing fields"), 400

    if not check_password_hash(current_user["password_hash"], old_password):
        return jsonify(error="Invalid old password"), 401

    new_password_hash = generate_password_hash(new_password)
    users_collection.update_one(
        {"_id": current_user["_id"]},
        {"$set": {"password_hash": new_password_hash}}
    )

    return jsonify(ok=True)


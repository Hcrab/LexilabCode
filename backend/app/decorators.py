from functools import wraps
from flask import request, jsonify, current_app, g
import jwt
from bson.objectid import ObjectId

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if 'Authorization' in request.headers:
            try:
                token = request.headers['Authorization'].split(" ")[1]
            except IndexError:
                return jsonify({'message': 'Missing or invalid token'}), 401

        if not token:
            return jsonify({'message': 'Authorization token is required'}), 401

        try:
            data = jwt.decode(token, current_app.config['SECRET_KEY'], algorithms=["HS256"])
            user_id = data['user_id']
            
            user = current_app.db.users.find_one({'_id': ObjectId(user_id)})
            
            if not user:
                 return jsonify({'message': 'User not found'}), 401
            
            g.current_user = user

        except jwt.ExpiredSignatureError:
            return jsonify({'message': 'Token expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'message': 'Invalid token'}), 401
        
        return f(*args, **kwargs)
    return decorated

def admin_required(f):
    @wraps(f)
    @token_required
    def decorated(*args, **kwargs):
        if g.current_user.get('role') != 'admin':
            return jsonify({'message': 'Admin privileges required'}), 403
        return f(*args, **kwargs)
    return decorated

def superadmin_required(f):
    @wraps(f)
    @token_required
    def decorated(*args, **kwargs):
        if g.current_user.get('role') != 'superadmin':
            return jsonify({'message': 'Superadmin privileges required'}), 403
        return f(*args, **kwargs)
    return decorated

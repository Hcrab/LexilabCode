from flask import Blueprint, request, jsonify, g, current_app
from werkzeug.security import check_password_hash, generate_password_hash
from ..decorators import token_required
from bson.objectid import ObjectId
from datetime import datetime

user_bp = Blueprint('user_bp', __name__)

@user_bp.route('/api/user/profile', methods=['GET'])
@token_required
def get_user_profile():
    """
    Fetches the profile of the currently logged-in user.
    Adds class memberships for students.
    """
    user = g.current_user
    profile = {
        'username': user.get('username'),
        'nickname': user.get('nickname'),
        'has_security_answer': bool(user.get('security_answer_hash'))
    }
    try:
        # Lookup classes that include this user as a student
        uid = user.get('_id')
        cur = current_app.db.classes.find({'students': uid}, {'_id': 1, 'name': 1})
        classes = [{'id': str(c['_id']), 'name': c.get('name', '')} for c in cur]
        profile['classes'] = classes
    except Exception:
        profile['classes'] = []
    return jsonify(profile), 200

@user_bp.route('/api/user/profile', methods=['PUT'])
@token_required
def update_user_profile():
    """
    Updates the profile of the currently logged-in user.
    Can update nickname or password.
    """
    data = request.get_json()
    user_id = g.current_user.get('_id')
    
    # Update nickname
    if 'nickname' in data:
        new_nickname = data['nickname']
        # Enforce: students can only set nickname if it's not set or empty
        try:
            user_doc = current_app.db.users.find_one({'_id': user_id}, {'role': 1, 'nickname': 1}) or {}
        except Exception:
            user_doc = {'role': g.current_user.get('role'), 'nickname': g.current_user.get('nickname')}
        role = user_doc.get('role')
        existing = (user_doc.get('nickname') or '')
        if role == 'user' and isinstance(existing, str) and existing.strip() != '':
            return jsonify({'message': 'Student nickname is already set and cannot be changed.'}), 403
        current_app.db.users.update_one(
            {'_id': user_id},
            {'$set': {'nickname': new_nickname}}
        )
        return jsonify({'message': '昵称更新成功'}), 200

    # Update password
    if 'current_password' in data and 'new_password' in data:
        user = current_app.db.users.find_one({'_id': user_id})
        
        if not check_password_hash(user['password'], data['current_password']):
            return jsonify({'message': '当前密码不正确'}), 400
            
        new_password_hash = generate_password_hash(data['new_password'])
        current_app.db.users.update_one(
            {'_id': user_id},
            {'$set': {'password': new_password_hash}}
        )
        return jsonify({'message': '密码更新成功'}), 200

    # Set or update security question answer
    if 'security_answer' in data:
        answer = (data.get('security_answer') or '').strip()
        if not answer:
            return jsonify({'message': '答案不能为空'}), 400
        answer_hash = generate_password_hash(answer)
        current_app.db.users.update_one(
            {'_id': user_id},
            {'$set': {'security_answer_hash': answer_hash}}
        )
        return jsonify({'message': '验证问题答案已更新'}), 200

    return jsonify({'message': '无效的请求'}), 400

@user_bp.route('/api/hello')
def hello():
    return jsonify(message="来自后端的问候！")


@user_bp.route('/api/user/bookmark-question', methods=['POST'])
@token_required
def bookmark_question():
    """
    Save a quiz question into the current user's saved_questions list.
    Body: {
      prompt: str,
      word: str,
      correct_answer: str|null,
      user_answer: str,
      ai_feedback: str|null,
      result_id: str|null,
      quiz_id: str|null,
      question_index: int|null
    }
    """
    data = request.get_json(silent=True) or {}
    user = g.current_user
    user_id = user.get('_id')

    item = {
        'prompt': (data.get('prompt') or '').strip(),
        'word': (data.get('word') or '').strip(),
        'correct_answer': (data.get('correct_answer') or '') or None,
        'user_answer': (data.get('user_answer') or '').strip(),
        'ai_feedback': (data.get('ai_feedback') or '') or None,
        'quiz_id': (data.get('quiz_id') or '') or None,
        'result_id': (data.get('result_id') or '') or None,
        'question_index': data.get('question_index'),
        'saved_at': datetime.utcnow().isoformat()
    }
    # Basic validation
    if not item['prompt'] and not item['word']:
        return jsonify({'error': 'missing prompt/word'}), 400

    try:
        # Ensure array exists and push item
        current_app.db.users.update_one(
            {'_id': user_id},
            {'$push': {'saved_questions': item}}
        )
        return jsonify({'message': 'saved'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@user_bp.route('/api/user/bookmark-question', methods=['DELETE'])
@token_required
def unbookmark_question():
    """
    Remove a previously saved quiz question from the current user's saved_questions.
    Body: { result_id: str, question_index: int }
    """
    data = request.get_json(silent=True) or {}
    result_id = (data.get('result_id') or '').strip()
    qidx = data.get('question_index')
    if not result_id or qidx is None:
        return jsonify({'error': 'missing result_id or question_index'}), 400
    try:
        user_id = g.current_user.get('_id')
        res = current_app.db.users.update_one(
            {'_id': user_id},
            {'$pull': {'saved_questions': {'result_id': result_id, 'question_index': qidx}}}
        )
        return jsonify({'message': 'removed', 'modified': res.modified_count}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@user_bp.route('/api/user/saved-questions', methods=['GET'])
@token_required
def list_saved_questions():
    """
    Return the current user's saved quiz questions (bookmarks).
    Tries to enrich with quiz name from results if possible.
    """
    try:
        user = g.current_user
        saved = list(user.get('saved_questions') or [])
        items = []
        # Build a cache to avoid repeated DB lookups
        result_name_cache = {}
        for it in saved:
            if not isinstance(it, dict):
                continue
            result_id = (it.get('result_id') or '').strip()
            quiz_name = None
            if result_id:
                if result_id in result_name_cache:
                    quiz_name = result_name_cache[result_id]
                else:
                    # Try to fetch results.<_id> to read details.name
                    try:
                        from bson.objectid import ObjectId
                        rid = ObjectId(result_id)
                        rdoc = current_app.db.results.find_one({'_id': rid}, {'details': 1})
                        if rdoc and isinstance(rdoc.get('details'), dict):
                            quiz_name = rdoc['details'].get('name')
                    except Exception:
                        quiz_name = None
                    result_name_cache[result_id] = quiz_name
            items.append({
                '_id': f"{result_id}:{it.get('question_index')}",
                'type': 'error_question',
                'quiz_id': it.get('quiz_id'),
                'result_id': result_id or None,
                'question_index': it.get('question_index'),
                'user_answer': it.get('user_answer'),
                'word': it.get('word'),
                'definition': None,
                'created_at': it.get('saved_at'),
                'quiz_name': quiz_name,
                'question_prompt': it.get('prompt'),
                'correct_answer': it.get('correct_answer'),
                'ai_feedback': it.get('ai_feedback'),
            })
        # Newest first
        items.sort(key=lambda x: (x.get('created_at') or ''), reverse=True)
        return jsonify(items), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@user_bp.route('/api/user/save-vocab', methods=['POST'])
@token_required
def save_vocab_to_private_wordbook():
    """
    Add a vocab to the user's private wordbook named "my vocabs".
    Creates the wordbook if it does not exist.
    Body: { word: str, definition?: str }
    """
    data = request.get_json(silent=True) or {}
    word = (data.get('word') or '').strip()
    if not word:
        return jsonify({'error': 'missing word'}), 400
    definition = (data.get('definition') or '').strip()

    user = g.current_user
    user_id = user.get('_id')
    username = user.get('username')

    try:
        # Find or create the private wordbook for this user
        wb = current_app.db.wordbooks.find_one({'title': 'my vocabs', 'owner_id': user_id})
        if not wb:
            wb_doc = {
                'title': 'my vocabs',
                'description': f"Private vocabulary book for {username}",
                'categories': [],
                'entries': [],
                'accessibility': 'private',
                'owner_id': user_id,
                'owner_username': username,
                'created_at': datetime.utcnow().isoformat()
            }
            ins = current_app.db.wordbooks.insert_one(wb_doc)
            wb = current_app.db.wordbooks.find_one({'_id': ins.inserted_id})

        # Check if word already exists in entries
        exists = current_app.db.wordbooks.find_one({
            '_id': wb['_id'],
            'entries.word': word
        })
        if exists:
            return jsonify({'message': 'already_exists'}), 200

        # Determine next number
        entries = wb.get('entries', []) or []
        max_number = max([e.get('number', 0) for e in entries], default=0)
        entry = {'number': max_number + 1, 'word': word, 'tags': []}

        # Append entry
        current_app.db.wordbooks.update_one(
            {'_id': wb['_id']},
            {'$push': {'entries': entry}}
        )

        # Optionally write a simple user-side log of saved vocab
        if definition:
            current_app.db.users.update_one(
                {'_id': user_id},
                {'$addToSet': {'saved_vocabs': {'word': word, 'definition': definition}}}
            )

        return jsonify({'message': 'saved', 'wordbook_id': str(wb['_id'])}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@user_bp.route('/api/user/save-vocab', methods=['DELETE'])
@token_required
def unsave_vocab_from_private_wordbook():
    """
    Remove a vocab from the user's private wordbook "my vocabs".
    Body: { word: str }
    """
    data = request.get_json(silent=True) or {}
    word = (data.get('word') or '').strip()
    if not word:
        return jsonify({'error': 'missing word'}), 400
    try:
        user = g.current_user
        user_id = user.get('_id')
        wb = current_app.db.wordbooks.find_one({'title': 'my vocabs', 'owner_id': user_id})
        if not wb:
            return jsonify({'message': 'not_found'}), 200
        res = current_app.db.wordbooks.update_one(
            {'_id': wb['_id']},
            {'$pull': {'entries': {'word': word}}}
        )
        return jsonify({'message': 'removed', 'modified': res.modified_count}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

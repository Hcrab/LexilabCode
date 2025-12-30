from flask import Blueprint, request, jsonify, g, current_app
from bson.objectid import ObjectId
from ..decorators import admin_required, superadmin_required, token_required

wordbook_bp = Blueprint('wordbook_bp', __name__)

@wordbook_bp.route('/api/wordbooks', methods=['GET'])
@token_required
def get_wordbooks():
    """
    Fetches wordbooks with role-aware filtering.
    - Teachers (admin): public wordbooks + their own teacher_secret wordbooks.
    - Students (user): public wordbooks + their own private wordbooks.
    - Superadmin: all wordbooks.
    """
    try:
        user = g.current_user or {}
        role = user.get('role')
        query = {}
        if role == 'admin':
            # Show only public and the teacher's own secret wordbooks
            query = {
                '$or': [
                    {'accessibility': 'public'},
                    {'accessibility': {'$exists': False}},
                    {'creator_id': user.get('_id'), 'accessibility': 'teacher_secret'}
                ]
            }
        elif role == 'user':
            # Show only public and the student's own private wordbooks
            query = {
                '$or': [
                    {'accessibility': 'public'},
                    {'accessibility': {'$exists': False}},
                    {'creator_id': user.get('_id'), 'accessibility': 'private'}
                ]
            }
        else:
            # superadmin or unknown -> default to all for superadmin, public for unknown
            if role == 'superadmin':
                query = {}
            else:
                query = {
                    '$or': [
                        {'accessibility': 'public'},
                        {'accessibility': {'$exists': False}},
                    ]
                }

        # Also return accessibility if present so frontend can filter private/public
        wordbooks = list(current_app.db.wordbooks.find(query, {'_id': 1, 'title': 1, 'description': 1, 'accessibility': 1}))
        for wb in wordbooks:
            wb['_id'] = str(wb['_id'])
        return jsonify(wordbooks), 200
    except Exception as e:
        return jsonify({'message': 'Failed to fetch wordbooks', 'error': str(e)}), 500

@wordbook_bp.route('/api/wordbooks/<wordbook_id>', methods=['GET'])
@token_required
def get_wordbook_details(wordbook_id):
    """
    Fetches details for a single wordbook, populating its entries with full word details.
    Supports pagination (pass page and limit) or fetching all entries (pass limit=0).
    Also supports searching and filtering by letter.
    """
    try:
        wordbook_object_id = ObjectId(wordbook_id)
    except Exception:
        return jsonify({'message': 'Invalid wordbook ID'}), 400

    try:
        # Before fetching, auto-clean ghost entries for this wordbook
        try:
            existing_words = set(
                doc.get('word') for doc in current_app.db.words.find({}, {'word': 1}) if doc.get('word')
            )
            if existing_words:
                # Remove entries whose word is not in existing_words
                current_app.db.wordbooks.update_one(
                    {'_id': wordbook_object_id},
                    {'$pull': {'entries': {'word': {'$nin': list(existing_words)}}}}
                )
        except Exception:
            # Cleanup errors should not block details view
            pass

        wordbook = current_app.db.wordbooks.find_one({'_id': wordbook_object_id})
        if not wordbook:
            return jsonify({'message': 'Wordbook not found'}), 404

        # --- Pagination and Filtering Logic ---
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 50)) # Default limit is 50. limit=0 means no pagination.
        search_term = request.args.get('search', '').strip()
        letter = request.args.get('letter', 'All').strip()

        all_entries = wordbook.get('entries', [])
        
        # Filter by search term (if any)
        if search_term:
            all_entries = [e for e in all_entries if search_term.lower() in e['word'].lower()]
            
        # Filter by letter (if any)
        if letter != 'All' and letter.isalpha() and len(letter) == 1:
            all_entries = [e for e in all_entries if e['word'].strip().upper().startswith(letter.upper())]

        # Sort entries by word alphabetically
        all_entries.sort(key=lambda e: e['word'])

        total_entries = len(all_entries)
        
        # Handle pagination or return all
        if limit > 0:
            total_pages = (total_entries + limit - 1) // limit
            start_index = (page - 1) * limit
            end_index = start_index + limit
            entries_to_populate = all_entries[start_index:end_index]
        else: # limit is 0 or less, return all entries
            total_pages = 1 if total_entries > 0 else 0
            entries_to_populate = all_entries

        # --- Populate Entries with Word Details ---
        word_details_map = {}
        word_names_to_fetch = [entry['word'] for entry in entries_to_populate]
        
        if word_names_to_fetch:
            words_cursor = current_app.db.words.find(
                {'word': {'$in': word_names_to_fetch}},
                {'_id': 0, 'word': 1, 'definition_cn': 1} # Projection
            )
            for word_doc in words_cursor:
                word_details_map[word_doc['word']] = word_doc

        # Merge details into entries
        populated_entries = []
        for entry in entries_to_populate:
            details = word_details_map.get(entry['word'], {})
            populated_entries.append({
                'word': entry['word'],
                'tags': entry.get('tags', []),
                'number': entry.get('number'),
                'definition_cn': details.get('definition_cn', 'N/A')
            })

        # --- Prepare Response ---
        response = {
            '_id': str(wordbook['_id']),
            'title': wordbook.get('title'),
            'description': wordbook.get('description'),
            'categories': wordbook.get('categories', []),
            'entries': populated_entries, # Send populated entries
            'total_entries': total_entries,
            'pages': total_pages,
            'current_page': page if limit > 0 else 1
        }

        return jsonify(response), 200
    except Exception as e:
        current_app.logger.error(f"Error fetching wordbook details: {e}")
        return jsonify({'message': 'Failed to fetch wordbook details', 'error': str(e)}), 500

@wordbook_bp.route('/api/wordbooks', methods=['POST'])
@superadmin_required
def create_wordbook():
    """
    Creates a new wordbook.
    """
    data = request.get_json()
    title = data.get('title')
    description = data.get('description')

    if not title:
        return jsonify({'message': 'Missing title'}), 400

    new_wordbook = {
        'title': title,
        'description': description,
        'categories': [],
        'entries': []
    }

    try:
        result = current_app.db.wordbooks.insert_one(new_wordbook)
        created_wordbook = current_app.db.wordbooks.find_one({'_id': result.inserted_id})
        
        created_wordbook['_id'] = str(created_wordbook['_id'])
        
        return jsonify(created_wordbook), 201
    except Exception as e:
        return jsonify({'message': 'Failed to create wordbook', 'error': str(e)}), 500

@wordbook_bp.route('/api/wordbooks/<wordbook_id>', methods=['PUT'])
@superadmin_required
def update_wordbook(wordbook_id):
    """
    Updates basic fields of a wordbook (e.g., title, description).
    """
    try:
        wordbook_object_id = ObjectId(wordbook_id)
    except Exception:
        return jsonify({'message': 'Invalid wordbook ID'}), 400

    data = request.get_json() or {}
    update_fields = {}
    if 'title' in data and isinstance(data['title'], str) and data['title'].strip():
        update_fields['title'] = data['title'].strip()
    if 'description' in data and isinstance(data['description'], str):
        update_fields['description'] = data['description']

    if not update_fields:
        return jsonify({'message': 'No updatable fields'}), 400

    try:
        result = current_app.db.wordbooks.update_one({'_id': wordbook_object_id}, {'$set': update_fields})
        if result.matched_count == 0:
            return jsonify({'message': 'Wordbook not found'}), 404
        updated = current_app.db.wordbooks.find_one({'_id': wordbook_object_id}, {'_id': 1, 'title': 1, 'description': 1, 'accessibility': 1})
        updated['_id'] = str(updated['_id'])
        return jsonify(updated), 200
    except Exception as e:
        return jsonify({'message': 'Failed to update wordbook', 'error': str(e)}), 500

@wordbook_bp.route('/api/wordbooks/<wordbook_id>/words', methods=['POST'])
@superadmin_required
def add_words_to_wordbook(wordbook_id):
    """
    Adds a list of words to a specific wordbook.
    """
    data = request.get_json()
    word_names = data.get('words')

    if not word_names or not isinstance(word_names, list):
        return jsonify({'message': 'Missing words list'}), 400

    try:
        wordbook_object_id = ObjectId(wordbook_id)
    except Exception:
        return jsonify({'message': 'Invalid wordbook ID'}), 400

    wordbook = current_app.db.wordbooks.find_one({'_id': wordbook_object_id})
    if not wordbook:
        return jsonify({'message': 'Wordbook not found'}), 404

    # Find the current max entry number
    max_number = 0
    if wordbook.get('entries'):
        max_number = max(entry['number'] for entry in wordbook['entries'])

    # Prepare new entries
    new_entries = []
    for i, word_name in enumerate(word_names, 1):
        new_entries.append({
            'number': max_number + i,
            'word': word_name,
            'tags': []  # Default empty tags
        })

    # Add new entries to the wordbook
    result = current_app.db.wordbooks.update_one(
        {'_id': wordbook_object_id},
        {'$addToSet': {'entries': {'$each': new_entries}}}
    )

    return jsonify({'message': f'Added {len(new_entries)} words to the wordbook'}), 200

@wordbook_bp.route('/api/wordbooks/<wordbook_id>/words/<path:word_identifier>', methods=['DELETE'])
@superadmin_required
def remove_word_from_wordbook(wordbook_id, word_identifier):
    """
    Removes a single word from a wordbook's entries using its identifier.
    """
    try:
        wordbook_object_id = ObjectId(wordbook_id)
    except Exception:
        return jsonify({'message': 'Invalid wordbook ID'}), 400

    result = current_app.db.wordbooks.update_one(
        {'_id': wordbook_object_id},
        {'$pull': {'entries': {'word': word_identifier}}}
    )

    if result.matched_count == 0:
        return jsonify({'message': 'Wordbook not found'}), 404
    
    if result.modified_count == 0:
        return jsonify({'message': 'The word does not exist in this wordbook'}), 404

    return jsonify({'message': 'Removed word from wordbook'}), 200

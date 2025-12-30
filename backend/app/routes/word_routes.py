from flask import Blueprint, request, jsonify, g, current_app
from bson.objectid import ObjectId
from ..decorators import token_required, admin_required, superadmin_required
import re
import json
from concurrent.futures import ThreadPoolExecutor
import math

word_bp = Blueprint('word_bp', __name__)

@word_bp.route('/api/words', methods=['GET'])
@token_required
def get_all_words():
    """
    Fetches words from the database with pagination, sorting, and searching.
    Aggregates their tags from all wordbooks.
    """
    try:
        # --- Auto ghost cleanup when admin opens word list ---
        try:
            # 1) Remove ghost docs in words: missing/empty 'word' or contains non-ASCII characters
            current_app.db.words.delete_many({
                '$or': [
                    {'word': {'$exists': False}},
                    {'word': {'$type': 10}},  # null
                    {'word': ''},
                    {'word': {'$regex': '^\\s+$'}},
                    {'word': {'$regex': '[^\\x00-\\x7F]'}}  # contains non-ASCII characters
                ]
            })

            # 2) Deduplicate words collection (same 'word' value -> keep earliest)
            try:
                dup_groups = list(current_app.db.words.aggregate([
                    { '$group': { '_id': '$word', 'ids': { '$push': '$_id' }, 'count': { '$sum': 1 } } },
                    { '$match': { 'count': { '$gt': 1 } } }
                ]))
                to_delete_ids = []
                for grp in dup_groups:
                    ids = grp.get('ids', [])
                    if not ids:
                        continue
                    keep_id = min(ids)
                    to_delete_ids.extend([i for i in ids if i != keep_id])
                if to_delete_ids:
                    current_app.db.words.delete_many({'_id': {'$in': to_delete_ids}})
            except Exception:
                pass

            # 3) Remove ghost and duplicate entries in all wordbooks
            existing_words = set(
                doc.get('word') for doc in current_app.db.words.find({}, {'word': 1}) if doc.get('word')
            )
            # Iterate wordbooks with full entries for cleaning
            cursor = current_app.db.wordbooks.find({}, {'entries': 1})
            for wb in cursor:
                entries = wb.get('entries', []) or []
                # Remove ghosts
                before = len(entries)
                entries = [e for e in entries if isinstance(e, dict) and e.get('word') in existing_words]
                # Deduplicate by word (keep first occurrence)
                seen = set()
                deduped = []
                for e in entries:
                    w = e.get('word')
                    if w in seen:
                        continue
                    seen.add(w)
                    deduped.append(e)
                if len(deduped) != before:
                    current_app.db.wordbooks.update_one({'_id': wb['_id']}, {'$set': {'entries': deduped}})
        except Exception:
            # Cleanup errors should not block listing
            pass

        # Pagination and sorting parameters
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 50))
        sort_by = request.args.get('sort', 'word') # Default sort by word
        search_term = request.args.get('search', '')

        # Basic query for searching + filter out invalid words
        query = {}
        if search_term:
            query['word'] = {'$regex': search_term, '$options': 'i'}
        # Enforce non-empty string 'word' and exclude pure whitespace to avoid ghosts in result
        base_filter = {
            '$and': [
                {'word': {'$type': 'string'}},
                {'word': {'$ne': ''}},
                {'word': {'$not': {'$regex': '^\\s*$'}}}
            ]
        }
        if 'word' in query:
            query = {'$and': [base_filter, {'word': query['word']}]} 
        else:
            query = {**base_filter, **query}

        # Get total count for pagination
        total_words = current_app.db.words.count_documents(query)
        total_pages = math.ceil(total_words / limit)

        # Aggregation pipeline
        pipeline = [
            {'$match': query},
            {'$sort': {sort_by: 1}},
            {'$skip': (page - 1) * limit},
            {'$limit': limit},
            {
                '$lookup': {
                    'from': 'wordbooks',
                    'localField': 'word',
                    'foreignField': 'entries.word',
                    'as': 'found_in_wordbooks'
                }
            },
            {
                '$unwind': {
                    'path': '$found_in_wordbooks',
                    'preserveNullAndEmptyArrays': True
                }
            },
            {
                '$unwind': {
                    'path': '$found_in_wordbooks.entries',
                    'preserveNullAndEmptyArrays': True
                }
            },
            {
                '$match': {
                    '$expr': {
                        '$or': [
                            {'$eq': ['$word', '$found_in_wordbooks.entries.word']},
                            {'$not': ['$found_in_wordbooks.entries']}
                        ]
                    }
                }
            },
            {
                '$group': {
                    '_id': '$_id',
                    'word': {'$first': '$word'},
                    'definition_cn': {'$first': '$definition_cn'},
                    'tags': {'$addToSet': '$found_in_wordbooks.entries.tags'}
                }
            },
            {
                '$project': {
                    '_id': 1,
                    'word': 1,
                    'definition_cn': 1,
                    'tags': {
                        '$reduce': {
                            'input': '$tags',
                            'initialValue': [],
                            'in': {'$setUnion': ['$value', '$this']}
                        }
                    }
                }
            },
            {'$sort': {sort_by: 1}} # Sort again after grouping
        ]
        
        words = list(current_app.db.words.aggregate(pipeline))
        
        for word in words:
            word['_id'] = str(word['_id'])
            if word.get('tags') is None:
                word['tags'] = []

        return jsonify({
            'words': words,
            'total': total_words,
            'pages': total_pages,
            'page': page
        }), 200
    except Exception as e:
        current_app.logger.error(f"Error fetching all words with tags: {e}")
        return jsonify({'message': 'Failed to fetch words', 'error': str(e)}), 500


@word_bp.route('/api/words/<word_id>', methods=['DELETE'])
@superadmin_required
def delete_word(word_id):
    """
    Deletes a word from the database.
    """
    try:
        word_object_id = ObjectId(word_id)
    except Exception:
        return jsonify({'message': 'Invalid word id'}), 400

    try:
        result = current_app.db.words.delete_one({'_id': word_object_id})
        if result.deleted_count == 0:
            return jsonify({'message': 'Word not found'}), 404
        return jsonify({'message': 'Deleted'}), 200
    except Exception as e:
        return jsonify({'message': 'Failed to delete word', 'error': str(e)}), 500

@word_bp.route('/api/words/<word_id>', methods=['PUT'])
@superadmin_required
def update_word(word_id):
    """
    Updates an existing word in the database.
    """
    try:
        word_object_id = ObjectId(word_id)
    except Exception:
        return jsonify({'message': 'Invalid word id'}), 400
    
    data = request.get_json()
    if not data:
        return jsonify({'message': 'Missing update data'}), 400

    # Remove _id from data to prevent trying to update the immutable _id field
    if '_id' in data:
        del data['_id']

    try:
        result = current_app.db.words.update_one(
            {'_id': word_object_id},
            {'$set': data}
        )
        if result.matched_count == 0:
            return jsonify({'message': 'Word not found'}), 404
        return jsonify({'message': 'Updated'}), 200
    except Exception as e:
        return jsonify({'message': 'Failed to update word', 'error': str(e)}), 500

@word_bp.route('/api/words/practice/<path:word_name>', methods=['GET'])
@token_required
def get_practice_word(word_name):
    """
    Fetches the full data for a single word for practice.
    The <path:word_name> allows for slashes in the word, e.g. table(n)(1)
    """
    word_data = current_app.db.words.find_one({'word': word_name})
    
    if not word_data:
        return jsonify({'message': 'Word not found'}), 404

    word_data['_id'] = str(word_data['_id'])
    return jsonify(word_data), 200

@word_bp.route('/api/words/generate-data', methods=['POST'])
@superadmin_required
def generate_word_data():
    """
    Generates a full word object by making multiple focused AI calls in parallel.
    Simplified model: no part-of-speech field and no numbered suffix in the word name.
    Input: { word }
    Output: { word, word_root, definition_cn, definition_en, sample_sentences, exercises }
    """
    current_app.logger.info("--- [generate_word_data] START ---")
    data = request.get_json()
    word_root = data.get('word')

    if not word_root:
        current_app.logger.error("--- [generate_word_data] ERROR: 'word' not in request ---")
        return jsonify({'message': 'Request must include a "word"'}), 400

    from ..ai import call_deepseek_api
    user_id = g.current_user['_id']
    app = current_app._get_current_object()
    
    current_app.logger.info(f"--- [generate_word_data] User: {user_id}, Word: {word_root} ---")

    system_prompt = "You are an expert English teacher creating learning materials for Chinese junior high school students. Keep language simple and precise. Always respond with a single valid JSON object."

    def get_core_data(app, word, user_id_for_thread):
        with app.app_context():
            prompt = f"""
            请为英文单词“{word}”生成核心释义（基于该词最常见的含义），返回一个JSON：
            {{
              "definition_cn": "中文释义",
              "definition_en": "A simple English definition suitable for a junior high student."
            }}
            """
            response_str = call_deepseek_api(user_prompt=prompt, system_prompt=system_prompt, expect_json=True, model='deepseek-chat', user_id=user_id_for_thread)
            return json.loads(response_str)

    def get_sample_sentences(app, word, definition_cn, definition_en, user_id_for_thread):
        """Generate three simple and unique sentences sequentially, avoiding duplicates."""
        with app.app_context():
            def one_sentence_prompt(kind, prev):
                if kind == 1:
                    hint = "小学水平"
                elif kind == 2:
                    hint = "初中水平"
                else:
                    hint = "初中水平（不同语境）"
                prev_hint = "\n".join(f"- {p}" for p in prev) if prev else "无"
                return (
                    f"根据该词最常见含义（中文：{definition_cn}; 英文：{definition_en}），生成一个{hint}的英文例句，并给出对应中文翻译。要求：\n"
                    f"1) 句子尽量短，词汇简单（CEFR A1-A2）。\n"
                    f"2) 不得与以下已生成句子重复或高度相似：\n{prev_hint}\n"
                    f"用 JSON 返回：{{\"sentence\": \"英文句子\", \"translation\": \"中文翻译\"}}"
                )

            def _json_pair(kind, prev):
                prompt = one_sentence_prompt(kind, prev)
                try:
                    resp = call_deepseek_api(user_prompt=prompt, system_prompt=system_prompt, expect_json=True, model='deepseek-chat', user_id=user_id_for_thread)
                    data = json.loads(resp)
                    return {
                        'sentence': (data.get('sentence') or '').strip(),
                        'translation': (data.get('translation') or '').strip()
                    }
                except Exception:
                    return {'sentence': '', 'translation': ''}

            results = []
            for k in (1, 2, 3):
                best = {'sentence': '', 'translation': ''}
                for _ in range(3):
                    prev_sentences = [r['sentence'] for r in results]
                    pair = _json_pair(k, prev_sentences)
                    s = pair['sentence']
                    if s and s.lower() not in {p.lower() for p in prev_sentences}:
                        best = pair
                        break
                results.append(best)
            return {'sample_sentences': results}

    # ---- New: generate each exercise field via single-value AI calls and assemble ----
    def _json_value(app, prompt, user_id_for_thread):
        with app.app_context():
            resp = call_deepseek_api(user_prompt=prompt, system_prompt=system_prompt, expect_json=True, model='deepseek-chat', user_id=user_id_for_thread)
            try:
                data = json.loads(resp)
                return data.get('value', '').strip()
            except Exception:
                return ''

    def build_exercises(app, word, definition_cn, definition_en, user_id_for_thread):
        with app.app_context():
            futures = []
            from concurrent.futures import ThreadPoolExecutor

            # Prompts for infer_meaning (per tier)
            def infer_prompt(tier):
                if tier == 'tier_1':
                    return (
                        f"请生成一个英文短段落（约30-50词，SAT 难度），包含丰富的逻辑连接词，并自然包含 [{word}]。"
                        f"不要解释或加引号；仅返回段落文本。用 JSON 返回：{{\"value\": \"...\"}}"
                    )
                if tier == 'tier_2':
                    return (
                        f"请生成一个英文长句（15-25词，TOEFL 难度），必须恰好出现一次并且只出现一次 [{word}]（用方括号括住）。"
                        f"句子不要使用段落结构；不要包含逗号超过2个；避免使用 however/therefore 等明显段落过渡词。"
                        f"不要解释或加引号；仅返回句子文本。用 JSON 返回：{{\"value\": \"...\"}}"
                    )
                # tier_3: Chinese sentence, only English is [word]
                return (
                    f"请生成一个中文句子，其中唯一的英文是 [{word}]，其它全部用中文描述其语境。"
                    f"用 JSON 返回：{{\"value\": \"...\"}}"
                )

            # Prompts for sentence_reordering (scramble) -> sentence_answer per tier
            def scramble_prompt(tier):
                if tier == 'tier_1':
                    return (
                        f"请生成一个英文短段落（约30词，SAT 难度），使用多个逻辑连接词（如 however, therefore, moreover, although 等），并包含 {word}。"
                        f"不要解释或加引号；仅返回段落文本。用 JSON 返回：{{\"value\": \"...\"}}"
                    )
                if tier == 'tier_2':
                    return (
                        f"请生成一个英文长句（15-20词，TOEFL 难度），必须包含 {word}，且严禁使用任何方括号。"
                        f"该句应包含一个从属子句或关系从句，且至少包含一个逗号。与“infer_meaning”的句子在语气与结构上应明显不同（例如可使用被动语态或让步从句）。"
                        f"不要解释或加引号；仅返回句子文本。用 JSON 返回：{{\"value\": \"...\"}}"
                    )
                return (
                    f"请生成一个非常简单的英文句子（5词左右，适合小学生），并包含 {word}。"
                    f"用 JSON 返回：{{\"value\": \"...\"}}"
                )

            # Prompts for synonym_replacement -> sentence per tier
            def synonym_prompt(tier):
                if tier == 'tier_1':
                    return (
                        f"请生成一个英文短段落（约30-50词，SAT 难度），其中 {word} 被其英文同义表达替换，并用[]括住该同义表达。"
                        f"仅返回段落文本；JSON 返回：{{\"value\": \"...\"}}"
                    )
                if tier == 'tier_2':
                    return (
                        f"请生成一个英文长句（15-25词，TOEFL 难度），其中 {word} 被其英文同义表达替换，并用[]括住该同义表达。"
                        f"仅返回句子文本；JSON 返回：{{\"value\": \"...\"}}"
                    )
                return (
                    f"请生成一个中文句子，其中 '{word}' 被它的中文释义替换，并用[]括起来。"
                    f"仅返回句子文本；JSON 返回：{{\"value\": \"...\"}}"
                )

            results = {
                'infer_meaning': {'sentences': {}, 'options_type': {'tier_1': 'en', 'tier_2': 'cn', 'tier_3': 'cn'}},
                'sentence_reordering': {'sentence_answer': {}},
                'synonym_replacement': {'sentence': {}}
            }

            tiers = ['tier_1', 'tier_2', 'tier_3']
            with ThreadPoolExecutor(max_workers=9) as ex:
                # schedule all
                fut_map = {}
                for t in tiers:
                    fut_map[('infer', t)] = ex.submit(_json_value, app, infer_prompt(t), user_id_for_thread)
                    fut_map[('scramble', t)] = ex.submit(_json_value, app, scramble_prompt(t), user_id_for_thread)
                    fut_map[('synonym', t)] = ex.submit(_json_value, app, synonym_prompt(t), user_id_for_thread)

                # collect
                for t in tiers:
                    results['infer_meaning']['sentences'][t] = fut_map[('infer', t)].result()
                    results['sentence_reordering']['sentence_answer'][t] = fut_map[('scramble', t)].result()
                    results['synonym_replacement']['sentence'][t] = fut_map[('synonym', t)].result()

            # Assemble exercises array in old schema
            exercises = [
                {
                    'type': 'infer_meaning',
                    'sentences': results['infer_meaning']['sentences'],
                    'options_type': results['infer_meaning']['options_type']
                },
                {
                    'type': 'sentence_reordering',
                    'sentence_answer': results['sentence_reordering']['sentence_answer']
                },
                {
                    'type': 'synonym_replacement',
                    'sentence': results['synonym_replacement']['sentence']
                }
            ]
            return {'exercises': exercises}

    try:
        current_app.logger.info("--- [generate_word_data] Submitting AI tasks to thread pool ---")
        with ThreadPoolExecutor(max_workers=4) as executor:
            future_core = executor.submit(get_core_data, app, word_root, user_id)

            current_app.logger.info("--- [generate_word_data] Waiting for AI results... ---")
            core_data = future_core.result()
            current_app.logger.info(f"--- [generate_word_data] Received core_data: {core_data} ---")

            future_sentences = executor.submit(get_sample_sentences, app, word_root, core_data.get('definition_cn',''), core_data.get('definition_en',''), user_id)
            future_exercises = executor.submit(build_exercises, app, word_root, core_data.get('definition_cn',''), core_data.get('definition_en',''), user_id)

            sentence_data = future_sentences.result()
            current_app.logger.info(f"--- [generate_word_data] Received sentence_data: {sentence_data} ---")
            
            exercises_data = future_exercises.result()
            current_app.logger.info(f"--- [generate_word_data] Received exercises_data: {exercises_data} ---")

        current_app.logger.info("--- [generate_word_data] All AI tasks completed. Assembling data... ---")
        generated_data = {
            "word": word_root,
            "word_root": word_root,
            **core_data,
            **sentence_data,
            "exercises": exercises_data.get("exercises", [])
        }
        
        current_app.logger.info(f"--- [generate_word_data] Final data: {generated_data} ---")
        current_app.logger.info("--- [generate_word_data] END ---")
        return jsonify(generated_data), 200

    except RuntimeError as e:
        current_app.logger.error(f"--- [generate_word_data] ERROR: AI call failed: {e} ---")
        return jsonify({'message': 'Failed to call AI service.', 'error': str(e)}), 500
    except json.JSONDecodeError as e:
        current_app.logger.error(f"--- [generate_word_data] ERROR: Failed to parse AI response as JSON: {e} ---")
        return jsonify({'message': 'Failed to parse AI response as JSON.'}), 500
    except Exception as e:
        current_app.logger.error(f"--- [generate_word_data] ERROR: An unexpected error occurred: {e} ---", exc_info=True)
        return jsonify({'message': 'An unexpected error occurred.', 'error': str(e)}), 500

@word_bp.route('/api/words/add-word', methods=['POST'])
@admin_required
def add_word():
    """
    Adds a new word to the database from a provided JSON object.
    """
    word_data = request.get_json()

    if not word_data or 'word' not in word_data:
        return jsonify({'message': 'Invalid word data provided.'}), 400

    word_name = word_data['word']

    # Final check for duplicates before inserting
    if current_app.db.words.find_one({'word': word_name}):
        return jsonify({'message': f'Word "{word_name}" already exists.'}), 409

    try:
        result = current_app.db.words.insert_one(word_data)
        return jsonify({
            'message': 'Word added successfully!',
            'word_id': str(result.inserted_id)
        }), 201
    except Exception as e:
        return jsonify({'message': 'An error occurred while adding the word.', 'error': str(e)}), 500


@word_bp.route('/api/words/check-existence', methods=['POST'])
@admin_required
def check_word_existence():
    """
    Checks if a word already exists (by base form).
    """
    data = request.get_json() or {}
    word = data.get('word')
    if not word:
        return jsonify({'message': 'Request must include "word"'}), 400
    try:
        exists = current_app.db.words.find_one({'word': word}) is not None
        return jsonify({'exists': exists}), 200
    except Exception as e:
        current_app.logger.error(f"Error checking word existence: {e}")
        return jsonify({'message': 'An error occurred while checking word existence.', 'error': str(e)}), 500

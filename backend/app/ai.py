import os
import json
from flask import Blueprint, request, jsonify, current_app, g
from openai import OpenAI
from functools import wraps
from bson.objectid import ObjectId
from .decorators import token_required

# --- AI Blueprint Setup ---
ai_bp = Blueprint('ai_bp', __name__)

# --- OpenAI Client Initialization ---
try:
    client = OpenAI(
        api_key=os.getenv("DEEPSEEK_API_KEY"),
        base_url=os.getenv("DEEPSEEK_API_BASE_URL", "https://api.deepseek.com")
    )
    CLIENT_INITIALIZED = True
except Exception as e:
    client = None
    CLIENT_INITIALIZED = False
    print(f"Error initializing OpenAI client: {e}")


# --- AI Core Function ---

def call_deepseek_api(user_prompt: str, user_id: ObjectId, system_prompt: str = "You are a helpful assistant.", expect_json: bool = False, model: str = "deepseek-chat"):
    """
    A generic function to call the DeepSeek API and increment the user's call count.
    
    :param user_prompt: The prompt from the user.
    :param user_id: The ObjectId of the user making the call.
    :param system_prompt: The system message to set the AI's role.
    :param expect_json: Whether to request a JSON response.
    :param model: The model to use for the API call.
    :return: The content of the AI's response.
    :raises RuntimeError: If the AI client is not initialized or the API call fails.
    """
    if not CLIENT_INITIALIZED or client is None:
        raise RuntimeError("AI client is not initialized. Please check environment variables.")

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    
    response_format = {"type": "json_object"} if expect_json else None

    try:
        print(f"--- [AI CALL] User: {user_id}, Model: {model} ---")
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            stream=False,
            response_format=response_format
        )
        print(f"--- [AI SUCCESS] API call for user {user_id} successful. ---")
        
        # Increment user's AI call count on successful API call
        update_result = current_app.db.users.update_one(
            {'_id': user_id},
            {'$inc': {'ai_calls': 1}}
        )
        
        if update_result.modified_count == 0:
            print(f"--- [DB WARNING] Failed to increment ai_calls for user {user_id}. User not found or count not updated. ---")
        else:
            print(f"--- [DB SUCCESS] Incremented ai_calls for user {user_id}. ---")

        ai_response_content = response.choices[0].message.content
        print(f"--- [AI RESPONSE] For User {user_id}: {ai_response_content} ---")
        return ai_response_content
    except Exception as e:
        current_app.logger.error(f"DeepSeek API call failed for user {user_id}: {e}")
        raise RuntimeError(f"DeepSeek API call failed: {e}")


# --- AI Grading Functions ---

def _fill_blank_score_ai(prompt_sentence: str, user_answer: str, target_word: str, user_id: ObjectId) -> dict:
    """
    Grades a fill-in-the-blank question using AI, providing detailed explanation.
    Returns dict with keys: is_correct (bool), feedback (str).
    """
    if len(user_answer or "") == 0:
        return {"is_correct": False, "feedback": "🥲🥲🥲🥲🥲"}

    user_prompt = (
        "You are a strict but fair English teacher grading a fill-in-the-blank quiz. "
        "Your task is to evaluate the student's answer based on two criteria: "
        "1. Is the answer a valid grammatical form of the target word? (e.g., 'ducks' is a form of 'duck'). "
        "2. Is that form grammatically correct in the sentence? (e.g., for 'I saw five ___', 'ducks' is correct, but 'duck' is not).\n\n"
        "The student's answer MUST satisfy BOTH criteria to be correct. Be strict about grammar, including plurals, tenses, and parts of speech.\n\n"
        f'Sentence: "{prompt_sentence}"\n'
        f'Student\'s Answer: "{user_answer}"\n'
        f'Target Word: "{target_word}"\n\n'
        "Provide your assessment as a JSON object with two fields: `is_correct` (boolean) and `feedback` (string). "
        "In the feedback, explain your reasoning clearly. If correct, be encouraging. If incorrect, explain the grammatical error and state the correct answer."
        'Example for incorrect: {"is_correct": false, "feedback": "Good try! However, the sentence requires the plural form. The correct answer is \'ducks\' because of the word \'five\'."}'
        'Example for correct: {"is_correct": true, "feedback": "Excellent! \'Ducks\' is the correct plural form to use in this sentence."}'
    )

    try:
        response_str = call_deepseek_api(
            user_prompt=user_prompt,
            user_id=user_id,
            system_prompt="You are a helpful assistant.",
            expect_json=True,
        )
        data = json.loads(response_str)
        if not isinstance(data, dict) or 'is_correct' not in data or 'feedback' not in data:
            raise json.JSONDecodeError("missing keys", response_str, 0)
        return {"is_correct": bool(data.get('is_correct')), "feedback": str(data.get('feedback') or '').strip()}
    except Exception as e:
        current_app.logger.error(f"AI fill-in-the-blank grading failed for answer '{user_answer}': {e}")
        return {"is_correct": False, "feedback": "Sorry, an error occurred while grading your answer. It has been marked as incorrect."}


def grade_fill_in_the_blank(sentence: str, student_answer: str, correct_answer: str, user_id: ObjectId):
    """
    Wrapper to use the new explanation-based fill-in-the-blank grader.
    Returns a tuple (is_correct: bool, feedback: str).
    """
    data = _fill_blank_score_ai(sentence, student_answer, correct_answer, user_id)
    return bool(data.get('is_correct')), data.get('feedback') or ''


def grade_translation(chinese_sentence: str, student_translation: str, target_word: str, user_id: ObjectId):
    """
    Grades a translation question using AI.
    Returns a tuple (score: int, feedback: str).
    """
    system_prompt = "你是一位有十年教学经验的英语老师，擅长用初中生能听懂的语言讲解复杂的语法点。你的讲解应该既专业又易懂，充满耐心和理性。你的回答必须是一个单独的JSON对象。"
    user_prompt = f"""
    作为一位有十年教学经验、且擅长对初中生讲解的英语老师，请评估学生的翻译。
    
    这道题的核心考察词汇是：“{target_word}”。学生的翻译必须正确使用这个词的某种形式。学生的翻译必须使用这个词的某种形式，如果学生没有使用这个词的某种形式，这个答案直接判定为错，直接一个cross！

    中文原文：“{chinese_sentence}”
    学生的英文翻译：“{student_translation}”

    请根据0-3分的标准评分，并返回一个JSON对象，包含 "score" 和 "feedback" 两个键。
    - "score": 0-3的整数。
    - "feedback": 用初中生能听懂的中文，清晰地解释翻译中的每个错误（语法、词汇等），说明错误原因，并给出应该替换的内容。最后，提供一个修改后的完整句子。
    
    1分示例：
    {{
      "score": 1,
      "feedback": "这句翻译有两个小问题。第一，我们说“看书看了一段时间”，应该用介词 'for'，而不是 'at'。第二，'book' 是一个可数名词，在句子中不能单独出现，前面需要加上 'a' 或 'the' 这样的冠词。所以，一个更好的翻译是：'I read a book for an hour.'"
    }}

    3分示例：
    {{
      "score": 3,
      "feedback": "翻译得很好！"
    }}
    """
    try:
        response_str = call_deepseek_api(
            user_prompt=user_prompt,
            system_prompt=system_prompt,
            expect_json=True,
            user_id=user_id
        )
        response_data = json.loads(response_str)
        return response_data.get('score', 0), response_data.get('feedback', '获取反馈失败。')
    except (RuntimeError, json.JSONDecodeError) as e:
        current_app.logger.error(f"AI translation grading failed for user {user_id}: {e}")
        return 0, "AI评分服务当前不可用，本题未评分。"


def _sentence_score_ai(word: str, sentence: str, definition: str, user_id: ObjectId):
    """
    New sentence scoring using 0-4 scale and English-only feedback.
    Mirrors the provided SYSTEM_PROMPT and response shaping.
    Returns parsed dict with at least keys: score (int), feedback (str).
    """
    SYSTEM_PROMPT = (
        "注意：只输出英文！只输出英文！只输出英文！\n"
        "以下情况 sentence 得 0 分：脏话、色情、敏感信息、未含目标单词、不是完整句子、体现不出单词本义、包含中文、或者没有体现出单词在具体某个definition下的意思。\n\n"
        "评分标准（整数 0–4）：\n"
        "0: 句子不可理解 / 无意义，例如\"I learned the word xxx today\"，完全无法体现目标单词的意思（体现为目标单词可以换为任何单词）\n"
        "1: 严重或大量语法错误，但至少目标单词在这个句子中有一定重要性\n"
        "2: 只有轻微语法 slip，整体能懂\n"
        "3: 无语法错误且表达完整，但句式为简单SVO\n"
        "4: 无语法错误、句式多样且有意义（并非简单SVO，例如从句，文句，平行句)并准确体现目标单词意思\n"
        "之后，在\"feedback\"中，输出具体的英文评语，包括用户（可能）犯的错误，以及最小修正后的句子。如果用户4分，不需要指出错误和修正，赞赏就好\n"
        "你是一名英语教学专家，请依据上述标准为学生造句评分。仅返回 JSON，例如:\n"
        '{"feedback":"...","nogrammarissues":true,"score":}'
    )

    if definition:
        prompt = f"Original word: '{word}'. Definition: '{definition}'. Student's sentence: '{sentence}'"
    else:
        prompt = f"Original word: '{word}'. Student's sentence: '{sentence}'"

    full_prompt = prompt

    response_str = call_deepseek_api(
        user_prompt=full_prompt,
        user_id=user_id,
        system_prompt=SYSTEM_PROMPT,
        expect_json=True
    )
    data = json.loads(response_str)
    # Consolidate feedback fields if present
    if isinstance(data, dict) and ('minimal_fix' in data and 'corrected_sentence' in data):
        try:
            mf = str(data.get('minimal_fix') or '').strip()
            cs = str(data.get('corrected_sentence') or '').strip()
            extra = f"Minimal Fix: {mf}\nCorrected: {cs}".strip()
            if extra:
                base = str(data.get('feedback') or '').strip()
                data['feedback'] = (base + ("\n" if base and extra else "") + extra).strip()
        except Exception:
            pass
    # Normalize score to int and within 0-4
    try:
        sc = int(data.get('score', 0))
    except Exception:
        sc = 0
    data['score'] = max(0, min(4, sc))
    if not isinstance(data.get('feedback'), str):
        data['feedback'] = 'Scored.'
    return data


# --- AI Test Route ---

@ai_bp.route('/api/ai/test-chat', methods=['POST'])
@token_required
def test_chat():
    """
    A test endpoint to verify connection with the DeepSeek API.
    This now also tests the user's AI call count increment.
    """
    data = request.get_json()
    user_content = data.get('prompt')
    user_id = g.current_user['_id']

    if not user_content:
        return jsonify({'message': '请求中缺少提示（prompt）'}), 400

    try:
        ai_message = call_deepseek_api(user_prompt=user_content, user_id=user_id)
        return jsonify({'response': ai_message})
    except RuntimeError as e:
        return jsonify({'message': '调用AI服务时发生错误。', 'error': str(e)}), 500
    except Exception as e:
        current_app.logger.error(f"An unexpected error occurred in test_chat: {e}")
        return jsonify({'message': '发生未知错误。', 'error': str(e)}), 500


@ai_bp.route('/api/ai/explain-reordering', methods=['POST'])
@token_required
def explain_reordering():
    """
    Explains why a sentence reordering (scramble) answer is incorrect.
    Expects JSON: { user_answer: str, correct_answer: str }
    Returns: { explanation: str }
    """
    data = request.get_json() or {}
    user_answer = data.get('user_answer', '').strip()
    correct_answer = data.get('correct_answer', '').strip()

    if not user_answer or not correct_answer:
        return jsonify({'message': '缺少必要参数 user_answer 或 correct_answer'}), 400

    system_prompt = (
        '你是一位耐心的英语老师，请用初中生能听懂的中文，简短解释为什么学生拼出的英文句子顺序不对，'
        '指出关键的语法/搭配/时态/主谓宾顺序问题，并给出正确的句子。你的回答必须是一个JSON对象。'
    )
    user_prompt = f"""
    学生把下面的英文句子单词重组后，得到了一个错误的句子。请简明解释错误原因，并给出正确句子：
    学生答案: "{user_answer}"
    正确答案: "{correct_answer}"

    返回格式（必须是JSON）：
    {{
      "explanation": "一句到两句中文说明哪里错了，以及应该怎么改，并附上正确句子。"
    }}
    """

    try:
        user_id = g.current_user['_id']
        response_str = call_deepseek_api(
            user_prompt=user_prompt,
            user_id=user_id,
            system_prompt=system_prompt,
            expect_json=True
        )
        data = json.loads(response_str)
        explanation = data.get('explanation') or '解析暂不可用，请稍后重试。'
        return jsonify({'explanation': explanation})
    except Exception as e:
        current_app.logger.error(f"Explain reordering failed: {e}")
        return jsonify({'explanation': '解析服务暂不可用，请稍后重试。'}), 200


@ai_bp.route('/api/ai/grade-fill-blank', methods=['POST'])
@token_required
def grade_fill_blank_endpoint():
    """
    Grade a fill-in-the-blank answer.
    Expects JSON: { sentence: str, answer: str, correct_answer: str }
    Returns: { is_correct: bool, feedback: str }
    """
    data = request.get_json(force=True) or {}
    sentence = (data.get('sentence') or '').strip()
    answer = (data.get('answer') or '').strip()
    correct = (data.get('correct_answer') or '').strip()
    if not sentence or not correct:
        return jsonify({'error': 'missing required fields'}), 400
    try:
        user_id = g.current_user['_id']
        ok, fb = grade_fill_in_the_blank(sentence, answer, correct, user_id)
        return jsonify({'is_correct': bool(ok), 'feedback': fb}), 200
    except Exception as e:
        current_app.logger.error(f"grade-fill-blank failed: {e}")
        simple_ok = answer.lower().strip() == correct.lower()
        return jsonify({'is_correct': simple_ok, 'feedback': '已采用简易规则判分。'}), 200


@ai_bp.route('/api/ai/fill-in-blank-score', methods=['POST'])
@token_required
def fill_in_blank_score_alias():
    """Alias endpoint to match reference client."""
    data = request.get_json(force=True) or {}
    prompt = (data.get('prompt') or '').strip()
    answer = (data.get('answer') or '').strip()
    word = (data.get('word') or '').strip()
    if not prompt or not word:
        return jsonify({'error': 'missing required fields'}), 400
    try:
        user_id = g.current_user['_id']
        ok, fb = grade_fill_in_the_blank(prompt, answer, word, user_id)
        return jsonify({'correct': bool(ok), 'feedback': fb}), 200
    except Exception:
        simple_ok = answer.lower().strip() == word.lower()
        return jsonify({'correct': simple_ok, 'feedback': '已采用简易规则判分。'}), 200


@ai_bp.route('/sentence-score', methods=['POST'])
@token_required
def ai_sentence_score():
    data = request.get_json(force=True) or {}
    word = (data.get('word') or '').strip()
    sentence = (data.get('sentence') or '').strip()
    definition = (data.get('definition') or '').strip()
    if not word or not sentence:
        return jsonify(error="missing word or sentence"), 400
    try:
        user_id = g.current_user['_id']
        result = _sentence_score_ai(word, sentence, definition, user_id)
        return jsonify(result), 200
    except Exception as e:
        current_app.logger.exception("internal error during AI scoring")
        return jsonify(error="internal scoring error"), 500


@ai_bp.route('/api/ai/sentence-score', methods=['POST'])
@token_required
def sentence_score():
    # Alias to the new scoring implementation, keeping current frontend path.
    data = request.get_json(force=True) or {}
    word = (data.get('word') or '').strip()
    sentence = (data.get('sentence') or '').strip()
    definition = (data.get('definition') or '').strip()
    if not word or not sentence:
        return jsonify({'error': 'missing required fields'}), 400
    try:
        user_id = g.current_user['_id']
        res = _sentence_score_ai(word, sentence, definition, user_id)
        return jsonify({'score': res.get('score', 0), 'feedback': res.get('feedback', '')}), 200
    except Exception as e:
        current_app.logger.exception("internal error during AI scoring")
        # Return 500 so client can retry per policy
        return jsonify({'error': 'internal scoring error'}), 500


@ai_bp.route('/api/ai/fill-blanks', methods=['POST'])
@token_required
def generate_fill_in_blank_sentence():
    """
    Generate a fill-in-the-blank sentence using the given word.
    Expects JSON: { word: str, definition?: str }
    Returns: { sentence: str }

    Uses five underscores '_____ ' as the blank.
    """
    data = request.get_json(force=True) or {}
    word = (data.get('word') or '').strip()
    definition = (data.get('definition') or '').strip()
    pos = (data.get('pos') or '').strip()
    if not word:
        return jsonify({'error': 'missing word'}), 400

    # Build prompt per requirements with branching on definition/pos/none
    if definition:
        user_prompt = (
            f"Create a single, clear sentence that uses the word '{word}' according to this specific definition: '{definition}'. "
            f"The sentence must provide context clues for this meaning. "
            f"The word in the sentence should be in its simple form (the form provided to you), so that it is THE ANSWER for the question. "
            f"Then, replace the word '{word}' with '_____'. Respond with JSON {{\"sentence\":\"...\"}}."
        )
    elif pos:
        user_prompt = (
            f"Create a single, clear sentence that uses the word '{word}' as a {pos}, reflecting its most common meaning, in a way that provides context clues to its meaning. "
            f"The word in the sentence should be in its simple form (the form provided to you), so that it is THE ANSWER for the question. "
            f"Then, replace the word '{word}' with '_____'. Respond with JSON {{\"sentence\":\"...\"}}."
        )
    else:
        user_prompt = (
            f"Create a single, clear sentence that uses the word '{word}' according to its most common meaning, and provide strong context clues for that meaning. "
            f"In your sentence, the word must appear in its simple/base form (the exact form provided to you) so that it is THE ANSWER for the question. "
            f"Then, replace the word '{word}' with '_____'. Respond with JSON {{\"sentence\":\"...\"}}."
        )

    try:
        user_id = g.current_user['_id']
        response_str = call_deepseek_api(
            user_prompt=user_prompt,
            user_id=user_id,
            system_prompt="You are a helpful assistant.",
            expect_json=True,
            model='deepseek-chat'
        )
        data = json.loads(response_str)
        sentence = (data.get('sentence') or '').strip()
        if not sentence or '_____' not in sentence:
            # Minimal safety fallback if AI returns malformed content
            sentence = "I _____ every day."
        return jsonify({'sentence': sentence}), 200
    except json.JSONDecodeError as e:
        current_app.logger.error(f"AI fill-blanks JSON parse error: {e}")
        return jsonify({'error': 'AI响应解析失败。'}), 502
    except Exception as e:
        current_app.logger.error(f"Error generating fill-in-the-blank sentence: {e}")
        # Very simple generic fallback (still valid shape)
        return jsonify({'sentence': 'I _____ every day.'}), 200

@ai_bp.route('/api/ai/definition', methods=['POST'])
@token_required
def ai_definition():
    """
    Generate a definition string for a given word, optionally guided by a hint.
    Prompt is kept identical to the requested format.
    Expects JSON: { word: str, hint?: str }
    Returns: { definition: str }
    """
    data = request.get_json(force=True) or {}
    word = data.get("word")
    hint = data.get("hint")
    # Direct mode support: if client provides pos+meaning, do NOT call AI; return composed definition.
    direct_pos = (data.get("pos") or "").strip()
    direct_meaning = (data.get("meaning") or "").strip()
    if direct_pos or direct_meaning:
        composed = (f"{direct_pos} {direct_meaning}").strip()
        return jsonify({"definition": composed}), 200
    if not word:
        return jsonify(error="missing word"), 400

    # Base prompt (kept consistent with request)
    prompt_lines = [
        f"For the English word '{word}', provide its primary part of speech (e.g., n., v., adj.), "
        f"a concise English definition, and its common traditional Chinese translation. Also. Then, use parenthesis to add addition information(there are also other definitions, see Cambridge Dictionary)"
    ]

    # Add hint to the prompt if provided
    if hint:
        prompt_lines.append(f"The definition should be specifically related to the concept of '{hint}'.")

    # Add formatting instructions
    prompt_lines.extend([
        "Format the entire response into a single string following this exact pattern: 'POS. English Definition (Chinese Translation)'.",
        "For example: 'Adj. able to withstand or recover quickly from difficult conditions.'.",
        "Respond with a single JSON object with one key, 'definition'.",
        "Example: {\"definition\": \"Adj. able to withstand or recover quickly from difficult conditions.\"}"
    ])

    prompt = " ".join(prompt_lines)

    try:
        user_id = g.current_user['_id']
        response_str = call_deepseek_api(
            user_prompt=prompt,
            user_id=user_id,
            system_prompt="You are an English teaching assistant.",
            expect_json=True
        )
        # Expect JSON like {"definition": "..."}
        data = json.loads(response_str)
        definition = data.get('definition') if isinstance(data, dict) else None
        if not definition or not isinstance(definition, str):
            current_app.logger.error(f"AI response for '{word}' malformed: {response_str}")
            return jsonify(error=f"AI response for '{word}' was malformed."), 502
        return jsonify({"definition": definition})
    except Exception as e:
        current_app.logger.exception(f"Definition generation failed for '{word}': {e}")
        return jsonify(error="Internal server error."), 500

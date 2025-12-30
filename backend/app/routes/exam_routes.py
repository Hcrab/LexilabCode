from flask import Blueprint, request, jsonify, g, current_app
from bson.objectid import ObjectId
from ..decorators import admin_required
import pytz
from datetime import datetime
import json

exam_bp = Blueprint('exam_bp', __name__)

@exam_bp.route('/api/exams/generate-preview', methods=['POST'])
@admin_required
def generate_exam_preview():
    """
    Generates a preview of an exam with fill-in-the-blank and translation questions.
    Uses a single AI call per word for efficiency and consistency.
    """
    data = request.get_json()
    words = data.get('words')

    if not words:
        return jsonify({'message': 'Words list is required'}), 400

    system_prompt = """
    You are an expert curriculum designer creating English materials for Grade 7 students in mainland China.
    Your response MUST be a single, valid JSON object and nothing else. Do not include any text, explanations, or markdown formatting before or after the JSON object.
    All generated content must be simple enough for a Grade 7 student to understand.
    """
    
    questions = []
    try:
        from ..ai import call_deepseek_api
        user_id = g.current_user['_id']

        for word in words:
            word_doc = current_app.db.words.find_one({'word': word})
            if not word_doc:
                continue

            word_root = word_doc.get('word_root', word.split('(')[0])
            definition_cn = word_doc.get('definition_cn', '')

            user_prompt = f"""
            For the word \"{word_root}\" (Chinese meaning: {definition_cn}), generate two sentences for a Grade 7 learner:

            Requirements:
            - The two sentences must be different in context.
            - The translation sentence should be extremely simple and easy to translate.
            - The fill-in-the-blank sentence and the translation sentence must NOT be direct translations of each other.
            - Avoid difficult vocabulary in the translation sentence.

            Return JSON with the following structure:
            {{
              "fill_in_blank": "An English sentence appropriate for a Grade 7 learner where the word {word_root} is replaced by '_____'.",
              "translation": "A very simple Chinese sentence to be translated into an English sentence using {word_root}."
            }}
            """

            response_str = call_deepseek_api(
                user_prompt=user_prompt,
                system_prompt=system_prompt,
                expect_json=True,
                model='deepseek-chat',
                user_id=user_id
            )
            
            response_data = json.loads(response_str)

            questions.append({
                'word': word,
                'fill_in_blank': {
                    'sentence': response_data.get('fill_in_blank', '').strip()
                },
                'translation': {
                    'sentence': response_data.get('translation', '').strip()
                }
            })

        return jsonify(questions), 200

    except json.JSONDecodeError as e:
        current_app.logger.error(f"AI response JSON parsing failed: {e}")
        return jsonify({'message': 'Failed to parse AI response', 'error': str(e)}), 500
    except Exception as e:
        current_app.logger.error(f"Error in generate_exam_preview: {e}")
        return jsonify({'message': 'Failed to generate quiz preview', 'error': str(e)}), 500


@exam_bp.route('/api/exams/drafts', methods=['POST'])
@admin_required
def create_exam_draft():
    """
    Creates and saves a new exam draft.
    """
    data = request.get_json()
    exam_name = data.get('name')
    questions_data = data.get('questions')
    teacher_id = g.current_user['_id']

    if not exam_name or not questions_data:
        return jsonify({'message': 'Name and questions are required'}), 400

    words = [q['word'] for q in questions_data]
    
    questions_to_save = []
    for i, q_data in enumerate(questions_data):
        questions_to_save.append({
            'number': len(questions_to_save) + 1,
            'type': 'fill_in_blank',
            'word': q_data['word'],
            'sentence': q_data['fill_in_blank']['sentence'],
            'score_multiplier': 1
        })
        questions_to_save.append({
            'number': len(questions_to_save) + 1,
            'type': 'translation',
            'word': q_data['word'],
            'sentence': q_data['translation']['sentence'],
            'score_multiplier': 1
        })

    # Compute weighted full score: fill_in_blank=1*mult, translation=3*mult
    weighted_full = 0
    for q in questions_to_save:
        base = 1 if q['type'] == 'fill_in_blank' else 3
        weighted_full += base * q.get('score_multiplier', 1)

    new_exam_draft = {
        'name': exam_name,
        'teacher_id': teacher_id,
        'words': words,
        'full_score': weighted_full,
        'questions': questions_to_save,
        'created_at': datetime.now(pytz.timezone('Asia/Shanghai')),
        'status': 'draft'
    }

    try:
        result = current_app.db.assignments.insert_one(new_exam_draft)
        return jsonify({
            'message': 'Assignment draft saved!',
            'draft_id': str(result.inserted_id)
        }), 201
    except Exception as e:
        current_app.logger.error(f"Error creating assignment draft: {e}")
        return jsonify({'message': 'Failed to save assignment draft', 'error': str(e)}), 500

@exam_bp.route('/api/exams/drafts', methods=['GET'])
@admin_required
def get_exam_drafts():
    """
    Retrieves all exam drafts for the current teacher.
    """
    teacher_id = g.current_user['_id']
    try:
        drafts = list(current_app.db.assignments.find({'teacher_id': teacher_id, 'status': 'draft'}))
        for draft in drafts:
            draft['_id'] = str(draft['_id'])
            if 'teacher_id' in draft:
                draft['teacher_id'] = str(draft['teacher_id'])
        return jsonify(drafts), 200
    except Exception as e:
        current_app.logger.error(f"Error fetching assignment drafts: {e}")
        return jsonify({'message': 'Failed to fetch assignment drafts', 'error': str(e)}), 500

@exam_bp.route('/api/exams/drafts/<draft_id>', methods=['PUT'])
@admin_required
def update_exam_draft(draft_id):
    """
    Updates an existing exam draft.
    """
    data = request.get_json()
    exam_name = data.get('name')
    questions_data = data.get('questions')
    teacher_id = g.current_user['_id']

    if not exam_name or not questions_data:
        return jsonify({'message': 'Name and questions are required'}), 400

    try:
        draft_object_id = ObjectId(draft_id)
    except Exception:
        return jsonify({'message': 'Invalid draft id'}), 400

    # Verify the draft belongs to the current teacher
    draft = current_app.db.assignments.find_one({'_id': draft_object_id, 'teacher_id': teacher_id})
    if not draft:
        return jsonify({'message': 'Draft not found or no permission'}), 404

    words = [q['word'] for q in questions_data]
    questions_to_save = []
    for i, q_data in enumerate(questions_data):
        questions_to_save.append({
            'number': len(questions_to_save) + 1,
            'type': 'fill_in_blank',
            'word': q_data['word'],
            'sentence': q_data['fill_in_blank']['sentence'],
            'score_multiplier': 1
        })
        questions_to_save.append({
            'number': len(questions_to_save) + 1,
            'type': 'translation',
            'word': q_data['word'],
            'sentence': q_data['translation']['sentence'],
            'score_multiplier': 1
        })

    weighted_full = 0
    for q in questions_to_save:
        base = 1 if q['type'] == 'fill_in_blank' else 3
        weighted_full += base * q.get('score_multiplier', 1)

    update_data = {
        'name': exam_name,
        'words': words,
        'full_score': weighted_full,
        'questions': questions_to_save,
    }

    try:
        current_app.db.assignments.update_one({'_id': draft_object_id}, {'$set': update_data})
        return jsonify({'message': '作业草稿已更新!'}), 200
    except Exception as e:
        current_app.logger.error(f"更新作业草稿时出错: {e}")
        return jsonify({'message': '更新作业草稿失败。', 'error': str(e)}), 500

@exam_bp.route('/api/exams/drafts/<draft_id>', methods=['DELETE'])
@admin_required
def delete_exam_draft(draft_id):
    """
    Deletes an exam draft.
    """
    teacher_id = g.current_user['_id']
    try:
        draft_object_id = ObjectId(draft_id)
    except Exception:
        return jsonify({'message': '无效的草稿ID格式。'}), 400

    try:
        result = current_app.db.assignments.delete_one({'_id': draft_object_id, 'teacher_id': teacher_id})
        if result.deleted_count == 0:
            return jsonify({'message': '找不到要删除的草稿或无权删除。'}), 404
        return jsonify({'message': '作业草稿已删除!'}), 200
    except Exception as e:
        current_app.logger.error(f"删除作业草稿时出错: {e}")
        return jsonify({'message': '删除作业草稿失败。', 'error': str(e)}), 500

@exam_bp.route('/api/exams/drafts/<draft_id>/publish', methods=['POST'])
@admin_required
def publish_exam(draft_id):
    """
    Publishes an exam draft to one or more classes.
    """
    data = request.get_json()
    class_ids = data.get('class_ids')
    teacher_id = g.current_user['_id']

    if not class_ids:
        return jsonify({'message': '请求必须包含班级ID列表。'}), 400

    try:
        draft_object_id = ObjectId(draft_id)
    except Exception:
        return jsonify({'message': '无效的草稿ID格式。'}), 400

    draft = current_app.db.assignments.find_one({'_id': draft_object_id, 'teacher_id': teacher_id, 'status': 'draft'})
    if not draft:
        return jsonify({'message': '找不到要发布的草稿。'}), 404

    published_exams = []
    for class_id in class_ids:
        try:
            class_object_id = ObjectId(class_id)
        except Exception:
            current_app.logger.warning(f"发布作业时提供了无效的班级ID格式: {class_id}")
            continue

        new_exam = draft.copy()
        del new_exam['_id'] 
        new_exam['class_id'] = class_object_id
        new_exam['status'] = 'published'
        new_exam['created_at'] = datetime.now(pytz.timezone('Asia/Shanghai'))
        # Link back to source draft for easier management
        new_exam['source_draft_id'] = draft_object_id
        
        published_exams.append(new_exam)

    if not published_exams:
        return jsonify({'message': '没有有效的班级可供发布。'}), 400

    try:
        result = current_app.db.assignments.insert_many(published_exams)
        return jsonify({
            'message': f'作业已成功发布到 {len(result.inserted_ids)} 个班级!',
            'exam_ids': [str(id) for id in result.inserted_ids]
        }), 201
    except Exception as e:
        current_app.logger.error(f"发布作业时出错: {e}")
        return jsonify({'message': '发布作业失败。', 'error': str(e)}), 500

@exam_bp.route('/api/exams/drafts/<draft_id>', methods=['GET'])
@admin_required
def get_exam_draft_detail(draft_id):
    """
    Returns a single draft info plus where it has been published.
    """
    teacher_id = g.current_user['_id']
    try:
        draft_object_id = ObjectId(draft_id)
    except Exception:
        return jsonify({'message': '无效的草稿ID格式。'}), 400

    draft = current_app.db.assignments.find_one({'_id': draft_object_id, 'teacher_id': teacher_id, 'status': 'draft'})
    if not draft:
        return jsonify({'message': '找不到草稿或无权查看。'}), 404

    # Find published instances of this draft, prefer linking via source_draft_id
    published_query = {
        'teacher_id': teacher_id,
        'status': 'published',
        '$or': [
            {'source_draft_id': draft_object_id},
            {
                'name': draft.get('name'),
                'full_score': draft.get('full_score'),
                'words': draft.get('words'),
                'questions': draft.get('questions')
            }
        ]
    }
    published = list(current_app.db.assignments.find(published_query, {'class_id': 1}))
    published_class_ids = [p['class_id'] for p in published if p.get('class_id')]

    classes_map = {}
    if published_class_ids:
        cls_cur = current_app.db.classes.find({'_id': {'$in': published_class_ids}}, {'name': 1})
        for c in cls_cur:
            classes_map[c['_id']] = c.get('name')

    resp = {
        '_id': str(draft['_id']),
        'name': draft.get('name'),
        'words': draft.get('words', []),
        'questions': draft.get('questions', []),
        'full_score': draft.get('full_score', 0),
        'created_at': draft.get('created_at').isoformat() if draft.get('created_at') else None,
        'published_class_ids': [str(cid) for cid in published_class_ids],
        'published_classes': [
            {'_id': str(cid), 'name': classes_map.get(cid, '')}
            for cid in published_class_ids
        ]
    }
    return jsonify(resp), 200

@exam_bp.route('/api/exams/drafts/<draft_id>/unpublish', methods=['POST'])
@admin_required
def unpublish_exam(draft_id):
    """
    Unpublishes a draft from specified classes by removing the corresponding published assignments.
    """
    data = request.get_json() or {}
    class_ids = data.get('class_ids', [])
    teacher_id = g.current_user['_id']

    if not class_ids:
        return jsonify({'message': '请求必须包含班级ID列表。'}), 400

    try:
        draft_object_id = ObjectId(draft_id)
    except Exception:
        return jsonify({'message': '无效的草稿ID格式。'}), 400

    draft = current_app.db.assignments.find_one({'_id': draft_object_id, 'teacher_id': teacher_id, 'status': 'draft'})
    if not draft:
        return jsonify({'message': '找不到草稿或无权操作。'}), 404

    class_object_ids = []
    for cid in class_ids:
        try:
            class_object_ids.append(ObjectId(cid))
        except Exception:
            current_app.logger.warning(f"撤销发布时提供了无效的班级ID格式: {cid}")

    if not class_object_ids:
        return jsonify({'message': '没有有效的班级可供撤销。'}), 400

    # Prefer to match via source_draft_id, fallback to content equality
    delete_query = {
        'teacher_id': teacher_id,
        'status': 'published',
        'class_id': {'$in': class_object_ids},
        '$or': [
            {'source_draft_id': draft_object_id},
            {
                'name': draft.get('name'),
                'full_score': draft.get('full_score'),
                'words': draft.get('words'),
                'questions': draft.get('questions')
            }
        ]
    }

    try:
        result = current_app.db.assignments.delete_many(delete_query)
        return jsonify({'message': f'已撤销发布 {result.deleted_count} 条。', 'deleted_count': result.deleted_count}), 200
    except Exception as e:
        current_app.logger.error(f"撤销发布时出错: {e}")
        return jsonify({'message': '撤销发布失败。', 'error': str(e)}), 500

@exam_bp.route('/api/exams/<exam_id>/submissions', methods=['GET'])
@admin_required
def get_exam_submissions(exam_id):
    """
    Fetches all submissions for a specific exam, including student info.
    It returns the first submission for each student.
    """
    try:
        exam_object_id = ObjectId(exam_id)
    except Exception:
        return jsonify({'message': '无效的测验ID格式'}), 400

    try:
        # 1. Find the exam to verify it exists
        exam = current_app.db.assignments.find_one({'_id': exam_object_id})
        if not exam:
            return jsonify({'message': '未找到指定测验'}), 404

        # 2. Use an aggregation pipeline to get the first submission for each student
        pipeline = [
            {'$match': {'assignment_id': exam_object_id}},
            {'$sort': {'submitted_at': 1}}, # Sort by submission time ascending
            {
                '$group': {
                    '_id': '$student_id',
                    'first_submission': {'$first': '$ROOT'}
                }
            },
            {'$replaceRoot': {'newRoot': '$first_submission'}}
        ]
        
        submissions = list(current_app.db.submissions.aggregate(pipeline))

        if not submissions:
            return jsonify([]), 200

        # 3. Get student details for all submissions in one query
        student_ids = [s['student_id'] for s in submissions]
        students_cursor = current_app.db.users.find(
            {'_id': {'$in': student_ids}},
            {'_id': 1, 'username': 1, 'nickname': 1}
        )
        students_map = {s['_id']: s for s in students_cursor}

        # 4. Combine student info with submission data
        for sub in submissions:
            student_info = students_map.get(sub['student_id'])
            if student_info:
                sub['student_username'] = student_info.get('username')
                sub['student_nickname'] = student_info.get('nickname')
            
            # Convert ObjectIds to strings
            sub['_id'] = str(sub['_id'])
            sub['student_id'] = str(sub['student_id'])
            sub['assignment_id'] = str(sub['assignment_id'])
            sub['class_id'] = str(sub['class_id'])

        return jsonify(submissions), 200

    except Exception as e:
        current_app.logger.error(f"获取测验提交记录时出错: {e}")
        return jsonify({'message': '获取测验提交记录时发生内部错误', 'error': str(e)}), 500


@exam_bp.route('/api/exams/<exam_id>/student/<student_id>/submissions', methods=['GET'])
@admin_required
def get_student_submissions_for_exam(exam_id, student_id):
    """
    Fetches all submissions for a specific student on a specific exam.
    """
    try:
        exam_object_id = ObjectId(exam_id)
        student_object_id = ObjectId(student_id)
    except Exception:
        return jsonify({'message': '无效的测验ID或学生ID格式'}), 400

    try:
        submissions = list(current_app.db.submissions.find({
            'assignment_id': exam_object_id,
            'student_id': student_object_id
        }).sort('submitted_at', 1)) # Sort from oldest to newest

        for sub in submissions:
            sub['_id'] = str(sub['_id'])
            sub['student_id'] = str(sub['student_id'])
            sub['assignment_id'] = str(sub['assignment_id'])
            sub['class_id'] = str(sub['class_id'])
            # 兼容前端：有些页面读取 score 字段，这里映射 total_score -> score
            if 'total_score' in sub and 'score' not in sub:
                sub['score'] = sub.get('total_score')

        return jsonify(submissions), 200

    except Exception as e:
        current_app.logger.error(f"获取学生测验提交记录时出错: {e}")
        return jsonify({'message': '获取学生测验提交记录时发生内部错误', 'error': str(e)}), 500

@exam_bp.route('/api/exams/<exam_id>/class/<class_id>/stats', methods=['GET'])
@admin_required
def get_exam_class_stats(exam_id, class_id):
    """
    Fetches detailed statistics for a specific exam within a specific class.
    - List of completed students with their first score and submission details.
    - List of uncompleted students.
    - Average score of all first submissions.
    """
    try:
        exam_object_id = ObjectId(exam_id)
        class_object_id = ObjectId(class_id)
    except Exception:
        return jsonify({'message': '无效的测验ID或班级ID格式'}), 400

    try:
        target_class = current_app.db.classes.find_one({'_id': class_object_id})
        if not target_class:
            return jsonify({'message': '未找到指定班级'}), 404
        
        student_ids = target_class.get('students', [])
        if not student_ids:
            return jsonify({'completed_students': [], 'uncompleted_students': [], 'average_score': 0}), 200

        # Fetch the exam (assignment) to get full_score
        assignment = current_app.db.assignments.find_one({'_id': exam_object_id})
        full_score = assignment.get('full_score', 0) if assignment else 0

        # This pipeline is now corrected to properly use the 'let' variable.
        pipeline = [
            {'$match': {'_id': {'$in': student_ids}}},
            {
                '$lookup': {
                    'from': 'submissions',
                    'let': {'student_id': '$_id'},
                    'pipeline': [
                        {
                            '$match': {
                                '$expr': {
                                    '$and': [
                                        {'$eq': ['$student_id', '$$student_id']},
                                        {'$eq': ['$assignment_id', exam_object_id]}
                                    ]
                                }
                            }
                        },
                        {'$sort': {'submitted_at': 1}},
                        {'$limit': 1}
                    ],
                    'as': 'submission'
                }
            },
            {'$unwind': {'path': '$submission', 'preserveNullAndEmptyArrays': True}},
            {
                '$project': {
                    'username': 1,
                    'nickname': 1,
                    'has_submitted': {'$cond': [{'$ifNull': ['$submission', False]}, True, False]},
                    'first_score': '$submission.total_score',
                    'submission_id': '$submission._id',
                    'submitted_at': '$submission.submitted_at'
                }
            }
        ]
        
        results = list(current_app.db.users.aggregate(pipeline))

        completed_students = []
        uncompleted_students = []
        total_score = 0
        submission_count = 0

        for student in results:
            student_info = {
                'student_id': str(student['_id']),
                'username': student.get('username'),
                'nickname': student.get('nickname', '')
            }
            if student.get('has_submitted'):
                score = student.get('first_score')
                student_info['first_score'] = score
                student_info['submission_id'] = str(student.get('submission_id')) if student.get('submission_id') else None
                student_info['submitted_at'] = student.get('submitted_at').strftime('%Y-%m-%d %H:%M') if student.get('submitted_at') else None
                completed_students.append(student_info)
                if score is not None:
                    total_score += score
                    submission_count += 1
            else:
                uncompleted_students.append(student_info)

        average_score = (total_score / submission_count) if submission_count > 0 else 0

        return jsonify({
            'completed_students': sorted(completed_students, key=lambda x: x.get('nickname') or x.get('username')),
            'uncompleted_students': sorted(uncompleted_students, key=lambda x: x.get('nickname') or x.get('username')),
            'average_score': round(average_score, 2),
            'full_score': full_score
        }), 200

    except Exception as e:
        current_app.logger.error(f"获取测验班级统计时出错: {e}")
        return jsonify({'message': '获取测验班级统计时发生内部错误', 'error': str(e)}), 500

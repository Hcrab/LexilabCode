from flask import request, jsonify, Blueprint
from bson import ObjectId
from pymongo.errors import DuplicateKeyError, PyMongoError
from ..extensions import words_in_pools_collection, word_pools_collection, logger
from ..config import BEIJING_TZ
from .auth import admin_required
from datetime import datetime, timezone

words_bp = Blueprint('words', __name__)

@words_bp.route("/admin/words/import", methods=['POST'])
@admin_required
def import_words_from_txt(current_user):
    if 'file' not in request.files:
        return jsonify(error="No file part"), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify(error="No selected file"), 400
    
    pool_id = request.form.get("pool_id")
    if not pool_id:
        return jsonify(error="Missing pool_id for import"), 400
    
    try:
        pool_obj_id = ObjectId(pool_id)
        if not word_pools_collection.find_one({"_id": pool_obj_id}):
            return jsonify(error="Word pool not found"), 404
    except Exception:
        return jsonify(error="Invalid pool_id format"), 400

    if file and file.filename.endswith('.txt'):
        try:
            content = file.read().decode('utf-8')
            words = [line.strip() for line in content.splitlines() if line.strip()]
            
            if not words:
                return jsonify(message="File is empty or contains no valid words.", imported_count=0)

            new_words_to_insert = []
            for word_str in words:
                existing_word_in_pool = words_in_pools_collection.find_one(
                    {"word": word_str, "word_pool_id": pool_obj_id}
                )
                if not existing_word_in_pool:
                    new_words_to_insert.append({
                        "word": word_str,
                        "word_pool_id": pool_obj_id,
                        "status": "new",
                        "created_at": datetime.now(timezone.utc)
                    })
            
            if not new_words_to_insert:
                return jsonify(message="All words in the file already exist in the selected word pool.", imported_count=0)

            result = words_in_pools_collection.insert_many(new_words_to_insert, ordered=False)
            return jsonify(message=f"Successfully imported {len(result.inserted_ids)} new words into pool.", imported_count=len(result.inserted_ids))

        except DuplicateKeyError:
            return jsonify(error="One or more words already exist in this pool."), 409
        except Exception as e:
            logger.error(f"Error processing TXT file for pool {pool_id}: {e}", exc_info=True)
            return jsonify(error="Failed to process file."), 500

    return jsonify(error="Invalid file type, please upload a .txt file"), 400

@words_bp.route("/admin/words", methods=['GET'])
@admin_required
def get_words_in_pool(current_user):
    pool_id = request.args.get("pool_id")
    status = request.args.get("status")

    if not pool_id:
        return jsonify(error="Missing pool_id parameter"), 400

    try:
        pool_obj_id = ObjectId(pool_id)
    except Exception:
        return jsonify(error="Invalid pool_id format"), 400

    query = {"word_pool_id": pool_obj_id}
    if status in ["new", "used"]:
        query["status"] = status
    elif status:
        return jsonify(error="Invalid status parameter. Must be 'new' or 'used'."), 400

    try:
        words_cursor = words_in_pools_collection.find(query, {"word": 1, "status": 1}).sort("word", 1)
        words = [{"id": str(doc["_id"]), "word": doc["word"], "status": doc["status"]} for doc in words_cursor]
        return jsonify(words)
    except PyMongoError as e:
        logger.error(f"Failed to fetch words for pool {pool_id}: {e}", exc_info=True)
        return jsonify(error="Database error while fetching words."), 500

@words_bp.route("/admin/words", methods=['POST'])
@admin_required
def add_word_to_specific_pool(current_user):
    data = request.get_json(force=True)
    if not data or not isinstance(data, dict):
        return jsonify(error="Invalid JSON data provided."), 400
        
    word_str = data.get("word", "").strip()
    pool_id = data.get("pool_id")
    
    if not word_str:
        return jsonify(error="Word cannot be empty"), 400
    if not pool_id:
        return jsonify(error="Missing pool_id"), 400
    
    try:
        pool_obj_id = ObjectId(pool_id)
        if not word_pools_collection.find_one({"_id": pool_obj_id}):
            return jsonify(error="Word pool not found"), 404
    except Exception:
        return jsonify(error="Invalid pool_id format"), 400

    try:
        words_in_pools_collection.insert_one({
            "word": word_str,
            "word_pool_id": pool_obj_id,
            "status": "new",
            "created_at": datetime.now(timezone.utc)
        })
        return jsonify(message=f"'{word_str}' added successfully to pool {pool_id} with status 'new'."), 201
        
    except DuplicateKeyError:
        return jsonify(error=f"'{word_str}' already exists in this word pool."), 409
    except PyMongoError as e:
        logger.error(f"Database error while adding word to pool: {e}", exc_info=True)
        return jsonify(error="A database error occurred while adding the word."), 500

@words_bp.route("/admin/words/<word_id>", methods=['DELETE'])
@admin_required
def delete_word_from_specific_pool(current_user, word_id):
    pool_id = request.args.get("pool_id")
    if not word_id:
        return jsonify(error="Word ID cannot be empty."), 400
    if not pool_id:
        return jsonify(error="Missing pool_id parameter."), 400

    try:
        pool_obj_id = ObjectId(pool_id)
        word_obj_id = ObjectId(word_id)
    except Exception:
        return jsonify(error="Invalid pool_id or word_id format"), 400

    try:
        result = words_in_pools_collection.delete_one({"_id": word_obj_id, "word_pool_id": pool_obj_id})
        if result.deleted_count == 0:
            return jsonify(error=f"Word with ID '{word_id}' not found in pool '{pool_id}'."), 404
        return jsonify(message=f"Word with ID '{word_id}' deleted successfully from pool '{pool_id}'.")
    except PyMongoError as e:
        logger.error(f"Failed to delete word '{word_id}' from pool '{pool_id}': {e}", exc_info=True)
        return jsonify(error="Failed to delete word due to a database error."), 500

@words_bp.route("/admin/words/<word_id>/status", methods=['PUT'])
@admin_required
def update_word_status(current_user, word_id):
    data = request.get_json(force=True)
    new_status = data.get("status")

    if new_status not in ["new", "used"]:
        return jsonify(error="Invalid status. Must be 'new' or 'used'."), 400
    
    try:
        obj_id = ObjectId(word_id)
    except Exception:
        return jsonify(error="Invalid word_id format"), 400

    try:
        result = words_in_pools_collection.update_one(
            {"_id": obj_id},
            {"$set": {"status": new_status, "last_status_change": datetime.now(timezone.utc)}}
        )
        if result.matched_count == 0:
            return jsonify(error="Word not found"), 404
        return jsonify(ok=True, message=f"Word status updated to '{new_status}'.")
    except PyMongoError as e:
        logger.error(f"Database error while updating word status for {word_id}: {e}", exc_info=True)
        return jsonify(error="A database error occurred while updating word status."), 500

@words_bp.route("/admin/words/<word_id>/pool", methods=['PUT'])
@admin_required
def move_word_to_pool(current_user, word_id):
    data = request.get_json(force=True)
    target_pool_id = data.get("target_pool_id")

    if not target_pool_id:
        return jsonify(error="Missing target_pool_id"), 400
    
    try:
        word_obj_id = ObjectId(word_id)
        target_pool_obj_id = ObjectId(target_pool_id)
    except Exception:
        return jsonify(error="Invalid ID format"), 400

    try:
        if not word_pools_collection.find_one({"_id": target_pool_obj_id}):
            return jsonify(error="Target word pool not found"), 404

        word_doc = words_in_pools_collection.find_one({"_id": word_obj_id})
        if not word_doc:
            return jsonify(error="Word not found"), 404

        existing_in_target_pool = words_in_pools_collection.find_one(
            {"word": word_doc["word"], "word_pool_id": target_pool_obj_id}
        )
        if existing_in_target_pool:
            return jsonify(error=f"Word '{word_doc['word']}' already exists in the target pool."), 409

        result = words_in_pools_collection.update_one(
            {"_id": word_obj_id},
            {"$set": {"word_pool_id": target_pool_obj_id, "last_pool_change": datetime.now(timezone.utc)}}
        )
        if result.matched_count == 0:
            return jsonify(error="Word not found"), 404
        return jsonify(ok=True, message=f"Word moved to pool '{target_pool_id}'.")
    except PyMongoError as e:
        logger.error(f"Database error while moving word {word_id} to pool {target_pool_id}: {e}", exc_info=True)
        return jsonify(error="A database error occurred while moving the word."), 500

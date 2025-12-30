import re
from flask import request, jsonify, Blueprint
from bson import ObjectId
from pymongo.errors import DuplicateKeyError, PyMongoError
from ..extensions import word_pools_collection, words_in_pools_collection, logger
from ..config import BEIJING_TZ
from .auth import admin_required
from datetime import datetime, timezone

pools_bp = Blueprint('word_pools', __name__, url_prefix='/admin/wordpools')

@pools_bp.route("", methods=['POST'])
@admin_required
def create_word_pool(current_user):
    logger.info(f"--- ENTERING create_word_pool ---")
    logger.info(f"Request successfully authorized for user: {current_user.get('username')}")
    
    try:
        data = request.get_json(force=True)
        logger.info(f"Request JSON data: {data}")
        name = data.get("name", "").strip()
        description = data.get("description", "").strip()

        if not name:
            logger.warning("Validation failed: Word pool name is empty.")
            return jsonify(error="Word pool name cannot be empty"), 400
        
        logger.info(f"Attempting to create word pool with name: '{name}'")
        result = word_pools_collection.insert_one({
            "name": name,
            "description": description,
            "created_at": datetime.now(timezone.utc)
        })
        new_pool = word_pools_collection.find_one({"_id": result.inserted_id})
        new_pool["id"] = str(new_pool.pop("_id"))
        logger.info(f"Successfully created word pool with ID: {new_pool['id']}")
        return jsonify(new_pool), 201
        
    except DuplicateKeyError:
        logger.warning(f"Failed to create word pool: name '{name}' already exists.")
        return jsonify(error=f"Word pool with name '{name}' already exists."), 409
    except PyMongoError as e:
        logger.error(f"Database error while creating word pool: {e}", exc_info=True)
        return jsonify(error="A database error occurred while creating the word pool."), 500
    except Exception as e:
        logger.error(f"An unexpected error occurred in create_word_pool: {e}", exc_info=True)
        return jsonify(error="An unexpected internal error occurred."), 500

@pools_bp.route("", methods=['GET'])
@admin_required
def get_all_word_pools(current_user):
    try:
        pools = []
        for doc in word_pools_collection.find().sort("name", 1):
            doc["id"] = str(doc.pop("_id"))
            pools.append(doc)
        return jsonify(pools)
    except PyMongoError as e:
        logger.error(f"Database error while fetching all word pools: {e}", exc_info=True)
        return jsonify(error="A database error occurred while fetching word pools."), 500

@pools_bp.route("/<pool_id>", methods=['GET'])
@admin_required
def get_word_pool_by_id(current_user, pool_id):
    try:
        obj_id = ObjectId(pool_id)
    except Exception:
        return jsonify(error="Invalid pool_id format"), 400
    
    try:
        pool = word_pools_collection.find_one({"_id": obj_id})
        if not pool:
            return jsonify(error="Word pool not found"), 404
        pool["id"] = str(pool.pop("_id"))
        return jsonify(pool)
    except PyMongoError as e:
        logger.error(f"Database error while fetching word pool {pool_id}: {e}", exc_info=True)
        return jsonify(error="A database error occurred while fetching the word pool."), 500

@pools_bp.route("/<pool_id>", methods=['PUT'])
@admin_required
def update_word_pool(current_user, pool_id):
    try:
        obj_id = ObjectId(pool_id)
    except Exception:
        return jsonify(error="Invalid pool_id format"), 400
        
    data = request.get_json(force=True)
    update_fields = {}
    if "name" in data:
        update_fields["name"] = data["name"].strip()
    if "description" in data:
        update_fields["description"] = data["description"].strip()

    if not update_fields:
        return jsonify(error="no fields to update"), 400

    try:
        result = word_pools_collection.update_one({"_id": obj_id}, {"$set": update_fields})
        if result.matched_count == 0:
            return jsonify(error="Word pool not found"), 404
        return jsonify(ok=True)
    except DuplicateKeyError:
        return jsonify(error=f"Word pool with name '{update_fields['name']}' already exists."), 409
    except PyMongoError as e:
        logger.error(f"Database error while updating word pool {pool_id}: {e}", exc_info=True)
        return jsonify(error="A database error occurred while updating the word pool."), 500

@pools_bp.route("/<pool_id>", methods=['DELETE'])
@admin_required
def delete_word_pool(current_user, pool_id):
    try:
        obj_id = ObjectId(pool_id)
    except Exception:
        return jsonify(error="Invalid pool_id format"), 400
    
    try:
        words_in_pools_collection.delete_many({"word_pool_id": obj_id})
        result = word_pools_collection.delete_one({"_id": obj_id})
        if result.deleted_count == 0:
            return jsonify(error="Word pool not found"), 404
        return jsonify(ok=True)
    except PyMongoError as e:
        logger.error(f"Database error while deleting word pool {pool_id}: {e}", exc_info=True)
        return jsonify(error="A database error occurred while deleting the word pool."), 500


@pools_bp.route("/<pool_id>/words", methods=['POST'])
@admin_required
def add_word_to_pool(current_user, pool_id):
    try:
        pool_obj_id = ObjectId(pool_id)
    except Exception:
        return jsonify(error="Invalid pool_id format"), 400

    data = request.get_json(force=True)
    words = data.get("words", [])
    
    if not isinstance(words, list) or not words:
        return jsonify(error="words field must be a non-empty list"), 400

    try:
        pool = word_pools_collection.find_one({"_id": pool_obj_id})
        if not pool:
            return jsonify(error="Word pool not found"), 404

        added_words = []
        duplicates = []
        
        word_pattern = re.compile(r"(.+?)(?:\s*\((.+)\))?$")

        for word_entry in words:
            entry_str = str(word_entry).strip()
            if not entry_str:
                continue
            
            match = word_pattern.match(entry_str)
            if not match:
                continue

            word, pos = match.groups()
            word = word.strip()
            
            query = {
                "word_pool_id": pool_obj_id,
                "word": word,
            }
            if pos:
                pos = pos.strip()
                query["pos"] = pos
            else:
                query["pos"] = None
            
            existing_word = words_in_pools_collection.find_one(query)
            
            if not existing_word:
                doc = {
                    "word_pool_id": pool_obj_id,
                    "word": word,
                    "status": "unused",
                    "created_at": datetime.now(timezone.utc),
                    "last_status_change": datetime.now(timezone.utc)
                }
                if pos:
                    doc["pos"] = pos
                
                words_in_pools_collection.insert_one(doc)
                added_words.append(entry_str)
            else:
                duplicates.append(entry_str)
        
        return jsonify(added_words=added_words, duplicates=duplicates), 201

    except PyMongoError as e:
        logger.error(f"Database error while adding words to pool {pool_id}: {e}", exc_info=True)
        return jsonify(error="A database error occurred while adding words."), 500

@pools_bp.route("/<pool_id>/words", methods=['GET'])
@admin_required
def get_words_from_pool(current_user, pool_id):
    status = request.args.get('status')
    limit = request.args.get('limit', default=None, type=int)
    page = request.args.get('page', default=1, type=int)
    per_page = request.args.get('per_page', default=30, type=int)

    try:
        pool_obj_id = ObjectId(pool_id)
    except Exception:
        return jsonify(error="Invalid pool_id format"), 400

    query = {"word_pool_id": pool_obj_id}
    if status in ['unused', 'used']:
        query['status'] = status
    
    try:
        if limit is not None:
            words_cursor = words_in_pools_collection.find(query).limit(limit)
            total_words = limit 
            total_pages = 1
        else:
            total_words = words_in_pools_collection.count_documents(query)
            total_pages = (total_words + per_page - 1) // per_page
            words_cursor = words_in_pools_collection.find(query).skip((page - 1) * per_page).limit(per_page)

        words = list(words_cursor)
        return jsonify({
            "words": words,
            "total_words": total_words,
            "total_pages": total_pages,
            "current_page": page
        })

    except PyMongoError as e:
        logger.error(f"Database error while fetching words from pool {pool_id}: {e}", exc_info=True)
        return jsonify(error="A database error occurred while fetching words."), 500

@pools_bp.route("/words/<word_id>", methods=['DELETE'])
@admin_required
def remove_word_from_pool(current_user, word_id):
    pool_id = request.args.get("pool_id")
    if not pool_id:
        return jsonify(error="pool_id query parameter is required"), 400

    try:
        pool_obj_id = ObjectId(pool_id)
        word_obj_id = ObjectId(word_id)
    except Exception:
        return jsonify(error="Invalid pool_id or word_id format"), 400

    try:
        result = words_in_pools_collection.delete_one({
            "_id": word_obj_id,
            "word_pool_id": pool_obj_id
        })
        if result.deleted_count == 0:
            return jsonify(error=f"Word '{word_id}' not found in pool '{pool_id}'"), 404
        return jsonify(ok=True)
    except PyMongoError as e:
        logger.error(f"Database error while removing word {word_id} from pool {pool_id}: {e}", exc_info=True)
        return jsonify(error="A database error occurred while removing the word."), 500

@pools_bp.route("/<pool_id>/words/status", methods=['PUT'])
@admin_required
def update_word_status_in_pool(current_user, pool_id):
    try:
        pool_obj_id = ObjectId(pool_id)
    except Exception:
        return jsonify(error="Invalid pool_id format"), 400

    data = request.get_json(force=True)
    word_to_update = data.get("word")
    new_status = data.get("status")

    if not word_to_update or not new_status:
        return jsonify(error="word and status must be provided"), 400
    
    if new_status not in ['unused', 'used']:
        return jsonify(error="Invalid status value"), 400

    try:
        result = words_in_pools_collection.update_one(
            {"word_pool_id": pool_obj_id, "word": word_to_update},
            {"$set": {"status": new_status, "last_status_change": datetime.now(timezone.utc)}}
        )
        if result.matched_count == 0:
            return jsonify(error="word not found in the pool"), 404
        return jsonify(ok=True)
    except PyMongoError as e:
        logger.error(f"Database error while updating word status in pool {pool_id}: {e}", exc_info=True)
        return jsonify(error="A database error occurred while updating word status."), 500

import os
import json
import logging
import logging.handlers
from datetime import datetime, date
from bson import ObjectId
from flask.json.provider import JSONProvider
from flask_cors import CORS
from openai import OpenAI
from pymongo import MongoClient
from pymongo.errors import PyMongoError

# ---------- Custom JSON Encoder for ObjectId ----------
class MongoJSONProvider(JSONProvider):
    def dumps(self, obj, **kwargs):
        return json.dumps(obj, default=self.default, **kwargs)

    def loads(self, s, **kwargs):
        return json.loads(s, **kwargs)

    @staticmethod
    def default(o):
        if isinstance(o, ObjectId):
            return str(o)
        if isinstance(o, (datetime, date)):
            return o.isoformat()
        return str(o)

# ---------- Extensions Initialization ----------
# These are initialized here but configured in the app factory
cors = CORS()
mongo_client = None
db = None

# Collections (will be populated in init_app)
users_collection = None
quizzes_collection = None
results_collection = None
bookmarks_collection = None
word_pools_collection = None
words_in_pools_collection = None

ai_client = None
logger = None

def init_extensions(app):
    """
    Initializes all extensions for the Flask app.
    This function is called from the app factory.
    """
    global mongo_client, db, users_collection, quizzes_collection, results_collection, \
           bookmarks_collection, word_pools_collection, words_in_pools_collection, \
           ai_client, logger

    # --- CORS ---
    cors.init_app(app, resources={r"/*": {
        "origins": app.config["CORS_ORIGINS"],
        "supports_credentials": True,
        "allow_headers": ["Content-Type", "Authorization", "x-access-token"]
    }})

    # --- Logger ---
    log_dir = os.path.dirname(os.path.abspath(__file__))
    log_filename = os.path.join(log_dir, '..', 'backend.log') # Place log in backend/
    
    logger = logging.getLogger("englishpractice")
    logger.setLevel(logging.INFO)
    
    formatter = logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
    
    if not logger.handlers:
        # File Handler
        file_handler = logging.handlers.TimedRotatingFileHandler(
            log_filename, when='midnight', interval=1, backupCount=7, encoding='utf-8'
        )
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
        
        # Console Handler
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(formatter)
        logger.addHandler(console_handler)

    # --- AI Client ---
    api_key = app.config.get("DEEPSEEK_API_KEY")
    if not api_key:
        logger.error("DEEPSEEK_API_KEY not set in environment")
        raise SystemExit("❌ DEEPSEEK_API_KEY not set")
    ai_client = OpenAI(api_key=api_key, base_url="https://api.deepseek.com")
    app.ai_client = ai_client
    logger.info("✅ AI client initialized.")

    # --- MongoDB ---
    try:
        mongo_client = MongoClient(app.config["MONGO_URI"], tz_aware=True)
        db = mongo_client[app.config["MONGO_DB_NAME"]]
        mongo_client.admin.command('ping')
        logger.info("✅ MongoDB connection successful.")
        
        # Initialize collections
        users_collection = db.users
        quizzes_collection = db.quizzes
        results_collection = db.results
        bookmarks_collection = db.bookmarks
        word_pools_collection = db.word_pools
        words_in_pools_collection = db.words_in_pools

        # Create Indexes
        users_collection.create_index("username", unique=True)
        results_collection.create_index([("username", 1), ("quiz_id", 1)])
        bookmarks_collection.create_index([("username", 1), ("type", 1)])
        word_pools_collection.create_index("name", unique=True)
        words_in_pools_collection.create_index([("word", 1), ("word_pool_id", 1)], unique=True)
        logger.info("✅ MongoDB indexes ensured.")

    except PyMongoError as e:
        logger.error(f"MongoDB connection failed: {e}")
        raise SystemExit(f"❌ MongoDB connection failed: {e}")
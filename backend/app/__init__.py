from flask import Flask, request, g
from flask_cors import CORS
from pymongo import MongoClient
import os
from dotenv import load_dotenv
from pathlib import Path
import threading
import time
import pytz
from datetime import datetime
import logging
import ipaddress

# Explicitly load .env from the project root
dotenv_path = Path(__file__).resolve().parent.parent.parent / '.env'
load_dotenv(dotenv_path=dotenv_path)

def create_app():
    app = Flask(__name__)
    # Ensure SECRET_KEY is a string; default for local/dev if not set
    app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev-secret")
    # Allow all origins for /api routes so that different hosts/IPs can call the API
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # MongoDB Configuration
    mongo_uri = os.getenv("MONGO_URI")
    db_name = os.getenv("MONGO_DB_NAME")

    if not mongo_uri:
        raise RuntimeError("MONGO_URI not set in .env file.")
    if not db_name:
        raise RuntimeError("MONGO_DB_NAME not set in .env file.")
        
    client = MongoClient(mongo_uri)
    
    try:
        # The ismaster command is cheap and does not require auth.
        client.admin.command('ismaster')
    except Exception as e:
        raise RuntimeError(f"Failed to connect to MongoDB: {e}")

    # Get database from client using the name from .env
    app.db = client[db_name]

    from .routes.auth_routes import auth_bp
    from .routes.user_routes import user_bp
    from .routes.class_routes import class_bp
    from .routes.student_routes import student_bp
    from .routes.word_routes import word_bp
    from .routes.wordbook_routes import wordbook_bp
    from .routes.exam_routes import exam_bp
    from .routes.misc_routes import misc_bp
    from .ai import ai_bp
    from .routes.admin_routes import admin_bp
    from .routes.quiz_routes import quiz_bp
    from .routes.results_routes import results_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(user_bp)
    app.register_blueprint(class_bp)
    app.register_blueprint(student_bp)
    app.register_blueprint(word_bp)
    app.register_blueprint(wordbook_bp)
    # assignment/bookmark features removed for simplified word app
    app.register_blueprint(exam_bp)
    app.register_blueprint(misc_bp)
    app.register_blueprint(ai_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(quiz_bp)
    app.register_blueprint(results_bp)

    # --- Privacy-friendly access logging ---
    # Suppress Werkzeug default request logs (which include full client IPs)
    try:
        logging.getLogger('werkzeug').setLevel(logging.WARNING)
    except Exception:
        pass

    def _anonymize_ip(ip_str: str) -> str:
        try:
            ip = ipaddress.ip_address(ip_str)
            if isinstance(ip, ipaddress.IPv4Address):
                # Zero the last octet
                parts = ip_str.split('.')
                if len(parts) == 4:
                    parts[-1] = '0'
                    return '.'.join(parts)
            else:
                # IPv6: zero last 80 bits (keep /48 prefix)
                net = ipaddress.IPv6Network(ip_str + '/48', strict=False)
                return str(net.network_address) + '/48'
        except Exception:
            return '0.0.0.0'

    @app.before_request
    def _start_timer():
        g._start_ts = time.time()

    @app.after_request
    def _log_request(response):
        try:
            duration_ms = int((time.time() - getattr(g, '_start_ts', time.time())) * 1000)
            path = request.path
            method = request.method
            status = response.status_code

            # Strict privacy mode: default on; do not log IP/UA
            privacy_strict = os.getenv('PRIVACY_STRICT', 'true').lower() in ('1', 'true', 'yes', 'y')
            if privacy_strict:
                app.logger.info(f"{method} {path} -> {status} {duration_ms}ms")
            else:
                # Prefer X-Forwarded-For if present (first IP), else remote_addr
                xff = request.headers.get('X-Forwarded-For', '')
                raw_ip = (xff.split(',')[0].strip() if xff else None) or (request.remote_addr or '')
                ip_masked = _anonymize_ip(raw_ip)
                ua = (request.user_agent.string or '')[:120]
                app.logger.info(f"{method} {path} -> {status} {duration_ms}ms ip={ip_masked} ua={ua}")
        except Exception:
            # Never fail the response due to logging errors
            pass
        return response

    # --- Background scheduler: publish quizzes at scheduled time (Shanghai logic) ---
    def _quiz_publisher_loop(flask_app):
        with flask_app.app_context():
            while True:
                try:
                    sh_tz = pytz.timezone('Asia/Shanghai')
                    now_sh = datetime.now(sh_tz)
                    now_utc_iso = now_sh.astimezone(pytz.utc).isoformat()
                    # Find due quizzes (draft or to be published) with publish_at <= now
                    due = flask_app.db.quizzes.find({
                        'status': {'$in': ['draft', 'to be published']},
                        'publish_at': {'$lte': now_utc_iso}
                    }, {'_id': 1})
                    ids = [q['_id'] for q in due]
                    if ids:
                        flask_app.db.quizzes.update_many(
                            {'_id': {'$in': ids}},
                            {'$set': {'status': 'published', 'updated_at': now_utc_iso}}
                        )
                except Exception:
                    pass
                time.sleep(30)

    try:
        t = threading.Thread(target=_quiz_publisher_loop, args=(app,), daemon=True)
        t.start()
    except Exception:
        pass

    return app

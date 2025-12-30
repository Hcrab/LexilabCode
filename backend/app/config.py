import os
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))

# ---------- Timezone Configuration ----------
BEIJING_TZ = timezone(timedelta(hours=8))

def beijing_now():
    """Returns the current time in Beijing timezone."""
    return datetime.now(BEIJING_TZ)

class Config:
    """Flask configuration variables."""
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret")
    MONGO_URI = os.getenv("MONGO_URI", "mongodb://admin:password@localhost:27017/?authSource=admin")
    MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "english_practice")
    DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
    
    # CORS origins
    CORS_ORIGINS = [
        os.getenv("FRONT_ORIGIN", "http://localhost:3000"),
        "http://127.0.0.1:3000",
    ]


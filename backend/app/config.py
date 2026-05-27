from pydantic_settings import BaseSettings
from typing import List
import json


class Settings(BaseSettings):
    # Application
    APP_NAME: str = "DataPilot"
    APP_ENV: str = "development"
    DEBUG: bool = True
    SECRET_KEY: str = "change-me-in-production"
    API_PREFIX: str = "/api/v1"

    # Database
    DATABASE_URL: str = "sqlite:///./datapilot.db"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # JWT
    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Encryption
    DB_ENCRYPTION_KEY: str = "change-me-in-production"

    # AI - OpenAI
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4"

    # AI - Ollama
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3"

    # AI Provider
    AI_PROVIDER: str = "openai"

    # CORS
    CORS_ORIGINS: str = '["http://localhost:3000"]'

    # Frontend URL (for OAuth redirects)
    FRONTEND_URL: str = "http://localhost:3000"

    # Backend URL (for OAuth redirect URIs)
    BACKEND_URL: str = "http://localhost:8000"

    # OAuth - Google
    OAUTH_GOOGLE_CLIENT_ID: str = ""
    OAUTH_GOOGLE_CLIENT_SECRET: str = ""

    # OAuth - Microsoft
    OAUTH_MICROSOFT_CLIENT_ID: str = ""
    OAUTH_MICROSOFT_CLIENT_SECRET: str = ""

    # Celery
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    # Dataset Upload
    MAX_UPLOAD_SIZE_MB: int = 500
    DATASET_TABLE_PREFIX: str = "dp_dataset_"
    UPLOAD_DIR: str = "/tmp/datapilot_uploads"

    @property
    def cors_origins_list(self) -> List[str]:
        return json.loads(self.CORS_ORIGINS)

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()

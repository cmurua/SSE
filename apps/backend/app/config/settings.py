# Configuracion centralizada via variables de entorno (pydantic-settings).
# Un unico modelo de Settings; los distintos entornos (dev/staging/prod)
# se resuelven con archivos .env distintos, no con clases separadas.
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: str = "development"
    log_level: str = "INFO"

    database_url: str

    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    external_auth_api_url: str

    cors_origins: list[str] = ["http://localhost:5173"]

    login_max_failed_attempts: int = 5
    login_lockout_minutes: int = 10

    realtime_max_latency_seconds: int = 2


@lru_cache
def get_settings() -> Settings:
    return Settings()

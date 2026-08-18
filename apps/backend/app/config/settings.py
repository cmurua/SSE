# Configuracion centralizada via variables de entorno (pydantic-settings).
# Un unico modelo de Settings; los distintos entornos (dev/staging/prod)
# se resuelven con archivos .env distintos, no con clases separadas.
from functools import lru_cache
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


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

    # NoDecode desactiva el parseo JSON que pydantic-settings aplica por defecto
    # a los tipos complejos, para poder escribir la lista separada por comas en
    # el .env (CORS_ORIGINS=http://localhost:5173,http://localhost:4173).
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]

    login_max_failed_attempts: int = 5
    login_lockout_minutes: int = 10

    realtime_max_latency_seconds: int = 2

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_cors_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()

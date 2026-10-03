# Configuracion centralizada via variables de entorno (pydantic-settings).
# Un unico modelo de Settings; los distintos entornos (dev/staging/prod)
# se resuelven con archivos .env distintos, no con clases separadas.
from functools import lru_cache
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

from app.mqtt.topics import DEFAULT_SERMO_TOPIC, SERMO_QOS


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

    # --- Senal SERMO por MQTT (ver docs/decisions/0004-representacion-sermo.md)
    # El estado de operacion del reactor NO se deriva de la base: llega como
    # mensaje MQTT publicado por la FPGA. Apagar `mqtt_enabled` deja el backend
    # levantado sin ingesta, util para correr solo la API contra datos ya
    # cargados (seed) sin necesitar un broker.
    mqtt_enabled: bool = True
    mqtt_host: str = "mqtt"
    mqtt_port: int = 1883
    mqtt_username: str | None = None
    mqtt_password: str | None = None
    mqtt_topic_sermo: str = DEFAULT_SERMO_TOPIC
    mqtt_qos: int = SERMO_QOS
    # Identificador de cliente ante el broker. Debe ser UNICO: dos clientes
    # con el mismo identifier se desconectan mutuamente en un bucle.
    mqtt_client_id: str = "sse-backend"
    mqtt_keepalive_seconds: int = 60
    mqtt_reconnect_min_seconds: float = 1.0
    mqtt_reconnect_max_seconds: float = 30.0

    # --- Toma de datos
    # "simulated" genera las muestras (desarrollo); "main_pc" las lee de la PC
    # principal del reactor (sin implementar, ver
    # app/domains/reactor_data/sources/main_pc.py).
    acquisition_source: str = "simulated"
    acquisition_interval_seconds: float = 1.0
    # La FPGA senaliza que el reactor opera, pero no sabe quien lo conduce.
    # Hasta que se defina de donde sale ese dato, las operaciones se abren con
    # este operador (ver ADR 0004).
    acquisition_default_operator: str = "Desconocido"
    acquisition_default_notes: str | None = "Operacion registrada automaticamente al recibir SERMO."
    # Muestras que se guardan en memoria mientras la base no responde, para
    # volcarlas cuando vuelve. 3600 = una hora a 1 Hz; pasado eso se descartan
    # las mas viejas (ver docs/decisions/0006-mecanismo-lectura-tiempo-real.md).
    acquisition_max_pending_samples: int = 3600

    # --- Reintento ante una caida de la base
    # Lo usan las transiciones de SERMO (abrir/cerrar la operacion) y la
    # escritura de muestras. El backoff arranca en el minimo y se duplica
    # hasta el maximo; el pool de SQLAlchemy se reconecta solo en cada intento.
    # El maximo es bajo a proposito: es lo que puede tardar el tiempo real en
    # volver despues de que la base se recupera.
    db_retry_min_seconds: float = 1.0
    db_retry_max_seconds: float = 10.0

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_cors_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()

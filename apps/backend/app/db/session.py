# Engine/SessionLocal + dependency get_db() para inyectar sesiones en los routers.
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config.settings import get_settings

settings = get_settings()
# pool_pre_ping descarta conexiones muertas antes de usarlas: en desarrollo
# el contenedor de Postgres se reinicia y las del pool quedan invalidas.
engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

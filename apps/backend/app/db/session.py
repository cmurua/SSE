# Engine/SessionLocal + dependency get_db() para inyectar sesiones en los routers.
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config.settings import get_settings

settings = get_settings()
# pool_pre_ping descarta conexiones muertas antes de usarlas: en desarrollo
# el contenedor de Postgres se reinicia y las del pool quedan invalidas.
#
# Los timeouts convierten una base que no contesta en un error, en vez de un
# cuelgue de minutos esperando el timeout de TCP del sistema operativo.
# Verificado deteniendo el contenedor de Postgres: sin ellos, el ping del pool
# quedaba colgado sobre la conexion muerta hasta que la base volvia, y el
# reintento de las transiciones de SERMO y de las muestras nunca se activaba
# (ver docs/decisions/0006-mecanismo-lectura-tiempo-real.md).
#   connect_timeout: segundos para abrir una conexion nueva.
#   tcp_user_timeout: ms que un envio puede quedar sin confirmar antes de
#     dar la conexion por muerta (cubre las conexiones ya abiertas del pool).
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    connect_args={"connect_timeout": 5, "tcp_user_timeout": 5000},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

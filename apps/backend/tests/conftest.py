# Fixtures compartidas.
#
# Base de test: Postgres real, no SQLite. Lo que se prueba contra la base
# depende de Postgres -- el indice unico parcial de "una sola operacion
# abierta", las fechas con zona horaria, ILIKE -- y SQLite lo resolveria
# distinto o no lo resolveria. Es una base aparte (`<base>_test`) en el mismo
# servidor de desarrollo, que se crea sola la primera vez.
#
# Solo la levantan los tests que piden `db_session`: el resto de la suite
# sigue corriendo sin base.
from __future__ import annotations

import os
from collections.abc import Iterator

import pytest
from sqlalchemy import Engine, create_engine, pool, text
from sqlalchemy.engine import URL, make_url
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.config.settings import get_settings
from app.db.base import Base, import_models

TEST_DATABASE_SUFFIX = "_test"


def _test_database_url() -> URL:
    """TEST_DATABASE_URL si esta definida; si no, la base de la app + `_test`.

    Se exige el sufijo porque el esquema se borra y se recrea en cada corrida:
    apuntar por error a la base de desarrollo la vaciaria.
    """
    explicit = os.environ.get("TEST_DATABASE_URL")
    if explicit:
        url = make_url(explicit)
    else:
        app_url = make_url(get_settings().database_url)
        url = app_url.set(database=f"{app_url.database}{TEST_DATABASE_SUFFIX}")

    if not (url.database or "").endswith(TEST_DATABASE_SUFFIX):
        raise RuntimeError(
            f"La base de test tiene que terminar en '{TEST_DATABASE_SUFFIX}' "
            f"(se recibio '{url.database}'): su esquema se borra en cada corrida."
        )
    return url


def _create_database_if_missing(url: URL) -> None:
    # CREATE DATABASE no corre dentro de una transaccion, de ahi AUTOCOMMIT.
    # Se conecta a la base de mantenimiento `postgres`, que siempre existe.
    admin = create_engine(
        url.set(database="postgres"), isolation_level="AUTOCOMMIT", poolclass=pool.NullPool
    )
    try:
        with admin.connect() as connection:
            exists = connection.scalar(
                text("SELECT 1 FROM pg_database WHERE datname = :name"),
                {"name": url.database},
            )
            if not exists:
                quoted = connection.dialect.identifier_preparer.quote(url.database)
                connection.execute(text(f"CREATE DATABASE {quoted}"))
    finally:
        admin.dispose()


@pytest.fixture(scope="session")
def db_engine() -> Iterator[Engine]:
    url = _test_database_url()
    try:
        _create_database_if_missing(url)
    except OperationalError as error:
        pytest.fail(
            f"No se pudo conectar a Postgres para la base de test '{url.database}' "
            f"en {url.host}:{url.port}. Levantar la base con "
            f"`docker compose up -d db` o definir TEST_DATABASE_URL.\n{error}",
            pytrace=False,
        )

    engine = create_engine(url)
    # create_all y no las migraciones: los modelos declaran tambien los
    # indices (incluido el parcial de operations), y recrear desde cero en
    # cada corrida evita arrastrar el estado de una corrida anterior.
    import_models()
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    try:
        yield engine
    finally:
        engine.dispose()


@pytest.fixture
def db_session(db_engine: Engine) -> Iterator[Session]:
    """Sesion dentro de una transaccion que se deshace al terminar el test.

    `create_savepoint` hace que los commit() del codigo bajo prueba cierren
    un SAVEPOINT y no la transaccion externa, asi cada test arranca con la
    base vacia sin tener que borrar tablas.
    """
    connection = db_engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def mock_credentials_provider():
    from app.domains.auth.adapters.mock_provider import MockCredentialsProvider
    return MockCredentialsProvider()

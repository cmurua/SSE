#!/usr/bin/env python3
"""Espera activa a que Postgres acepte conexiones.

Docker Compose ya ordena el arranque con el healthcheck de `db`, pero eso
solo cubre el arranque de los contenedores. Este script sirve para lo demas:
correr migraciones o el simulador contra una base que todavia esta
inicializandose, o desde un entorno donde el healthcheck no aplica (CI, un
venv local apuntando a localhost).

    docker compose exec backend python /scripts/db/wait_for_db.py
    docker compose exec backend python /scripts/db/wait_for_db.py --timeout 60
"""
from __future__ import annotations

import argparse
import sys
import time

from sqlalchemy import create_engine, pool, text
from sqlalchemy.exc import SQLAlchemyError


def wait_for_db(url: str, timeout_seconds: int = 30, interval_seconds: float = 1.0) -> None:
    """Bloquea hasta que `url` responda una consulta trivial.

    No alcanza con abrir el socket: durante la inicializacion del cluster
    Postgres levanta un servidor temporal que acepta conexiones y todavia no
    sirve la base real. Por eso el chequeo es un `SELECT 1` efectivo.

    Lanza TimeoutError si se agota el plazo, con el ultimo error como causa.
    """
    deadline = time.monotonic() + timeout_seconds
    # NullPool: son intentos sueltos, no tiene sentido mantener un pool.
    engine = create_engine(url, poolclass=pool.NullPool)
    last_error: Exception | None = None

    try:
        while True:
            try:
                with engine.connect() as connection:
                    connection.execute(text("select 1"))
                return
            except SQLAlchemyError as error:
                last_error = error

            if time.monotonic() >= deadline:
                raise TimeoutError(
                    f"Postgres no respondio en {timeout_seconds}s"
                ) from last_error

            time.sleep(interval_seconds)
    finally:
        engine.dispose()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="wait_for_db.py",
        description="Espera a que Postgres acepte conexiones.",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=30,
        help="segundos maximos de espera (default 30)",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=1.0,
        help="segundos entre intentos (default 1.0)",
    )
    parser.add_argument(
        "--url",
        default=None,
        help="URL de conexion (default: la DATABASE_URL de la app)",
    )
    args = parser.parse_args(argv)

    # El import va aca y no arriba para que `--url` sirva en entornos donde la
    # config de la app no esta completa (falta JWT_SECRET, por ejemplo).
    url = args.url
    if url is None:
        from app.config.settings import get_settings

        url = get_settings().database_url

    started = time.monotonic()
    try:
        wait_for_db(url, timeout_seconds=args.timeout, interval_seconds=args.interval)
    except TimeoutError as error:
        print(f"{error}", file=sys.stderr)
        return 1

    print(f"Postgres disponible tras {time.monotonic() - started:.1f}s.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

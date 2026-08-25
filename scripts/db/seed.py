#!/usr/bin/env python3
"""Carga operaciones historicas ya cerradas, para tener datos de arranque.

Sin esto las pantallas de historicos (RF06) y de graficos (RF05) arrancan
vacias y no hay nada que probar hasta correr el simulador en vivo. Las
operaciones que genera son CERRADAS: no afectan al estado del reactor, que se
deriva de la operacion abierta (ver simulator.py).

    docker compose exec backend python /scripts/db/seed.py
    docker compose exec backend python /scripts/db/seed.py --operations 3
    docker compose exec backend python /scripts/db/seed.py --reset

Los valores salen del mismo generador que el simulador, asi que una operacion
historica y una en vivo se ven igual.
"""
from __future__ import annotations

import argparse
import sys
from datetime import UTC, datetime, timedelta

# `simulator` es el modulo hermano de este directorio: al correr el script
# como `python /scripts/db/seed.py`, Python deja /scripts/db en sys.path[0].
# Se reutiliza su generador para que un historico y una operacion en vivo
# tengan exactamente la misma forma.
from simulator import next_operation_id, sample_values
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.domains.historicals.models import Operation
from app.domains.reactor_data.models import ReactorSample

# Catalogo de ensayos tomado del prototipo de frontend
# (docs/design/frontend-prototype/src/mockData.jsx) para que los nombres y
# duraciones se parezcan a los de un RA-0 real y no a "Operacion 1, 2, 3".
HISTORICAL_OPERATIONS = [
    ("Calibracion detectores BF3", 142, "Ing. M. Alvarez", "Calibracion rutinaria de la cadena BF3. Sin observaciones."),
    ("Practica curso Reactores I", 95, "Dr. R. Perez", "Sesion practica con estudiantes de grado."),
    ("Medicion flujo posicion C-3", 188, "Dr. R. Perez", "Mapa de flujo en posicion experimental C-3."),
    ("Curva de calibracion potencia", 210, "Ing. M. Alvarez", "Calibracion de potencia con activacion de Au-198."),
    ("Practica curso Fisica Nuclear", 78, "Lic. S. Quiroga", "Curso de posgrado, medicion de periodo."),
    ("Verificacion barra de seguridad", 64, "Ing. M. Alvarez", "Test de tiempo de caida de barras."),
    ("Sesion demostrativa visitantes", 45, "Dr. R. Perez", "Demostracion para alumnos secundarios."),
    ("Practica curso Reactores II", 132, "Dr. R. Perez", "Operacion a baja potencia."),
]

# Filas por INSERT. Una operacion de 3 horas a 1 Hz son ~11k muestras: hacerlo
# de a una tarda una eternidad y de una sola vez arma un statement gigante.
CHUNK_SIZE = 2000


def reset(session: Session) -> None:
    """Borra TODAS las operaciones y muestras. Solo para desarrollo."""
    # Las muestras primero: reactor_samples.operation_id es FK de operations.
    samples = session.execute(delete(ReactorSample)).rowcount
    operations = session.execute(delete(Operation)).rowcount
    session.commit()
    print(f"Borradas {operations} operaciones y {samples} muestras.")


def seed_operation(
    session: Session,
    name: str,
    duration_minutes: int,
    operator: str,
    notes: str,
    started_at: datetime,
    interval_seconds: float,
) -> tuple[str, int]:
    """Crea una operacion cerrada con sus muestras. Devuelve (id, muestras)."""
    ended_at = started_at + timedelta(minutes=duration_minutes)
    operation = Operation(
        id=next_operation_id(session, started_at),
        name=name,
        started_at=started_at,
        ended_at=ended_at,
        operator=operator,
        notes=notes,
    )
    session.add(operation)
    session.commit()

    total = int(duration_minutes * 60 / interval_seconds)
    rows: list[dict] = []
    written = 0

    for index in range(total):
        elapsed = index * interval_seconds
        rows.append(
            {
                "operation_id": operation.id,
                "timestamp": started_at + timedelta(seconds=elapsed),
                **sample_values(elapsed),
            }
        )
        if len(rows) >= CHUNK_SIZE:
            session.bulk_insert_mappings(ReactorSample, rows)
            session.commit()
            written += len(rows)
            rows = []

    if rows:
        session.bulk_insert_mappings(ReactorSample, rows)
        session.commit()
        written += len(rows)

    return operation.id, written


def seed(
    operations: int = 5,
    interval_seconds: float = 1.0,
    days_between: int = 7,
) -> None:
    """Carga `operations` operaciones cerradas, la mas reciente hace `days_between` dias."""
    with SessionLocal() as session:
        for position in range(operations):
            name, duration, operator, notes = HISTORICAL_OPERATIONS[
                position % len(HISTORICAL_OPERATIONS)
            ]
            # Hacia atras en el tiempo: la primera es la mas reciente.
            started_at = datetime.now(UTC) - timedelta(
                days=days_between * (position + 1), hours=2
            )
            operation_id, written = seed_operation(
                session,
                name=name,
                duration_minutes=duration,
                operator=operator,
                notes=notes,
                started_at=started_at,
                interval_seconds=interval_seconds,
            )
            print(f"  {operation_id}  {name:34} {written:>6} muestras")

        total_operations = session.scalar(select(func.count()).select_from(Operation))
        total_samples = session.scalar(select(func.count()).select_from(ReactorSample))
        print(f"Total en la base: {total_operations} operaciones, {total_samples} muestras.")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="seed.py",
        description="Carga operaciones historicas cerradas para desarrollo.",
    )
    parser.add_argument(
        "--operations", type=int, default=5, help="cuantas operaciones cargar (default 5)"
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=1.0,
        help="segundos entre muestras (default 1.0). Subirlo genera menos filas.",
    )
    parser.add_argument(
        "--days-between", type=int, default=7, help="dias entre operaciones (default 7)"
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="BORRA todas las operaciones y muestras antes de cargar",
    )
    args = parser.parse_args(argv)

    if args.operations < 1:
        print("--operations tiene que ser >= 1", file=sys.stderr)
        return 1

    with SessionLocal() as session:
        if args.reset:
            reset(session)
        elif session.scalar(select(func.count()).select_from(Operation)):
            print(
                "La base ya tiene operaciones. El seed agrega mas, no reemplaza; "
                "usa --reset para empezar de cero.",
                file=sys.stderr,
            )

    seed(
        operations=args.operations,
        interval_seconds=args.interval,
        days_between=args.days_between,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

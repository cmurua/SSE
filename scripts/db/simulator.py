#!/usr/bin/env python3
"""Simulador del SSO: abre una operacion, inserta muestras y la cierra.

Herramienta de DESARROLLO. Ocupa el lugar del SSO (el sistema que en el
reactor real publica las muestras) para poder probar RF04 (tiempo real) y
RF05 (graficos) sin depender del RA-0.

Se ejecuta dentro del contenedor del backend, que es donde vive el paquete
`app` y la conexion a Postgres:

    docker compose exec backend python /scripts/db/simulator.py start
    docker compose exec backend python /scripts/db/simulator.py status
    docker compose exec backend python /scripts/db/simulator.py stop

`start` deja el proceso en primer plano insertando una muestra por segundo.
Cortarlo con Ctrl-C detiene la insercion pero NO cierra la operacion: el
estado abierto/cerrado es de la operacion, no del proceso, igual que en el
sistema real (ver Operation en app/domains/historicals/models.py). Para
cerrarla hay que usar `stop`, desde otra terminal o despues.
"""
from __future__ import annotations

import argparse
import math
import sys
import time
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.domains.historicals.models import Operation
from app.domains.reactor_data.models import ReactorSample
from app.domains.reactor_data.variable_catalog import (
    REACTOR_VARIABLES,
    sample_column,
)

# Unidad que marca a una variable como booleana en el catalogo (EST_BOM).
BOOLEAN_UNIT = "0/1"


# --------------------------------------------------------------------------
# Generacion de valores
# --------------------------------------------------------------------------
def variable_value(variable: dict, t: float) -> float:
    """Valor de una variable en el segundo `t` de la operacion.

    Port directo de `generateSeries()` del prototipo de frontend
    (docs/design/frontend-prototype/src/mockData.jsx): superposicion de
    senoidales de distinta frecuencia sobre el valor nominal, en vez de ruido
    aleatorio. Eso da curvas suaves y continuas -- una muestra se parece a la
    anterior -- que es lo que hace falta para que los graficos de RF05 se vean
    como una medicion y no como estatica.

    Es determinista: el mismo `t` da siempre el mismo valor, y la semilla sale
    del ID de la variable, asi que cada una tiene su propia fase y no se mueven
    todas en bloque.
    """
    span = variable["max"] - variable["min"]
    center = variable["nominal"]
    seed = sum(ord(character) for character in variable["id"])

    # Tres armonicos: el lento domina, los rapidos agregan textura.
    noise = (
        math.sin((t + seed) * 0.21) * 0.012 * span
        + math.sin((t + seed) * 0.07) * 0.025 * span
        + math.sin((t + seed) * 0.45) * 0.005 * span
    )
    # Deriva de periodo largo, para que la serie no sea perfectamente ciclica.
    drift = math.sin(t * 0.013 + seed * 0.1) * 0.04 * span

    value = center + noise + drift

    # El clamp garantiza el criterio de aceptacion: ningun valor sale del
    # rango declarado. Hace falta porque hay variables cuyo nominal esta
    # pegado a un extremo (POS_BRS y EST_BOM tienen nominal == max).
    value = max(variable["min"], min(variable["max"], value))

    # Una bomba encendida al 93% no existe: las booleanas se redondean.
    if variable["unit"] == BOOLEAN_UNIT:
        return float(round(value))

    return value


def sample_values(t: float) -> dict[str, float]:
    """Fila completa de `reactor_samples` (sin id/operacion/timestamp)."""
    return {
        sample_column(variable["id"]): variable_value(variable, t)
        for variable in REACTOR_VARIABLES
    }


# --------------------------------------------------------------------------
# Operaciones
# --------------------------------------------------------------------------
def find_open_operation(session: Session) -> Operation | None:
    """La operacion abierta, si hay alguna (`ended_at IS NULL`)."""
    return session.scalars(
        select(Operation).where(Operation.ended_at.is_(None)).order_by(Operation.started_at.desc())
    ).first()


def next_operation_id(session: Session, when: datetime) -> str:
    """Siguiente ID libre con la convencion del prototipo: OP-<anio>-<NNN>."""
    prefix = f"OP-{when.year}-"
    used = session.scalars(
        select(Operation.id).where(Operation.id.like(f"{prefix}%"))
    ).all()

    highest = 0
    for operation_id in used:
        suffix = operation_id.removeprefix(prefix)
        if suffix.isdigit():
            highest = max(highest, int(suffix))

    return f"{prefix}{highest + 1:03d}"


def open_operation(
    session: Session,
    name: str,
    operator: str,
    notes: str | None,
    started_at: datetime | None = None,
) -> Operation:
    """Crea la fila de `operations` marcada como abierta (`ended_at = NULL`)."""
    started_at = started_at or datetime.now(UTC)
    operation = Operation(
        id=next_operation_id(session, started_at),
        name=name,
        started_at=started_at,
        ended_at=None,
        operator=operator,
        notes=notes,
    )
    session.add(operation)
    session.commit()
    return operation


def insert_sample(session: Session, operation_id: str, t: int, timestamp: datetime) -> None:
    """Una fila en `reactor_samples` con las 33 variables del catalogo."""
    session.add(
        ReactorSample(
            operation_id=operation_id,
            timestamp=timestamp,
            **sample_values(t),
        )
    )
    session.commit()


def sample_count(session: Session, operation_id: str) -> int:
    return session.scalar(
        select(func.count())
        .select_from(ReactorSample)
        .where(ReactorSample.operation_id == operation_id)
    )


# --------------------------------------------------------------------------
# Comandos
# --------------------------------------------------------------------------
def cmd_start(args: argparse.Namespace) -> int:
    with SessionLocal() as session:
        # Una sola operacion abierta a la vez: el estado del reactor se deriva
        # de `ended_at IS NULL`, asi que dos abiertas lo volverian ambiguo.
        already_open = find_open_operation(session)
        if already_open is not None:
            print(
                f"Ya hay una operacion abierta: {already_open.id} ({already_open.name}).\n"
                f"Cerrala con `stop` antes de arrancar otra.",
                file=sys.stderr,
            )
            return 1

        operation = open_operation(session, args.name, args.operator, args.notes)
        print(f"Operacion abierta: {operation.id} - {operation.name}")
        print(f"Insertando una muestra cada {args.interval}s. Ctrl-C para cortar.")

        started = time.monotonic()
        inserted = 0
        try:
            while args.max_samples is None or inserted < args.max_samples:
                # `t` es el segundo de operacion, no el indice de la muestra:
                # asi las curvas no cambian de forma al variar --interval.
                elapsed = inserted * args.interval
                insert_sample(
                    session,
                    operation.id,
                    t=elapsed,
                    timestamp=datetime.now(UTC),
                )
                inserted += 1

                if inserted % 10 == 0:
                    print(f"  {inserted} muestras", flush=True)

                # La operacion puede cerrarse desde otra terminal (`stop`):
                # el bucle lo detecta y termina solo.
                session.expire(operation)
                if operation.ended_at is not None:
                    print(f"\nLa operacion {operation.id} fue cerrada. Corto la insercion.")
                    return 0

                # Cadencia por reloj absoluto y no `sleep(interval)` a secas,
                # para que el costo del INSERT no haga derivar la frecuencia.
                next_tick = started + inserted * args.interval
                time.sleep(max(0.0, next_tick - time.monotonic()))
        except KeyboardInterrupt:
            print(
                f"\nInsercion detenida: {inserted} muestras en {operation.id}.\n"
                f"La operacion sigue ABIERTA. Para cerrarla: "
                f"`python /scripts/db/simulator.py stop`."
            )

    return 0


def cmd_stop(args: argparse.Namespace) -> int:
    with SessionLocal() as session:
        operation = find_open_operation(session)
        if operation is None:
            print("No hay ninguna operacion abierta.", file=sys.stderr)
            return 1

        operation.ended_at = datetime.now(UTC)
        session.commit()

        duration = operation.ended_at - operation.started_at
        print(
            f"Operacion cerrada: {operation.id} - {operation.name}\n"
            f"  duracion: {int(duration.total_seconds() // 60)} min\n"
            f"  muestras: {sample_count(session, operation.id)}"
        )
    return 0


def cmd_status(args: argparse.Namespace) -> int:
    with SessionLocal() as session:
        total = session.scalar(select(func.count()).select_from(Operation))
        operation = find_open_operation(session)

        print(f"Operaciones en la base: {total}")
        if operation is None:
            print("Estado: sin operacion abierta (reactor no operando).")
            return 0

        print(
            f"Estado: OPERANDO\n"
            f"  operacion: {operation.id} - {operation.name}\n"
            f"  operador:  {operation.operator}\n"
            f"  desde:     {operation.started_at.isoformat()}\n"
            f"  muestras:  {sample_count(session, operation.id)}"
        )
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="simulator.py",
        description="Emula al SSO: abre una operacion, inserta muestras y la cierra.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    start = subparsers.add_parser("start", help="abre una operacion e inserta muestras")
    start.add_argument("--name", default="Operacion simulada", help="nombre de la operacion")
    start.add_argument("--operator", default="Simulador SSO", help="operador responsable")
    start.add_argument("--notes", default="Generada por scripts/db/simulator.py.")
    start.add_argument(
        "--interval",
        type=float,
        default=1.0,
        help="segundos entre muestras (default 1.0, o sea ~1 Hz)",
    )
    start.add_argument(
        "--max-samples",
        type=int,
        default=None,
        help="corta despues de N muestras (default: hasta Ctrl-C o `stop`)",
    )
    start.set_defaults(func=cmd_start)

    stop = subparsers.add_parser("stop", help="cierra la operacion abierta")
    stop.set_defaults(func=cmd_stop)

    status = subparsers.add_parser("status", help="muestra si hay una operacion abierta")
    status.set_defaults(func=cmd_status)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())

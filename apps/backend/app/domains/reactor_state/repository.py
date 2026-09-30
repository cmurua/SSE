# Ciclo de vida de `operations`: abrir y cerrar. Es deliberadamente distinto
# de historicals/repository.py, que consulta operaciones ya cerradas (RF06):
# aca solo se ESCRIBE el arranque y el cierre, disparados por la senal SERMO.
# Tenerlos separados evita que el dominio de historicos (solo lectura) exponga
# metodos capaces de modificar el estado del reactor.
#
# A diferencia de los repositorios de los routers REST, este recibe una
# `session_factory` y no una sesion ya abierta: lo usa una tarea de fondo de
# larga duracion, que no puede quedarse con una sesion viva durante horas.
from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.domains.historicals.models import Operation

SessionFactory = Callable[[], Session]


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


def find_open_operation(session: Session) -> Operation | None:
    """La operacion abierta, si hay alguna (`ended_at IS NULL`)."""
    return session.scalars(
        select(Operation)
        .where(Operation.ended_at.is_(None))
        .order_by(Operation.started_at.desc())
    ).first()


class OperationLifecycleRepository:
    """Abre y cierra la operacion en curso. Metodos sincronicos a proposito.

    El resto del backend usa SQLAlchemy sincronico; introducir un engine async
    solo para esto obligaria a mantener dos conexiones a la misma base. Los
    llamadores asincronicos (ReactorStateService) envuelven estas llamadas en
    `asyncio.to_thread` para no bloquear el event loop.
    """

    def __init__(self, session_factory: SessionFactory) -> None:
        self._session_factory = session_factory

    def find_open(self) -> dict | None:
        """Datos de la operacion abierta, o None.

        Devuelve un dict y no la entidad ORM porque el llamador la consume
        fuera de la sesion: una instancia detached lanzaria al tocar
        cualquier atributo no cargado.
        """
        with self._session_factory() as session:
            operation = find_open_operation(session)
            if operation is None:
                return None
            return {
                "id": operation.id,
                "name": operation.name,
                "started_at": operation.started_at,
                "operator": operation.operator,
            }

    def open(
        self,
        *,
        name: str,
        operator: str,
        notes: str | None,
        started_at: datetime | None = None,
    ) -> dict:
        """Crea la operacion en curso (`ended_at = NULL`).

        Si ya hay una abierta la devuelve sin crear otra. La invariante "una
        sola operacion abierta" esta ademas garantizada en la base por un
        indice unico parcial (ver migracion `una_operacion_abierta`); este
        chequeo evita el error de constraint en el caso normal, pero la base
        es la que lo hace cierto aunque corran dos procesos.
        """
        started_at = started_at or datetime.now(UTC)
        with self._session_factory() as session:
            existing = find_open_operation(session)
            if existing is not None:
                return {
                    "id": existing.id,
                    "name": existing.name,
                    "started_at": existing.started_at,
                    "operator": existing.operator,
                }

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
            return {
                "id": operation.id,
                "name": operation.name,
                "started_at": operation.started_at,
                "operator": operation.operator,
            }

    def close_open(self, ended_at: datetime | None = None) -> dict | None:
        """Cierra la operacion abierta. Devuelve None si no habia ninguna."""
        ended_at = ended_at or datetime.now(UTC)
        with self._session_factory() as session:
            operation = find_open_operation(session)
            if operation is None:
                return None

            operation.ended_at = ended_at
            session.commit()
            return {
                "id": operation.id,
                "name": operation.name,
                "started_at": operation.started_at,
                "ended_at": operation.ended_at,
            }

    def count_samples(self, operation_id: str) -> int:
        """Cantidad de muestras de una operacion. Solo para diagnostico/logs."""
        from app.domains.reactor_data.models import ReactorSample

        with self._session_factory() as session:
            return session.scalar(
                select(func.count())
                .select_from(ReactorSample)
                .where(ReactorSample.operation_id == operation_id)
            )

# Consultas de solo lectura sobre operaciones y muestras (RF06). La escritura
# de `operations` (abrir y cerrar) vive en reactor_state/repository.py: este
# dominio nunca modifica el estado del reactor.
#
# A diferencia del repositorio de reactor_state, estos reciben una sesion ya
# abierta: los usa un request REST, que dura lo que dura la sesion de get_db().
from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import ColumnElement, and_, func, or_, select
from sqlalchemy.orm import Session

from app.domains.historicals.models import Operation
from app.domains.reactor_data.models import ReactorSample


@dataclass(frozen=True)
class OperationFilters:
    """Filtros del listado, ya traducidos a instantes.

    `started_from` es inclusivo y `started_before` exclusivo: asi un dia
    entero es [00:00 de ese dia, 00:00 del siguiente) sin depender de la
    precision de los timestamps.
    """

    started_from: datetime | None = None
    started_before: datetime | None = None
    q: str | None = None


def _escape_like(text: str) -> str:
    """Escapa los comodines de LIKE para que `q` se busque literal."""
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _closed_operations_where(filters: OperationFilters) -> ColumnElement[bool]:
    # Solo operaciones cerradas (D7): la abierta se ve en Tiempo Real y entra
    # al listado recien cuando ReactorStateService escribe su `ended_at`.
    conditions: list[ColumnElement[bool]] = [Operation.ended_at.is_not(None)]

    if filters.started_from is not None:
        conditions.append(Operation.started_at >= filters.started_from)
    if filters.started_before is not None:
        conditions.append(Operation.started_at < filters.started_before)
    if filters.q:
        pattern = f"%{_escape_like(filters.q)}%"
        conditions.append(
            or_(
                Operation.id.ilike(pattern, escape="\\"),
                Operation.name.ilike(pattern, escape="\\"),
            )
        )

    return and_(*conditions)


class OperationRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def search_closed(
        self, filters: OperationFilters, *, limit: int, offset: int
    ) -> tuple[Sequence[Operation], int]:
        """Una pagina de operaciones cerradas, de la mas reciente a la mas vieja,
        y el total que cumple los filtros (sin paginar)."""
        where = _closed_operations_where(filters)

        total = self._db.scalar(select(func.count()).select_from(Operation).where(where)) or 0

        # Una pagina mas alla del final no puede traer nada: se responde sin
        # consultar. Ademas evita mandarle a Postgres un OFFSET que no entra en
        # un bigint cuando `page` es absurdamente grande.
        if offset >= total:
            return [], total

        operations = self._db.scalars(
            select(Operation)
            .where(where)
            # `id` desempata dos operaciones con el mismo `started_at`: sin un
            # orden total, una fila podria repetirse o perderse entre paginas.
            .order_by(Operation.started_at.desc(), Operation.id.desc())
            .limit(limit)
            .offset(offset)
        ).all()

        return operations, total


class SampleRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def count_by_operation(self, operation_ids: Sequence[str]) -> dict[str, int]:
        """Cantidad de muestras de cada operacion, en una sola consulta agrupada.

        Se cuenta solo sobre las operaciones de la pagina (`IN`), no sobre
        toda la tabla: con el indice (operation_id, timestamp) cada conteo es
        un recorrido del indice acotado a esa operacion. Las operaciones sin
        muestras no aparecen en el resultado; el llamador las toma como 0.
        """
        if not operation_ids:
            return {}

        rows = self._db.execute(
            select(ReactorSample.operation_id, func.count())
            .where(ReactorSample.operation_id.in_(operation_ids))
            .group_by(ReactorSample.operation_id)
        ).all()
        return dict(rows)

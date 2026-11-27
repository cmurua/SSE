# Consultas de solo lectura sobre operaciones y muestras (RF06). La escritura
# de `operations` (abrir y cerrar) vive en reactor_state/repository.py: este
# dominio nunca modifica el estado del reactor.
#
# A diferencia del repositorio de reactor_state, estos reciben una sesion ya
# abierta: los usa un request REST, que dura lo que dura la sesion de get_db().
from __future__ import annotations

from collections.abc import Iterator, Sequence
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import ColumnElement, Integer, and_, cast, func, literal, or_, select
from sqlalchemy.orm import InstrumentedAttribute, Session

from app.domains.historicals.models import Operation
from app.domains.reactor_data.models import ReactorSample
from app.domains.reactor_data.variable_catalog import sample_column

# Filas por tanda al recorrer una ventana entera (CSV). Con 34 variables son
# unas decenas de KB por tanda.
STREAM_BATCH_SIZE = 1000


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

    def get_closed(self, operation_id: str) -> Operation | None:
        """La operacion, si existe y ya cerro. La abierta se trata como
        inexistente: sus muestras todavia cambian y se ven en Tiempo Real."""
        return self._db.scalar(
            select(Operation).where(
                Operation.id == operation_id, Operation.ended_at.is_not(None)
            )
        )


@dataclass(frozen=True)
class SampleStats:
    count: int
    first_at: datetime | None
    last_at: datetime | None


def _value_columns(variable_ids: Sequence[str]) -> list[InstrumentedAttribute]:
    return [getattr(ReactorSample, sample_column(v)) for v in variable_ids]


def _in_window(operation_id: str, start: datetime, end: datetime) -> ColumnElement[bool]:
    # Ventana [start, end): con el indice (operation_id, timestamp) es un
    # recorrido de un rango contiguo del indice.
    return and_(
        ReactorSample.operation_id == operation_id,
        ReactorSample.timestamp >= start,
        ReactorSample.timestamp < end,
    )


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

    def stats(self, operation_id: str) -> SampleStats:
        """Cantidad de muestras y primer y ultimo instante, en una consulta."""
        count, first_at, last_at = self._db.execute(
            select(
                func.count(), func.min(ReactorSample.timestamp), func.max(ReactorSample.timestamp)
            ).where(ReactorSample.operation_id == operation_id)
        ).one()
        return SampleStats(count=count, first_at=first_at, last_at=last_at)

    def count_in_window(self, operation_id: str, start: datetime, end: datetime) -> int:
        return (
            self._db.scalar(
                select(func.count())
                .select_from(ReactorSample)
                .where(_in_window(operation_id, start, end))
            )
            or 0
        )

    def raw_window(
        self, operation_id: str, variable_ids: Sequence[str], start: datetime, end: datetime
    ) -> list[tuple]:
        """Filas `(timestamp, valor_1, ..., valor_n)` de la ventana, en orden."""
        rows = self._db.execute(
            select(ReactorSample.timestamp, *_value_columns(variable_ids))
            .where(_in_window(operation_id, start, end))
            .order_by(ReactorSample.timestamp)
        ).all()
        return [tuple(row) for row in rows]

    def stream_window(
        self,
        operation_id: str,
        variable_ids: Sequence[str],
        start: datetime,
        end: datetime,
        *,
        batch_size: int = STREAM_BATCH_SIZE,
    ) -> Iterator[tuple]:
        """Como `raw_window`, pero de a `batch_size` filas.

        `yield_per` abre un cursor del lado del servidor (psycopg 3): Postgres
        manda las filas de a tandas y en memoria nunca hay mas que una. Asi el
        CSV de una operacion entera no carga la tabla completa.
        """
        result = self._db.execute(
            select(ReactorSample.timestamp, *_value_columns(variable_ids))
            .where(_in_window(operation_id, start, end))
            .order_by(ReactorSample.timestamp)
            .execution_options(yield_per=batch_size)
        )
        try:
            for row in result:
                yield tuple(row)
        finally:
            # Si el cliente corta la descarga, el generador se cierra antes de
            # agotar el cursor: hay que liberarlo en el servidor.
            result.close()

    def averaged_window(
        self,
        operation_id: str,
        variable_ids: Sequence[str],
        start: datetime,
        end: datetime,
        *,
        bucket_seconds: float,
        buckets: int,
    ) -> list[tuple]:
        """Filas `(intervalo, promedio_1, ..., promedio_n)`, en orden.

        El intervalo `k` agrupa las muestras de
        [start + k * bucket_seconds, start + (k + 1) * bucket_seconds). El
        promedio se calcula en Postgres: viajan como mucho `buckets` filas y
        no todas las de la ventana. AVG ignora los NULL, asi que un canal que
        no publico nada en todo el intervalo sigue siendo NULL y no un 0.
        """
        offset = func.extract("epoch", ReactorSample.timestamp - literal(start))
        # LEAST por redondeo: una muestra a un pelo de `end` no puede caer en
        # un intervalo mas alla del ultimo.
        bucket = func.least(cast(func.floor(offset / bucket_seconds), Integer), buckets - 1)

        # Subconsulta para agrupar por la columna y no por la expresion: si se
        # repite la expresion, cada aparicion lleva sus propios parametros y
        # Postgres no la reconoce como la misma del GROUP BY.
        windowed = (
            select(bucket.label("bucket"), *_value_columns(variable_ids))
            .where(_in_window(operation_id, start, end))
            .subquery()
        )
        value_columns = [windowed.c[sample_column(v)] for v in variable_ids]
        rows = self._db.execute(
            select(windowed.c.bucket, *(func.avg(column) for column in value_columns))
            .group_by(windowed.c.bucket)
            .order_by(windowed.c.bucket)
        ).all()
        return [tuple(row) for row in rows]

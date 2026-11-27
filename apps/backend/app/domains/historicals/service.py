from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta

from app.core.exceptions import OperationNotFoundError
from app.core.timezone import LOCAL_TIMEZONE
from app.domains.exports.file_names import export_file_name
from app.domains.historicals.csv_export import csv_chunks
from app.domains.historicals.csv_export import header as csv_header
from app.domains.historicals.models import Operation
from app.domains.historicals.repository import (
    OperationFilters,
    OperationRepository,
    SampleRepository,
)
from app.domains.historicals.schemas import (
    OperationDetail,
    OperationListItem,
    OperationPage,
    OperationSamples,
    OperationSamplesCsvParams,
    OperationSamplesParams,
    OperationSearchParams,
    SampleWindowParams,
)
from app.domains.reactor_data.variable_catalog import REACTOR_VARIABLES
from app.domains.realtime.schemas import RealtimeSample

# Las fechas que elige el usuario son dias del calendario del reactor, no de
# UTC: una operacion que empieza el 9 a las 22:00 en Cordoba (01:00 UTC del
# 10) tiene que aparecer al filtrar por el 9. La zona es LOCAL_TIMEZONE
# (app/core/timezone.py).

# El CSV sin `variables` lleva el catalogo entero, en el orden del catalogo.
ALL_VARIABLE_IDS = tuple(variable["id"] for variable in REACTOR_VARIABLES)


def local_day_bounds(
    date_from: date | None, date_to: date | None
) -> tuple[datetime | None, datetime | None]:
    """Traduce dias inclusivos a [inicio, fin) en instantes con zona horaria.

    `date_to` es inclusivo, asi que el limite superior es la medianoche del
    dia SIGUIENTE, exclusiva. Se arma desde la fecha y no restando un
    microsegundo para no depender de la precision de los timestamps.

    `date.max` no tiene dia siguiente (sumarle uno desborda); como no hay
    nada despues, equivale a no poner limite superior.
    """
    start = (
        datetime.combine(date_from, time.min, tzinfo=LOCAL_TIMEZONE)
        if date_from is not None
        else None
    )
    end = (
        datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=LOCAL_TIMEZONE)
        if date_to is not None and date_to < date.max
        else None
    )
    return start, end


class HistoricalsService:
    def __init__(
        self,
        operation_repository: OperationRepository,
        sample_repository: SampleRepository,
    ) -> None:
        self._operation_repository = operation_repository
        self._sample_repository = sample_repository

    def search_operations(self, params: OperationSearchParams) -> OperationPage:
        """Listado paginado de operaciones cerradas (RF06)."""
        started_from, started_before = local_day_bounds(params.date_from, params.date_to)
        q = params.q.strip() if params.q else None
        filters = OperationFilters(
            started_from=started_from,
            started_before=started_before,
            q=q or None,
        )

        operations, total = self._operation_repository.search_closed(
            filters,
            limit=params.page_size,
            offset=(params.page - 1) * params.page_size,
        )
        # Una consulta para toda la pagina, no una por operacion (sin N+1).
        sample_counts = self._sample_repository.count_by_operation(
            [operation.id for operation in operations]
        )

        items = [
            OperationListItem(
                id=operation.id,
                name=operation.name,
                started_at=operation.started_at,
                ended_at=operation.ended_at,
                operator=operation.operator,
                notes=operation.notes,
                sample_count=sample_counts.get(operation.id, 0),
            )
            for operation in operations
        ]
        return OperationPage(
            items=items, total=total, page=params.page, page_size=params.page_size
        )

    def get_operation(self, operation_id: str) -> OperationDetail:
        """Detalle de una operacion cerrada (RF06)."""
        operation = self._get_closed(operation_id)
        stats = self._sample_repository.stats(operation_id)
        return OperationDetail(
            id=operation.id,
            name=operation.name,
            started_at=operation.started_at,
            ended_at=operation.ended_at,
            operator=operation.operator,
            notes=operation.notes,
            sample_count=stats.count,
            first_sample_at=stats.first_at,
            last_sample_at=stats.last_at,
        )

    def get_samples(
        self, operation_id: str, params: OperationSamplesParams
    ) -> OperationSamples:
        """Series de una operacion cerrada en la ventana pedida (RF06).

        Si la ventana tiene mas de `max_points` muestras, se reduce a
        `max_points` intervalos de igual duracion, promediando cada uno.
        """
        operation = self._get_closed(operation_id)
        variable_ids = params.variable_ids
        start, end, window_start, window_end = _clip_window(operation, params)

        def result(samples: list[RealtimeSample], bucket_seconds: float | None) -> OperationSamples:
            return OperationSamples(
                operation_id=operation_id,
                variables=list(variable_ids),
                start=start,
                end=end,
                downsampled=bucket_seconds is not None,
                bucket_seconds=bucket_seconds,
                samples=samples,
            )

        if start >= end:
            return result([], None)

        count = self._sample_repository.count_in_window(operation_id, window_start, window_end)
        if count <= params.max_points:
            rows = self._sample_repository.raw_window(
                operation_id, variable_ids, window_start, window_end
            )
            return result(
                [
                    _sample(operation_id, timestamp, variable_ids, values)
                    for timestamp, *values in rows
                ],
                None,
            )

        bucket_seconds = (end - start) / params.max_points
        rows = self._sample_repository.averaged_window(
            operation_id,
            variable_ids,
            window_start,
            window_end,
            bucket_seconds=bucket_seconds,
            buckets=params.max_points,
        )
        return result(
            [
                _sample(
                    operation_id,
                    window_start + timedelta(seconds=bucket * bucket_seconds),
                    variable_ids,
                    values,
                )
                for bucket, *values in rows
            ],
            bucket_seconds,
        )

    def export_samples_csv(
        self, operation_id: str, params: OperationSamplesCsvParams
    ) -> SamplesCsv:
        """CSV de una operacion cerrada en la ventana pedida, sin reducir.

        La operacion se busca aca, antes de devolver: un 404 tiene que salir
        antes de empezar a mandar el archivo. Las filas se leen recien al
        recorrer `chunks`, de a tandas (ver SampleRepository.stream_window).
        """
        operation = self._get_closed(operation_id)
        requested = params.variable_ids
        variable_ids = requested if requested is not None else ALL_VARIABLE_IDS
        start, end, window_start, window_end = _clip_window(operation, params)

        rows = (
            self._sample_repository.stream_window(
                operation_id, variable_ids, window_start, window_end
            )
            if start < end
            else iter(())
        )
        return SamplesCsv(
            file_name=export_file_name(
                operation_id,
                variable_ids,
                (start, end),
                "csv",
                all_variables=requested is None,
            ),
            variable_ids=variable_ids,
            start=start,
            end=end,
            chunks=csv_chunks(csv_header(variable_ids), rows),
        )

    def _get_closed(self, operation_id: str) -> Operation:
        operation = self._operation_repository.get_closed(operation_id)
        if operation is None:
            raise OperationNotFoundError(operation_id)
        return operation


@dataclass(frozen=True)
class SamplesCsv:
    file_name: str
    variable_ids: tuple[str, ...]
    # Ventana aplicada, en segundos desde el inicio y ya recortada.
    start: float
    end: float
    chunks: Iterator[str]


def _clip_window(
    operation: Operation, params: SampleWindowParams
) -> tuple[float, float, datetime, datetime]:
    """La ventana pedida, recortada a la duracion de la operacion.

    Devuelve `(start, end)` en segundos desde el inicio y los mismos limites
    como instantes. Se recorta para que el tamano de los intervalos (series)
    salga de la ventana real y no de un `end` enorme. `start` <= `end` sigue
    valiendo: si ambos pasan el cierre, quedan iguales y la ventana esta
    vacia.
    """
    duration = (operation.ended_at - operation.started_at).total_seconds()
    start = min(params.start or 0.0, duration)
    end = min(params.end if params.end is not None else duration, duration)
    return (
        start,
        end,
        operation.started_at + timedelta(seconds=start),
        operation.started_at + timedelta(seconds=end),
    )


def _sample(
    operation_id: str,
    timestamp: datetime,
    variable_ids: tuple[str, ...],
    values: list[float | None],
) -> RealtimeSample:
    # En UTC, como realtime.samples. Postgres devuelve los timestamptz en la
    # zona horaria de la sesion: sin esto, un servidor configurado en hora de
    # Cordoba mandaria `-03:00` y el frontend recibiria dos formatos.
    return RealtimeSample(
        operation_id=operation_id,
        timestamp=timestamp.astimezone(UTC),
        values=dict(zip(variable_ids, values, strict=True)),
    )

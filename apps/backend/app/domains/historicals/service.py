from __future__ import annotations

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.domains.historicals.repository import (
    OperationFilters,
    OperationRepository,
    SampleRepository,
)
from app.domains.historicals.schemas import (
    OperationListItem,
    OperationPage,
    OperationSearchParams,
)

# Las fechas que elige el usuario son dias del calendario del reactor, no de
# UTC: una operacion que empieza el 9 a las 22:00 en Cordoba (01:00 UTC del
# 10) tiene que aparecer al filtrar por el 9.
LOCAL_TIMEZONE = ZoneInfo("America/Argentina/Cordoba")


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

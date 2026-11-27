# GET /historicals/operations (filtros: fechas, texto; paginado)
# GET /historicals/operations/{operation_id}
# GET /historicals/operations/{operation_id}/samples
# GET /historicals/operations/{operation_id}/samples.csv (tarea 5.8)
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.exceptions import OperationNotFoundError
from app.db.session import get_db
from app.domains.audit.dependencies import ClientIp
from app.domains.auth.dependencies import CurrentUser
from app.domains.exports.router import ExportsServiceDep
from app.domains.historicals.repository import OperationRepository, SampleRepository
from app.domains.historicals.schemas import (
    OperationDetail,
    OperationPage,
    OperationSamples,
    OperationSamplesCsvParams,
    OperationSamplesParams,
    OperationSearchParams,
)
from app.domains.historicals.service import HistoricalsService

router = APIRouter()


def get_historicals_service(db: Annotated[Session, Depends(get_db)]) -> HistoricalsService:
    return HistoricalsService(OperationRepository(db), SampleRepository(db))


HistoricalsServiceDep = Annotated[HistoricalsService, Depends(get_historicals_service)]


@router.get("/operations")
def list_operations(
    user: CurrentUser,
    params: Annotated[OperationSearchParams, Query()],
    service: HistoricalsServiceDep,
) -> OperationPage:
    """Operaciones cerradas, de la mas reciente a la mas vieja.

    La operacion en curso no aparece: se ve en Tiempo Real y entra al
    listado apenas cierra.
    """
    return service.search_operations(params)


OPERATION_NOT_FOUND = "Operacion no encontrada"
NOT_FOUND_RESPONSES = {
    status.HTTP_404_NOT_FOUND: {"description": "La operacion no existe o sigue abierta."}
}


@router.get("/operations/{operation_id}", responses=NOT_FOUND_RESPONSES)
def get_operation(
    operation_id: str, user: CurrentUser, service: HistoricalsServiceDep
) -> OperationDetail:
    """Detalle de una operacion cerrada, con el resumen de sus muestras."""
    try:
        return service.get_operation(operation_id)
    except OperationNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, OPERATION_NOT_FOUND) from None


@router.get("/operations/{operation_id}/samples", responses=NOT_FOUND_RESPONSES)
def get_operation_samples(
    operation_id: str,
    user: CurrentUser,
    params: Annotated[OperationSamplesParams, Query()],
    service: HistoricalsServiceDep,
) -> OperationSamples:
    """Series de las variables pedidas en una ventana de la operacion.

    Cada muestra tiene la forma del evento `sample` de realtime.samples. Si
    la ventana tiene mas de `max_points` muestras, se promedian por
    intervalos y la respuesta lo indica con `downsampled` y `bucket_seconds`.
    """
    try:
        return service.get_samples(operation_id, params)
    except OperationNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, OPERATION_NOT_FOUND) from None


@router.get(
    "/operations/{operation_id}/samples.csv",
    response_class=StreamingResponse,
    responses={
        status.HTTP_200_OK: {
            "content": {"text/csv": {}},
            "description": "Tabla de muestras, separada por `;` y con coma decimal.",
        },
        **NOT_FOUND_RESPONSES,
    },
)
def export_operation_samples_csv(
    operation_id: str,
    user: CurrentUser,
    ip: ClientIp,
    params: Annotated[OperationSamplesCsvParams, Query()],
    service: HistoricalsServiceDep,
    exports: ExportsServiceDep,
) -> StreamingResponse:
    """Muestras de una ventana de la operacion, sin reducir, como CSV.

    Columnas: `timestamp` (ISO 8601, UTC) y una por variable con su unidad
    (`POTM4 [W]`). Sin `variables`, todas las del catalogo. Formato en
    historicals/csv_export.py. Se genera en streaming y cada descarga queda
    registrada en la auditoria (RNF03).
    """
    try:
        csv = service.export_samples_csv(operation_id, params)
    except OperationNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, OPERATION_NOT_FOUND) from None

    # Antes de mandar el archivo: lo que importa es que se pidio y se
    # entrego, y despues de empezar el envio ya no se puede responder un error.
    exports.log_csv_export(
        user.username,
        ip,
        operation_id=operation_id,
        variables=csv.variable_ids,
        start=csv.start,
        end=csv.end,
        file_name=csv.file_name,
    )
    return StreamingResponse(
        csv.chunks,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{csv.file_name}"'},
    )

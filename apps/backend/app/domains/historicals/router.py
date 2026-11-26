# GET /historicals/operations (filtros: fechas, texto; paginado)
# GET /historicals/operations/{operation_id}
# GET /historicals/operations/{operation_id}/samples
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.domains.auth.dependencies import CurrentUser
from app.domains.historicals.repository import OperationRepository, SampleRepository
from app.domains.historicals.schemas import OperationPage, OperationSearchParams
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


@router.get("/operations/{operation_id}")
def get_operation(operation_id: str):
    raise NotImplementedError


@router.get("/operations/{operation_id}/samples")
def get_operation_samples(operation_id: str):
    raise NotImplementedError

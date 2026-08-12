# GET /historicals/operations (filtros: fecha, id de operacion)
# GET /historicals/operations/{operation_id}
# GET /historicals/operations/{operation_id}/samples
from fastapi import APIRouter

router = APIRouter()


@router.get("/operations")
def list_operations():
    raise NotImplementedError


@router.get("/operations/{operation_id}")
def get_operation(operation_id: str):
    raise NotImplementedError


@router.get("/operations/{operation_id}/samples")
def get_operation_samples(operation_id: str):
    raise NotImplementedError

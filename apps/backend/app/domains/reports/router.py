# POST /reports — modulo de sugerencias y reportes de error (RF08).
from fastapi import APIRouter

router = APIRouter()


@router.post("")
def create_report():
    raise NotImplementedError

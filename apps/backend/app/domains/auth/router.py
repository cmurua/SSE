# Endpoints: POST /login, POST /refresh, POST /logout.
# No hay roles (confirmado): todo usuario autenticado tiene el mismo nivel de acceso.
from fastapi import APIRouter

router = APIRouter()


@router.post("/login")
def login():
    raise NotImplementedError


@router.post("/refresh")
def refresh():
    raise NotImplementedError


@router.post("/logout")
def logout():
    raise NotImplementedError

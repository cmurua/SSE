# Endpoints: POST /login, POST /refresh, POST /logout, GET /me.
# No hay roles (confirmado): todo usuario autenticado tiene el mismo nivel de acceso.
from fastapi import APIRouter

from app.domains.auth.dependencies import CurrentUser
from app.domains.auth.schemas import AuthenticatedUser

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


@router.get("/me", response_model=AuthenticatedUser)
def me(user: CurrentUser) -> AuthenticatedUser:
    """Devuelve la identidad del token. Requiere sesion.

    Es el endpoint de prueba de la dependency (tarea 1.6), pero no es
    descartable: al frontend le sirve para saber si la sesion que tiene
    guardada sigue viva sin tener que adivinarlo con una request de negocio.
    """
    return user

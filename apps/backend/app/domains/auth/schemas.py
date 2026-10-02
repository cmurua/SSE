from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class AuthenticatedUser(BaseModel):
    """Identidad detras de un access token valido.

    Solo lleva el usuario porque es lo unico que el token afirma (claim `sub`)
    y no hay tabla de usuarios donde buscar mas: el padron vive en el modulo
    externo de credenciales. No hay roles (confirmado), asi que tampoco hay
    permisos que representar.
    """

    username: str

# Composition root de autenticacion: elige que CredentialsProvider usar
# (hoy: ExternalApiCredentialsProvider) y expone get_current_user() para
# proteger endpoints REST. Cambiar de proveedor (p. ej. a SSO real en el
# futuro) es editar SOLO este archivo.
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.exceptions import ExpiredTokenError, TokenError
from app.core.security import decode_access_token
from app.domains.auth.adapters.external_api_provider import (
    ExternalApiCredentialsProvider,
)
from app.domains.auth.schemas import AuthenticatedUser

# from app.domains.auth.adapters.sso import SsoCredentialsProvider  # futuro

# auto_error=False: la ausencia del header llega como None y el 401 lo
# construimos nosotros. FastAPI 0.142 ya responde 401 con WWW-Authenticate por
# su cuenta (versiones viejas devolvian 403), asi que esto no corrige un bug:
# es para no depender de un default que ya cambio una vez, y para que los tres
# modos de falla -- falta, expiro, invalido -- salgan del mismo lugar, con el
# mismo formato y en el mismo idioma que el resto de la API.
bearer_scheme = HTTPBearer(auto_error=False, description="Access token (JWT)")


def get_credentials_provider():
    return ExternalApiCredentialsProvider()


def _unauthorized(detail: str, error: str | None = None) -> HTTPException:
    """401 con el challenge que pide el RFC 6750.

    Sin el header WWW-Authenticate la respuesta no es un desafio valido: un
    cliente generico no sabria que se espera un bearer token. El parametro
    `error` solo se incluye cuando SI llego un token y fallo; si no llego
    ninguno, el RFC pide el challenge pelado (seccion 3).
    """
    challenge = "Bearer" if error is None else f'Bearer error="{error}"'
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": challenge},
    )


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> AuthenticatedUser:
    """Identidad detras del access token, o 401.

    No hay roles (confirmado): la unica distincion es autenticado o no, asi
    que esta dependency es todo lo que hace falta para marcar un endpoint como
    "requiere sesion".

    La identidad sale del token y no de la base: el `sub` es el usuario que el
    proveedor de credenciales ya valido al emitirlo. No hay tabla de usuarios
    -- el padron vive en el modulo externo -- asi que no hay a quien
    consultar, y volver a preguntarle al proveedor en cada request anularia el
    sentido de tener un token.
    """
    if credentials is None:
        raise _unauthorized("Falta el token de acceso")

    try:
        claims = decode_access_token(credentials.credentials)
    except ExpiredTokenError as error:
        # Se distingue del resto porque es el unico caso recuperable: el
        # cliente puede renovar y reintentar (ver services/api/httpClient.ts).
        raise _unauthorized("El token expiro", error="invalid_token") from error
    except TokenError as error:
        # Firma invalida, malformado, o un refresh token usado como access.
        # Los tres son el mismo caso para el cliente: el token no sirve.
        raise _unauthorized("Token invalido", error="invalid_token") from error

    return AuthenticatedUser(username=claims["sub"])


# Alias para que proteger un endpoint sea una anotacion y no cuatro lineas:
#
#     @router.get("/algo")
#     def algo(user: CurrentUser): ...
#
# Para proteger un router entero, en app/api/v1/router.py:
#
#     include_router(x_router, dependencies=[Depends(get_current_user)])
CurrentUser = Annotated[AuthenticatedUser, Depends(get_current_user)]

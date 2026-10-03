# Emision/validacion de JWT propio (access + refresh). La verificacion de
# CREDENCIALES (usuario/contrasena) vive en domains/auth/adapters, no aca:
# este modulo solo firma y valida tokens una vez que la identidad ya fue
# aprobada por el proveedor de credenciales correspondiente.
#
# Hacia afuera no se filtra ninguna excepcion de PyJWT: todo error se traduce
# a la jerarquia TokenError de core/exceptions.py, para que el resto del
# backend no dependa de la libreria elegida.
from datetime import UTC, datetime, timedelta

import jwt

from app.config.settings import get_settings
from app.core.exceptions import (
    ExpiredTokenError,
    InvalidTokenError,
    WrongTokenTypeError,
)

settings = get_settings()

# Claim `type`. Los dos tipos se firman con el mismo secreto, asi que es este
# claim -- y no la firma -- lo que impide usar uno en lugar del otro.
ACCESS_TOKEN_TYPE = "access"
REFRESH_TOKEN_TYPE = "refresh"


def _create_token(subject: str, token_type: str, expires_in: timedelta) -> str:
    now = datetime.now(UTC)
    return jwt.encode(
        {
            "sub": subject,
            "type": token_type,
            "iat": now,
            "exp": now + expires_in,
        },
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )


def create_access_token(subject: str) -> str:
    """Token de vida corta (minutos) que acompaña a cada request REST."""
    return _create_token(
        subject,
        ACCESS_TOKEN_TYPE,
        timedelta(minutes=settings.access_token_expire_minutes),
    )


def create_refresh_token(subject: str) -> str:
    """Token de vida larga (dias) cuyo unico uso es pedir un access nuevo."""
    return _create_token(
        subject,
        REFRESH_TOKEN_TYPE,
        timedelta(days=settings.refresh_token_expire_days),
    )


def decode_token(token: str, expected_type: str) -> dict:
    """Valida firma, vencimiento y tipo, y devuelve los claims.

    `expected_type` es obligatorio a proposito: si tuviera un default, un
    llamador distraido aceptaria cualquiera de los dos tipos sin notarlo, que
    es justo el agujero que esta funcion tiene que cerrar.

    Lanza ExpiredTokenError, InvalidTokenError o WrongTokenTypeError; nunca
    una excepcion de PyJWT.
    """
    try:
        claims = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            # PyJWT valida `exp` si esta, pero no exige que este. Un token sin
            # vencimiento seria eterno, y los WebSocket programan su cierre a
            # partir de este claim (ver websocket/dependencies.py).
            options={"require": ["exp"]},
        )
    except jwt.ExpiredSignatureError as error:
        raise ExpiredTokenError("El token expiro") from error
    except jwt.InvalidTokenError as error:
        # Clase base de PyJWT: firma incorrecta, formato invalido, algoritmo
        # no admitido. Para el llamador son el mismo caso -- el token no es
        # nuestro -- y detallarlos en la respuesta solo ayudaria a quien
        # este probando tokens.
        raise InvalidTokenError("El token no es valido") from error

    # Un token sin `sub` esta firmado por nosotros pero no identifica a nadie,
    # asi que no sirve para autenticar.
    if not claims.get("sub"):
        raise InvalidTokenError("El token no identifica a ningun usuario")

    if claims.get("type") != expected_type:
        raise WrongTokenTypeError(
            f"Se esperaba un token '{expected_type}' y llego '{claims.get('type')}'"
        )

    return claims


def decode_access_token(token: str) -> dict:
    """Atajo para el caso REST. Ver decode_token()."""
    return decode_token(token, ACCESS_TOKEN_TYPE)


def decode_refresh_token(token: str) -> dict:
    """Atajo para POST /auth/refresh. Ver decode_token()."""
    return decode_token(token, REFRESH_TOKEN_TYPE)

# Capa de tokens: firma, vencimiento y tipo. Lo que se prueba no es que PyJWT
# funcione, sino los dos contratos que el resto del backend da por ciertos:
# que un token que no cumple TODO se rechaza, y que el motivo llega como una
# excepcion de dominio y no como una de la libreria.
from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.config.settings import get_settings
from app.core.exceptions import (
    ExpiredTokenError,
    InvalidTokenError,
    TokenError,
    WrongTokenTypeError,
)
from app.core.security import (
    ACCESS_TOKEN_TYPE,
    REFRESH_TOKEN_TYPE,
    create_access_token,
    create_refresh_token,
    decode_access_token,
    decode_refresh_token,
    decode_token,
)

settings = get_settings()


def forge(claims: dict, secret: str | None = None) -> str:
    """Firma un token a medida, para construir casos que la API no permite."""
    return jwt.encode(
        claims,
        secret or settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )


def test_access_token_valido_devuelve_los_claims():
    claims = decode_access_token(create_access_token("jperez"))

    assert claims["sub"] == "jperez"
    assert claims["type"] == ACCESS_TOKEN_TYPE


def test_refresh_token_valido_devuelve_los_claims():
    claims = decode_refresh_token(create_refresh_token("jperez"))

    assert claims["sub"] == "jperez"
    assert claims["type"] == REFRESH_TOKEN_TYPE


def test_token_expirado():
    vencido = forge(
        {
            "sub": "jperez",
            "type": ACCESS_TOKEN_TYPE,
            "exp": datetime.now(UTC) - timedelta(seconds=1),
        }
    )

    with pytest.raises(ExpiredTokenError):
        decode_access_token(vencido)


def test_firma_invalida():
    ajeno = forge(
        {
            "sub": "jperez",
            "type": ACCESS_TOKEN_TYPE,
            "exp": datetime.now(UTC) + timedelta(minutes=5),
        },
        # Largo valido (>=32 bytes): lo que falla es la clave, no su tamaño.
        secret="un-secreto-distinto-igual-de-largo-que-el-nuestro",
    )

    with pytest.raises(InvalidTokenError):
        decode_access_token(ajeno)


def test_un_refresh_token_no_sirve_para_autenticar_una_request_rest():
    """Criterio de aceptacion de la tarea 1.3.

    Los dos tipos se firman con el mismo secreto, asi que la firma del refresh
    es perfectamente valida: lo unico que lo frena es el claim `type`.
    """
    refresh = create_refresh_token("jperez")

    with pytest.raises(WrongTokenTypeError):
        decode_access_token(refresh)


def test_un_access_token_tampoco_sirve_para_renovar():
    """La proteccion va en los dos sentidos, no solo en el que importa para REST."""
    access = create_access_token("jperez")

    with pytest.raises(WrongTokenTypeError):
        decode_refresh_token(access)


def test_token_sin_subject():
    sin_sub = forge(
        {"type": ACCESS_TOKEN_TYPE, "exp": datetime.now(UTC) + timedelta(minutes=5)}
    )

    with pytest.raises(InvalidTokenError):
        decode_access_token(sin_sub)


def test_token_sin_vencimiento():
    """Firmado por nosotros pero eterno: no se acepta. PyJWT solo valida `exp`
    si viene, asi que hay que exigirlo explicitamente."""
    eterno = forge({"sub": "jperez", "type": ACCESS_TOKEN_TYPE})

    with pytest.raises(InvalidTokenError):
        decode_access_token(eterno)


def test_token_malformado():
    with pytest.raises(InvalidTokenError):
        decode_access_token("esto-no-es-un-jwt")


def test_los_errores_de_pyjwt_no_se_filtran():
    """Ningun llamador deberia tener que importar `jwt` para manejar un error."""
    with pytest.raises(TokenError):
        decode_token("roto", ACCESS_TOKEN_TYPE)


def test_el_access_vence_antes_que_el_refresh():
    """La expiracion diferenciada es el punto de tener dos tokens distintos."""
    access = decode_access_token(create_access_token("jperez"))
    refresh = decode_refresh_token(create_refresh_token("jperez"))

    assert access["exp"] < refresh["exp"]

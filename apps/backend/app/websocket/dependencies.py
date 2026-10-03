# Autenticacion de conexiones WebSocket: exige la misma sesion que REST (el
# access token JWT) y la valida ANTES de aceptar la conexion. El contrato
# completo -- por donde viaja el token y con que codigo se cierra -- esta en
# docs/architecture/websocket-protocol.md; el por que, en
# docs/decisions/0005-autenticacion-websocket.md.
#
# Uso en un endpoint:
#
#     @router.websocket("/ws")
#     async def algo_ws(websocket: WebSocket, user: CurrentUserWS):
#         await manager.serve(WSTopic.ALGO, websocket)
#
# Si el token no sirve, el endpoint nunca se ejecuta: la dependency lanza
# WebSocketException y el handler de core/exceptions.py cierra la conexion
# con el codigo correspondiente, sin que el cliente llegue a suscribirse.
import asyncio
import contextlib
import time
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, WebSocket, WebSocketDisconnect, WebSocketException
from fastapi.security.utils import get_authorization_scheme_param

from app.core.exceptions import ExpiredTokenError, TokenError
from app.core.security import decode_access_token
from app.domains.auth.schemas import AuthenticatedUser
from app.websocket.events import WSCloseCode

# Nombre fijado por RFC 6750 seccion 2.3 ("URI Query Parameter"). Es el unico
# medio que tiene un navegador: la API WebSocket de JS no permite agregar
# headers al handshake. Como queda en la URL, uvicorn lo escribiria en el log;
# app/config/logging.py lo enmascara.
ACCESS_TOKEN_QUERY_PARAM = "access_token"


def _reject(code: WSCloseCode, reason: str) -> WebSocketException:
    return WebSocketException(code=code, reason=reason)


def _extract_token(websocket: WebSocket) -> str:
    """El token del handshake, por header (RFC 6750 2.1) o query (2.3).

    El header queda para los clientes que pueden mandarlo (scripts, tests,
    herramientas); el query param, para el navegador. Mandarlo por los dos
    medios a la vez se rechaza: RFC 6750 seccion 2 dice que el cliente NO DEBE
    usar mas de uno, y aceptarlo obligaria a elegir cual vale.
    """
    header = websocket.headers.get("authorization")
    query_tokens = websocket.query_params.getlist(ACCESS_TOKEN_QUERY_PARAM)

    if header is not None and query_tokens:
        raise _reject(WSCloseCode.POLICY_VIOLATION, "El token debe viajar por un solo medio")

    if header is not None:
        scheme, token = get_authorization_scheme_param(header)
        if scheme.lower() != "bearer" or not token:
            raise _reject(WSCloseCode.POLICY_VIOLATION, "Token invalido")
        return token

    if len(query_tokens) > 1:
        raise _reject(WSCloseCode.POLICY_VIOLATION, "El token debe viajar por un solo medio")
    if not query_tokens or not query_tokens[0]:
        raise _reject(WSCloseCode.POLICY_VIOLATION, "Falta el token de acceso")
    return query_tokens[0]


async def _close_when_expired(websocket: WebSocket, expires_at: float) -> None:
    """Cierra con TOKEN_EXPIRED cuando vence el access token.

    REST revalida el token en cada request; un WebSocket vive horas con un
    solo handshake. Sin esto, una sesion vencida (o un token robado) seguiria
    recibiendo datos indefinidamente. El cliente reacciona igual que ante un
    401 de REST: renueva con el refresh token y reconecta.
    """
    await asyncio.sleep(max(0.0, expires_at - time.time()))
    # Si la conexion ya se cerro, no hay nada que hacer. Son dos casos: el
    # servidor ya mando su cierre (RuntimeError de Starlette) o el cliente se
    # fue sin que el endpoint se enterara todavia, p. ej. uno que solo publica
    # y no lee (WebSocketDisconnect). Sin suprimir el segundo, la tarea muere
    # con una excepcion que nadie recoge y asyncio la reporta en el log.
    with contextlib.suppress(RuntimeError, WebSocketDisconnect):
        await websocket.close(code=WSCloseCode.TOKEN_EXPIRED, reason="El token expiro")


async def get_current_user_ws(websocket: WebSocket) -> AsyncIterator[AuthenticatedUser]:
    """Identidad detras del access token del handshake, o conexion cerrada.

    Equivalente WebSocket de domains/auth/dependencies.py::get_current_user():
    misma validacion (decode_access_token) y misma identidad devuelta. Lo que
    cambia es como se informa el rechazo -- codigos de cierre en vez de 401 --
    y que ademas se vigila el vencimiento mientras la conexion siga abierta.

    Es una dependency con `yield` para que el vigilante de vencimiento viva
    exactamente lo que vive el endpoint.
    """
    token = _extract_token(websocket)

    try:
        claims = decode_access_token(token)
    except ExpiredTokenError as error:
        # Unico caso recuperable: el cliente puede renovar y reconectar.
        raise _reject(WSCloseCode.TOKEN_EXPIRED, "El token expiro") from error
    except TokenError as error:
        # Firma invalida, malformado, o un refresh usado como access.
        raise _reject(WSCloseCode.POLICY_VIOLATION, "Token invalido") from error

    watchdog = asyncio.create_task(
        _close_when_expired(websocket, claims["exp"]), name="ws-token-expiry"
    )
    try:
        yield AuthenticatedUser(username=claims["sub"])
    finally:
        watchdog.cancel()


# Mismo criterio que CurrentUser en domains/auth/dependencies.py: proteger un
# WebSocket es una anotacion.
CurrentUserWS = Annotated[AuthenticatedUser, Depends(get_current_user_ws)]

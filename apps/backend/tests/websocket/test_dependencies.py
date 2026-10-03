# Autenticacion del handshake WebSocket (get_current_user_ws). Se prueba por
# WebSocket contra una app minima y no llamando a la funcion suelta, porque
# el contrato es de protocolo: con que codigo se cierra y que el cliente no
# reciba nada antes. Los endpoints WS reales (reactor-state, realtime) todavia
# no existen; los arman las tareas 2.5 y siguientes con esta misma dependency.
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi import FastAPI, WebSocket, WebSocketException
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.config.settings import get_settings
from app.core.exceptions import websocket_exception_handler
from app.core.security import (
    ACCESS_TOKEN_TYPE,
    create_access_token,
    create_refresh_token,
)
from app.main import app
from app.websocket.dependencies import CurrentUserWS, _close_when_expired
from app.websocket.events import WSCloseCode

settings = get_settings()

URL = "/ws"


class RecordingApp:
    """Envoltorio ASGI que anota que mensajes manda el servidor.

    Hace falta porque el TestClient informa el codigo de cierre incluso si el
    servidor cerro SIN aceptar, cuando un servidor real responderia HTTP 403 y
    el codigo se perderia. Mirar los mensajes ASGI es la unica forma de
    verificar que el cliente real va a recibir el codigo.
    """

    def __init__(self, app) -> None:
        self.app = app
        self.sent: list[str] = []

    async def __call__(self, scope, receive, send):
        async def recording_send(message):
            if scope["type"] == "websocket":
                self.sent.append(message["type"])
            await send(message)

        await self.app(scope, receive, recording_send)


@pytest.fixture
def executed() -> list[str]:
    """Usuarios con los que llego a correr el endpoint."""
    return []


@pytest.fixture
def recorder(executed) -> RecordingApp:
    app = FastAPI()
    app.add_exception_handler(WebSocketException, websocket_exception_handler)

    @app.websocket(URL)
    async def protected(websocket: WebSocket, user: CurrentUserWS):
        executed.append(user.username)
        await websocket.accept()
        await websocket.send_json({"username": user.username})
        while (await websocket.receive())["type"] != "websocket.disconnect":
            pass

    return RecordingApp(app)


@pytest.fixture
def client(recorder) -> TestClient:
    return TestClient(recorder)


def forge(claims: dict, secret: str | None = None) -> str:
    return jwt.encode(claims, secret or settings.jwt_secret, algorithm=settings.jwt_algorithm)


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def connect_and_expect_close(client: TestClient, url: str = URL, **kwargs) -> WebSocketDisconnect:
    with (
        pytest.raises(WebSocketDisconnect) as closed,
        client.websocket_connect(url, **kwargs) as websocket,
    ):
        websocket.receive_json()
    return closed.value


# --- Conexion aceptada -------------------------------------------------------


def test_acepta_el_token_por_query_param(client: TestClient):
    """El medio del navegador (RFC 6750 2.3)."""
    token = create_access_token("jperez")

    with client.websocket_connect(f"{URL}?access_token={token}") as websocket:
        assert websocket.receive_json() == {"username": "jperez"}


def test_acepta_el_token_por_header(client: TestClient):
    """El medio de los clientes que pueden mandar headers (RFC 6750 2.1)."""
    with client.websocket_connect(URL, headers=bearer(create_access_token("jperez"))) as websocket:
        assert websocket.receive_json() == {"username": "jperez"}


# --- Conexion rechazada ------------------------------------------------------


def test_sin_token_se_rechaza_antes_de_recibir_cualquier_dato(
    client: TestClient, recorder: RecordingApp, executed: list[str]
):
    """Criterio de aceptacion de la 2.3, verificado a nivel de protocolo."""
    closed = connect_and_expect_close(client)

    assert closed.code == WSCloseCode.POLICY_VIOLATION
    assert closed.reason == "Falta el token de acceso"
    # El endpoint no llego a correr...
    assert executed == []
    # ...y el servidor no mando ningun dato: solo el accept (para que el
    # codigo llegue al navegador en vez de un 403 opaco) y el cierre.
    assert recorder.sent == ["websocket.accept", "websocket.close"]


def test_token_expirado_cierra_con_4401(client: TestClient, recorder: RecordingApp):
    vencido = forge(
        {
            "sub": "jperez",
            "type": ACCESS_TOKEN_TYPE,
            "exp": datetime.now(UTC) - timedelta(seconds=1),
        }
    )

    closed = connect_and_expect_close(client, f"{URL}?access_token={vencido}")

    # Distinto del resto: es el unico caso en el que conviene renovar y
    # reconectar.
    assert closed.code == WSCloseCode.TOKEN_EXPIRED
    assert recorder.sent == ["websocket.accept", "websocket.close"]


def test_firma_invalida_cierra_con_1008(client: TestClient):
    ajeno = forge(
        {
            "sub": "jperez",
            "type": ACCESS_TOKEN_TYPE,
            "exp": datetime.now(UTC) + timedelta(minutes=5),
        },
        secret="un-secreto-distinto-igual-de-largo-que-el-nuestro",
    )

    closed = connect_and_expect_close(client, f"{URL}?access_token={ajeno}")

    assert closed.code == WSCloseCode.POLICY_VIOLATION
    assert closed.reason == "Token invalido"


def test_token_malformado_cierra_con_1008(client: TestClient):
    closed = connect_and_expect_close(client, f"{URL}?access_token=esto-no-es-un-jwt")

    assert closed.code == WSCloseCode.POLICY_VIOLATION


def test_un_refresh_token_no_abre_un_websocket(client: TestClient, executed: list[str]):
    closed = connect_and_expect_close(
        client, f"{URL}?access_token={create_refresh_token('jperez')}"
    )

    assert closed.code == WSCloseCode.POLICY_VIOLATION
    assert executed == []


def test_query_param_vacio_cuenta_como_ausente(client: TestClient):
    closed = connect_and_expect_close(client, f"{URL}?access_token=")

    assert closed.code == WSCloseCode.POLICY_VIOLATION
    assert closed.reason == "Falta el token de acceso"


def test_el_esquema_del_header_tiene_que_ser_bearer(client: TestClient):
    token = create_access_token("jperez")

    closed = connect_and_expect_close(client, headers={"Authorization": f"Basic {token}"})

    assert closed.code == WSCloseCode.POLICY_VIOLATION


def test_token_por_header_y_query_a_la_vez_se_rechaza(client: TestClient, executed: list[str]):
    """RFC 6750 seccion 2: el cliente NO DEBE usar mas de un medio."""
    token = create_access_token("jperez")

    closed = connect_and_expect_close(client, f"{URL}?access_token={token}", headers=bearer(token))

    assert closed.code == WSCloseCode.POLICY_VIOLATION
    assert executed == []


def test_token_repetido_en_la_query_se_rechaza(client: TestClient):
    token = create_access_token("jperez")

    closed = connect_and_expect_close(client, f"{URL}?access_token={token}&access_token={token}")

    assert closed.code == WSCloseCode.POLICY_VIOLATION


# --- Vencimiento con la conexion abierta -------------------------------------


def test_cierra_la_conexion_cuando_vence_el_token(client: TestClient):
    """Un WS dura horas y el access minutos: sin esto, una sesion vencida
    seguiria recibiendo datos. Tarda hasta 2 s (el `exp` es en segundos)."""
    casi_vencido = forge(
        {
            "sub": "jperez",
            "type": ACCESS_TOKEN_TYPE,
            "exp": datetime.now(UTC) + timedelta(seconds=2),
        }
    )

    with client.websocket_connect(URL, headers=bearer(casi_vencido)) as websocket:
        assert websocket.receive_json() == {"username": "jperez"}

        with pytest.raises(WebSocketDisconnect) as closed:
            websocket.receive_json()

    assert closed.value.code == WSCloseCode.TOKEN_EXPIRED


async def test_el_vencimiento_sobre_un_socket_muerto_no_deja_una_excepcion_suelta():
    """Cliente que se corto sin que el endpoint se enterara (uno que solo
    publica y no lee): al vencer el token, cerrar el socket falla. La tarea
    tiene que terminar limpia; si no, asyncio reporta "Task exception was
    never retrieved"."""

    class DeadWebSocket:
        async def close(self, code: int = 1000, reason: str | None = None) -> None:
            raise WebSocketDisconnect(code=1006)

    await _close_when_expired(DeadWebSocket(), expires_at=0)


# --- Endpoints reales --------------------------------------------------------


@pytest.mark.parametrize("url", ["/api/v1/reactor-state/ws", "/api/v1/realtime/ws"])
def test_los_websocket_reales_exigen_sesion(url: str):
    """Los cuerpos todavia son de tareas siguientes (2.5 y realtime), pero la
    proteccion ya esta: sin token se cierra con 1008 y no se llega al
    endpoint. Se usa la app real para cubrir tambien el handler registrado en
    app/main.py."""
    closed = connect_and_expect_close(TestClient(app), url)

    assert closed.code == WSCloseCode.POLICY_VIOLATION
    assert closed.reason == "Falta el token de acceso"

# GET /reactor-state y WS /reactor-state/ws. Se prueban por HTTP y por
# WebSocket y no llamando al servicio, porque lo que agrega esta capa es
# justamente el protocolo: la proteccion con sesion, la forma del JSON que
# consume el frontend y que se lea el servicio vivo del lifespan.
#
# El servicio es el real, con repositorio y toma de datos reemplazados por los
# dobles de test_service.py: asi el estado se cambia con apply_signal(), el
# mismo camino que recorre un mensaje MQTT.
import json
import time

import anyio
import pytest
from fastapi.testclient import TestClient

from app import main
from app.composition import ReactorRuntime
from app.core.security import create_access_token, create_refresh_token
from app.domains.reactor_state.router import get_reactor_state_service
from app.main import app
from app.mqtt.schemas import SermoSignal
from app.websocket.manager import manager
from tests.domains.reactor_state.test_service import build_service

URL = "/api/v1/reactor-state"
WS_URL = f"{URL}/ws"


@pytest.fixture
def service():
    service, _, _ = build_service()
    return service


@pytest.fixture
def client(service) -> TestClient:
    # Sin `with`: no se dispara el lifespan, asi que no hace falta el broker
    # ni la base. Por lo mismo `app.state` no tiene el servicio y hay que
    # inyectarlo con un override.
    app.dependency_overrides[get_reactor_state_service] = lambda: service
    yield TestClient(app)
    app.dependency_overrides.pop(get_reactor_state_service, None)


def auth(username: str = "jperez") -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(username)}"}


def test_sin_token_devuelve_401(client: TestClient):
    response = client.get(URL)

    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"


def test_un_refresh_token_no_alcanza(client: TestClient):
    response = client.get(
        URL, headers={"Authorization": f"Bearer {create_refresh_token('jperez')}"}
    )

    assert response.status_code == 401


def test_reactor_detenido(client: TestClient):
    response = client.get(URL, headers=auth())

    assert response.status_code == 200
    body = response.json()
    assert body["sermo"] is False
    assert body["status"] == "DETENIDO"
    assert body["operation_id"] is None
    assert body["updated_at"]


async def test_reactor_operando_incluye_la_operacion_en_curso(service, client: TestClient):
    await service.apply_signal(SermoSignal(sermo=True))

    response = client.get(URL, headers=auth())

    assert response.status_code == 200
    body = response.json()
    assert body["sermo"] is True
    assert body["status"] == "OPERACION"
    assert body["operation_id"] == service.get_current_state().operation_id
    assert body["operation_id"] is not None


async def test_al_detenerse_ya_no_informa_operacion(service, client: TestClient):
    await service.apply_signal(SermoSignal(sermo=True))
    await service.apply_signal(SermoSignal(sermo=False))

    body = client.get(URL, headers=auth()).json()

    assert body["sermo"] is False
    assert body["status"] == "DETENIDO"
    assert body["operation_id"] is None


async def test_expone_si_la_senal_esta_llegando(service, client: TestClient):
    # El frontend lo necesita para su tercer estado visual: "sin conexion" no
    # es lo mismo que "detenido" (issues 2.6 y 2.7).
    await service.apply_signal(SermoSignal(sermo=True))
    await service.set_source_connected(True)
    assert client.get(URL, headers=auth()).json()["source_connected"] is True

    await service.set_source_connected(False)

    body = client.get(URL, headers=auth()).json()
    assert body["source_connected"] is False
    assert body["sermo"] is True


async def test_lee_el_servicio_que_armo_el_lifespan(service, monkeypatch):
    # Sin override: verifica el cableado real con app.state. Si el router
    # construyera su propio servicio, responderia "detenido" aunque el del
    # lifespan este operando.
    await service.apply_signal(SermoSignal(sermo=True))
    monkeypatch.setattr(app.state, "reactor_state_service", service, raising=False)

    response = TestClient(app).get(URL, headers=auth())

    assert response.status_code == 200
    assert response.json()["sermo"] is True


def test_aparece_protegido_en_el_openapi(client: TestClient):
    schema = client.get("/openapi.json").json()

    operation = schema["paths"][URL]["get"]
    assert "security" in operation
    # El contrato que va a consumir el frontend queda documentado en /docs.
    assert operation["responses"]["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/ReactorState"
    }


# --- WebSocket ---------------------------------------------------------------
#
# Con el lifespan real (`with TestClient`) y no con un override: lo que se
# prueba es tambien el cableado de app/main.py, que registra el listener que
# publica `state_changed`. Solo se reemplaza el runtime, para no depender del
# broker ni de la base.
#
# El servicio se maneja con `client.portal.call()`: tiene que correr en el
# mismo event loop que los sockets, igual que en el servidor real.


@pytest.fixture
def live(monkeypatch):
    service, _, acquisition = build_service()
    runtime = ReactorRuntime(state_service=service, acquisition=acquisition, subscriber=None)
    monkeypatch.setattr(main, "build_reactor_runtime", lambda settings: runtime)
    with TestClient(app) as client:
        yield client, service


def ws_url(username: str = "jperez") -> str:
    # Como lo hace el navegador: el token en el query param.
    return f"{WS_URL}?access_token={create_access_token(username)}"


def receive(ws, timeout: float = 2.0) -> dict:
    """`ws.receive_json()` con tope de espera.

    El del TestClient espera para siempre: si un evento no se publica -- que
    es justamente lo que estos tests buscan detectar -- la suite se cuelga en
    vez de fallar. Replica lo que hace `receive()` por dentro en Starlette 1.x
    (un atributo privado) y le agrega el tope.
    """

    async def receive_with_timeout():
        with anyio.fail_after(timeout):
            return await ws._send_rx.receive()

    message = ws.portal.call(receive_with_timeout)
    assert message["type"] == "websocket.send", f"se esperaba un evento: {message}"
    return json.loads(message["text"])


def test_al_conectarse_recibe_el_estado_actual_de_inmediato(live):
    """Criterio de aceptacion: no espera al primer cambio."""
    client, service = live
    client.portal.call(service.apply_signal, SermoSignal(sermo=True))

    with client.websocket_connect(ws_url()) as ws:
        event = receive(ws)

    assert event["type"] == "state_changed"
    assert event["data"]["sermo"] is True
    assert event["data"]["status"] == "OPERACION"
    assert event["data"]["operation_id"] == service.get_current_state().operation_id


def test_dos_clientes_reciben_el_mismo_state_changed_al_arrancar(live):
    """Criterio de aceptacion de la 2.5."""
    client, service = live

    with (
        client.websocket_connect(ws_url("jperez")) as a,
        client.websocket_connect(ws_url("mgomez")) as b,
    ):
        assert receive(a)["data"]["sermo"] is False
        assert receive(b)["data"]["sermo"] is False

        client.portal.call(service.apply_signal, SermoSignal(sermo=True))

        recibido_a, recibido_b = receive(a), receive(b)

    assert recibido_a == recibido_b
    assert recibido_a["type"] == "state_changed"
    assert recibido_a["data"]["sermo"] is True
    assert recibido_a["data"]["operation_id"] is not None


def test_publica_cada_transicion_y_no_las_repeticiones(live):
    # Un SERMO repetido (reentrega de QoS 1, retenido al reconectar) no es un
    # cambio: si se publicara, el cliente veria eventos sin que pase nada.
    client, service = live

    with client.websocket_connect(ws_url()) as ws:
        receive(ws)
        for sermo in (True, True, False):
            client.portal.call(service.apply_signal, SermoSignal(sermo=sermo))

        arranque, parada = receive(ws), receive(ws)

    assert arranque["data"]["sermo"] is True
    assert parada["data"]["sermo"] is False
    assert parada["data"]["status"] == "DETENIDO"
    assert parada["data"]["operation_id"] is None


def test_publica_si_se_pierde_la_senal(live):
    # "Sin senal" no es "detenido": sermo conserva el ultimo valor conocido y
    # el frontend lo distingue por source_connected (issues 2.6 y 2.7).
    client, service = live
    client.portal.call(service.apply_signal, SermoSignal(sermo=True))
    client.portal.call(service.set_source_connected, True)

    with client.websocket_connect(ws_url()) as ws:
        assert receive(ws)["data"]["source_connected"] is True

        client.portal.call(service.set_source_connected, False)

        event = receive(ws)

    assert event["data"]["source_connected"] is False
    assert event["data"]["sermo"] is True


def test_el_evento_tiene_exactamente_la_forma_documentada(live):
    """Contrato de docs/architecture/websocket-protocol.md. Si cambia, hay
    que cambiar tambien el documento y el frontend."""
    client, _ = live

    with client.websocket_connect(ws_url()) as ws:
        event = receive(ws)

    assert set(event) == {"type", "data"}
    assert set(event["data"]) == {
        "sermo",
        "status",
        "updated_at",
        "operation_id",
        "source_connected",
    }


def test_al_irse_el_cliente_deja_de_estar_suscripto(live):
    client, service = live

    with client.websocket_connect(ws_url()) as ws:
        receive(ws)
        assert manager.subscriber_count("reactor.state") == 1

    # El desuscribir ocurre en el loop del TestClient: se espera a que pase.
    wait_until(lambda: manager.subscriber_count("reactor.state") == 0)
    # Y publicar sin nadie escuchando no falla.
    client.portal.call(service.apply_signal, SermoSignal(sermo=True))


def wait_until(condition, timeout: float = 2.0) -> None:
    deadline = time.monotonic() + timeout
    while not condition():
        assert time.monotonic() < deadline, "la condicion no se cumplio a tiempo"
        time.sleep(0.01)

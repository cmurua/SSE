# GET /reactor-state. Se prueba por HTTP y no llamando al servicio, porque lo
# que agrega esta capa es justamente HTTP: la proteccion con sesion, la forma
# del JSON que consume el frontend y que se lea el servicio vivo del lifespan.
#
# El servicio es el real, con repositorio y toma de datos reemplazados por los
# dobles de test_service.py: asi el estado se cambia con apply_signal(), el
# mismo camino que recorre un mensaje MQTT.
import pytest
from fastapi.testclient import TestClient

from app.core.security import create_access_token, create_refresh_token
from app.domains.reactor_state.router import get_reactor_state_service
from app.main import app
from app.mqtt.schemas import SermoSignal
from tests.domains.reactor_state.test_service import build_service

URL = "/api/v1/reactor-state"


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

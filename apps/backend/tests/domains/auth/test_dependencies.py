# Proteccion de endpoints. Se prueba contra GET /auth/me y no contra la
# funcion suelta, porque parte del contrato es de HTTP: el status 401 y el
# header WWW-Authenticate. Llamando a get_current_user() directamente esos
# dos no se verifican.
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi.testclient import TestClient

from app.config.settings import get_settings
from app.core.security import (
    ACCESS_TOKEN_TYPE,
    create_access_token,
    create_refresh_token,
)
from app.main import app

settings = get_settings()

ME = "/api/v1/auth/me"


@pytest.fixture
def client() -> TestClient:
    # Sin `with`: no se dispara el lifespan, asi que el test no necesita el
    # broker MQTT ni la base. Lo que se prueba es la dependency, no el arranque.
    return TestClient(app)


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_con_token_valido_devuelve_el_usuario(client: TestClient):
    response = client.get(ME, headers=auth(create_access_token("jperez")))

    assert response.status_code == 200
    assert response.json() == {"username": "jperez"}


def test_sin_token_devuelve_401(client: TestClient):
    response = client.get(ME)

    assert response.status_code == 401
    # Sin el challenge la respuesta no es un desafio valido (RFC 6750). Cuando
    # no llego ningun token el challenge va pelado, sin `error`.
    assert response.headers["WWW-Authenticate"] == "Bearer"


def test_con_token_expirado_devuelve_401(client: TestClient):
    vencido = jwt.encode(
        {
            "sub": "jperez",
            "type": ACCESS_TOKEN_TYPE,
            "exp": datetime.now(UTC) - timedelta(seconds=1),
        },
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )

    response = client.get(ME, headers=auth(vencido))

    assert response.status_code == 401
    assert 'error="invalid_token"' in response.headers["WWW-Authenticate"]


def test_con_firma_invalida_devuelve_401(client: TestClient):
    ajeno = jwt.encode(
        {
            "sub": "jperez",
            "type": ACCESS_TOKEN_TYPE,
            "exp": datetime.now(UTC) + timedelta(minutes=5),
        },
        "un-secreto-distinto-igual-de-largo-que-el-nuestro",
        algorithm=settings.jwt_algorithm,
    )

    response = client.get(ME, headers=auth(ajeno))

    assert response.status_code == 401


def test_un_refresh_token_no_abre_un_endpoint_protegido(client: TestClient):
    """El cruce de tipos de la 1.3, verificado de punta a punta por HTTP."""
    response = client.get(ME, headers=auth(create_refresh_token("jperez")))

    assert response.status_code == 401


def test_el_esquema_tiene_que_ser_bearer(client: TestClient):
    token = create_access_token("jperez")

    response = client.get(ME, headers={"Authorization": f"Basic {token}"})

    assert response.status_code == 401


def test_me_aparece_protegido_en_el_openapi(client: TestClient):
    """Que /docs muestre el candado no es cosmetico: es como el resto del
    equipo se entera de que el endpoint exige sesion."""
    schema = client.get("/openapi.json").json()

    assert "security" in schema["paths"]["/api/v1/auth/me"]["get"]

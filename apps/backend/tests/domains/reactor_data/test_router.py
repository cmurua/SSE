# GET /reactor-data/variables. Se prueba por HTTP porque lo que agrega esta
# capa es justamente HTTP: la proteccion con sesion, la forma del JSON que
# consume el selector de RF05 y el cacheo.
#
# Los tests se escriben contra el catalogo real y no contra un doble: el
# catalogo ES el contrato de esta tarea, y un doble solo verificaria que el
# router sabe iterar una lista.
import pytest
from fastapi.testclient import TestClient

from app.core.security import create_access_token, create_refresh_token
from app.domains.reactor_data.variable_catalog import (
    REACTOR_GROUPS,
    REACTOR_VARIABLES,
    REACTOR_VARIABLES_BY_ID,
)
from app.main import app

URL = "/api/v1/reactor-data/variables"


@pytest.fixture
def client() -> TestClient:
    # Sin `with`: no se dispara el lifespan, asi que no hace falta el broker
    # ni la base. El catalogo es estatico y no depende de ninguno de los dos.
    return TestClient(app)


def auth(username: str = "jperez") -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(username)}"}


def test_sin_token_devuelve_401(client: TestClient):
    response = client.get(URL)

    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"


def test_un_refresh_token_no_abre_el_endpoint(client: TestClient):
    response = client.get(
        URL, headers={"Authorization": f"Bearer {create_refresh_token('jperez')}"}
    )

    assert response.status_code == 401


def test_devuelve_el_catalogo_completo(client: TestClient):
    """Criterio de aceptacion: las 34 señales con todos sus metadatos."""
    response = client.get(URL, headers=auth())

    assert response.status_code == 200
    variables = response.json()
    assert len(variables) == len(REACTOR_VARIABLES)
    assert {v["id"] for v in variables} == set(REACTOR_VARIABLES_BY_ID)


def test_cada_variable_trae_todos_los_metadatos(client: TestClient):
    variables = client.get(URL, headers=auth()).json()

    esperados = {"id", "name", "unit", "group", "group_name", "min", "max", "nominal", "kind"}
    for variable in variables:
        assert set(variable) == esperados, variable["id"]
        # Ningun campo vacio: un selector con unidades en blanco no sirve.
        assert variable["name"] and variable["unit"] and variable["group"]


def test_los_valores_coinciden_con_el_catalogo(client: TestClient):
    """El endpoint proyecta el catalogo, no lo reinterpreta."""
    variables = {v["id"]: v for v in client.get(URL, headers=auth()).json()}

    for origen in REACTOR_VARIABLES:
        expuesta = variables[origen["id"]]
        assert expuesta["name"] == origen["name"]
        assert expuesta["unit"] == origen["unit"]
        assert expuesta["group"] == origen["group"]
        assert expuesta["min"] == origen["min"]
        assert expuesta["max"] == origen["max"]
        assert expuesta["nominal"] == origen["nominal"]
        assert expuesta["kind"] == origen["kind"]


def test_el_nombre_del_grupo_viene_resuelto(client: TestClient):
    """Para que el frontend no tenga que duplicar la tabla de nombres."""
    variables = client.get(URL, headers=auth()).json()

    for variable in variables:
        assert variable["group_name"] == REACTOR_GROUPS[variable["group"]]

    potm4 = next(v for v in variables if v["id"] == "POTM4")
    assert potm4["group"] == "SSO"
    assert potm4["group_name"] == "Supervision de Operacion"


def test_el_rango_contiene_al_nominal(client: TestClient):
    """Un eje cuyo valor tipico cae afuera de la escala esta mal declarado."""
    for variable in client.get(URL, headers=auth()).json():
        assert variable["min"] <= variable["nominal"] <= variable["max"], variable["id"]


def test_la_respuesta_se_puede_cachear(client: TestClient):
    """El catalogo cambia con un deploy, no en caliente."""
    response = client.get(URL, headers=auth())

    cache_control = response.headers["Cache-Control"]
    assert "max-age" in cache_control
    # `private`: la respuesta va detras de un token y no debe quedar guardada
    # en una cache compartida.
    assert "private" in cache_control


def test_el_catalogo_se_arma_una_sola_vez(client: TestClient):
    """Dos requests devuelven las MISMAS instancias, no copias nuevas."""
    from app.domains.reactor_data.router import build_catalog

    build_catalog.cache_clear()
    primera = build_catalog()
    segunda = build_catalog()

    assert primera is segunda
    assert build_catalog.cache_info().hits == 1

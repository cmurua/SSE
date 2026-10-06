# GET /reactor-data/variables: el catalogo de señales del RA-0.
#
# Es el contrato que necesita el frontend para armar el selector de RF05 sin
# hardcodear nada: nombres, unidades, agrupamiento y los rangos con los que
# escalar los ejes. La fuente es variable_catalog.py (tarea 3.9); este router
# solo la proyecta a la forma que consume la UI.
from functools import lru_cache

from fastapi import APIRouter, Response

from app.domains.auth.dependencies import CurrentUser
from app.domains.reactor_data.schemas import ReactorVariable
from app.domains.reactor_data.variable_catalog import (
    REACTOR_GROUPS,
    REACTOR_VARIABLES,
)

router = APIRouter()

# El catalogo es estatico: cambia con un deploy, no en caliente. Una hora de
# cache en el cliente evita volver a pedirlo en cada navegacion sin volverlo
# imposible de actualizar. `private` y no `public` porque la respuesta va
# detras de un token: no debe quedar en caches compartidas.
CATALOG_CACHE_CONTROL = "private, max-age=3600"


@lru_cache(maxsize=1)
def build_catalog() -> tuple[ReactorVariable, ...]:
    """Arma el catalogo una sola vez por proceso.

    Sin esto se instanciarian 34 modelos de Pydantic en cada request para
    devolver siempre lo mismo. Se cachea una tupla y no una lista para que un
    llamador no pueda mutar el cache por accidente.
    """
    return tuple(
        ReactorVariable(
            id=variable["id"],
            name=variable["name"],
            unit=variable["unit"],
            group=variable["group"],
            group_name=REACTOR_GROUPS[variable["group"]],
            min=variable["min"],
            max=variable["max"],
            nominal=variable["nominal"],
            kind=variable["kind"],
        )
        for variable in REACTOR_VARIABLES
    )


@router.get("/variables")
def list_variables(user: CurrentUser, response: Response) -> list[ReactorVariable]:
    """Catalogo completo de señales. Requiere sesion.

    Se devuelve entero y sin paginar a proposito: son 34 señales fijas y el
    selector las necesita todas a la vez para poder agruparlas.
    """
    response.headers["Cache-Control"] = CATALOG_CACHE_CONTROL
    return list(build_catalog())

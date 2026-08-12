# GET /help/sections — sirve metadata del manual de usuario (RF07).
# El contenido en si vive en docs/manual-usuario/.
from fastapi import APIRouter

router = APIRouter()


@router.get("/sections")
def list_help_sections():
    raise NotImplementedError

# SUPUESTO: la exportacion a PNG se genera del lado del frontend
# (renderizado del grafico -> canvas/SVG -> PNG), por lo que el backend
# solo necesita registrar el evento para auditoria (RNF03), no generar
# el archivo. Revisar este supuesto si se requiere export server-side.
from fastapi import APIRouter

router = APIRouter()


@router.post("/log")
def log_export():
    raise NotImplementedError

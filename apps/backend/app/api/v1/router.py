# Agrega los routers de cada dominio bajo /api/v1. No contiene logica propia:
# cada dominio es responsable de sus propios endpoints y validaciones.
from fastapi import APIRouter

from app.domains.auth.router import router as auth_router
from app.domains.reactor_state.router import router as reactor_state_router
from app.domains.realtime.router import router as realtime_router
from app.domains.historicals.router import router as historicals_router
from app.domains.exports.router import router as exports_router
from app.domains.reports.router import router as reports_router
from app.domains.help.router import router as help_router

api_router = APIRouter()
api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(reactor_state_router, prefix="/reactor-state", tags=["reactor-state"])
api_router.include_router(realtime_router, prefix="/realtime", tags=["realtime"])
api_router.include_router(historicals_router, prefix="/historicals", tags=["historicals"])
api_router.include_router(exports_router, prefix="/exports", tags=["exports"])
api_router.include_router(reports_router, prefix="/reports", tags=["reports"])
api_router.include_router(help_router, prefix="/help", tags=["help"])

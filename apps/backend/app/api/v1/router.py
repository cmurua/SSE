# Agrega los routers de cada dominio bajo /api/v1. No contiene logica propia:
# cada dominio es responsable de sus propios endpoints y validaciones.
#
# Para exigir sesion en TODOS los endpoints de un dominio, se le pasa la
# dependency al include_router:
#
#     api_router.include_router(
#         historicals_router,
#         prefix="/historicals",
#         tags=["historicals"],
#         dependencies=[Depends(get_current_user)],
#     )
#
# Hoy no se protege ningun router entero: cada tarea decide si su endpoint
# requiere sesion y lo anota con `user: CurrentUser` (ver
# domains/auth/dependencies.py). Ya protegidos asi: GET /auth/me y
# GET /reactor-state.
#
# Ojo con los routers que mezclan REST y WebSocket (reactor-state, realtime):
# la dependency a nivel router se aplicaria tambien al WS, donde HTTPBearer
# no funciona. Esos se protegen endpoint por endpoint: `user: CurrentUser` en
# los REST y `user: CurrentUserWS` (app/websocket/dependencies.py) en los WS.
from fastapi import APIRouter

from app.domains.auth.router import router as auth_router
from app.domains.exports.router import router as exports_router
from app.domains.help.router import router as help_router
from app.domains.historicals.router import router as historicals_router
from app.domains.reactor_state.router import router as reactor_state_router
from app.domains.realtime.router import router as realtime_router
from app.domains.reports.router import router as reports_router

api_router = APIRouter()
api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(reactor_state_router, prefix="/reactor-state", tags=["reactor-state"])
api_router.include_router(realtime_router, prefix="/realtime", tags=["realtime"])
api_router.include_router(historicals_router, prefix="/historicals", tags=["historicals"])
api_router.include_router(exports_router, prefix="/exports", tags=["exports"])
api_router.include_router(reports_router, prefix="/reports", tags=["reports"])
api_router.include_router(help_router, prefix="/help", tags=["help"])

# Composition root: crea la app FastAPI, registra routers de dominio,
# middleware de auditoria y CORS. Cada dominio expone su propio router;
# este archivo solo ensambla, no contiene logica de negocio.
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.v1.router import api_router
from app.composition import build_reactor_runtime
from app.config.logging import configure_logging
from app.config.settings import get_settings
from app.db.session import get_db

settings = get_settings()
configure_logging(settings.log_level)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Arranca y detiene la ingesta de la senal SERMO.

    La suscripcion MQTT es una tarea de fondo que tiene que vivir exactamente
    lo que vive la app: atarla al lifespan es lo que garantiza que se corte al
    apagar y que no queden tareas huerfanas entre recargas de `--reload`.
    """
    runtime = build_reactor_runtime(settings)
    # Se publica en app.state para que los routers (GET /reactor-state, issue
    # 2.2; WS reactor.state, issue 2.5) lean el mismo servicio y no construyan
    # una segunda copia del estado.
    app.state.reactor_runtime = runtime
    app.state.reactor_state_service = runtime.state

    await runtime.start()
    try:
        yield
    finally:
        await runtime.stop()


app = FastAPI(
    title="SSE - Sistema de Soporte a la Ensenanza RA-0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/health/db")
def health_db(db: Annotated[Session, Depends(get_db)]) -> dict:
    """Chequeo de vida de la base y, de paso, de la dependency get_db():
    si la sesion no se inyecta o no se cierra bien, falla aca."""
    db.execute(text("select 1"))
    return {"status": "ok", "database": "reachable"}

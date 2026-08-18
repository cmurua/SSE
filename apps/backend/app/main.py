# Composition root: crea la app FastAPI, registra routers de dominio,
# middleware de auditoria y CORS. Cada dominio expone su propio router;
# este archivo solo ensambla, no contiene logica de negocio.
from typing import Annotated

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.v1.router import api_router
from app.config.settings import get_settings
from app.db.session import get_db

settings = get_settings()

app = FastAPI(title="SSE - Sistema de Soporte a la Ensenanza RA-0")

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

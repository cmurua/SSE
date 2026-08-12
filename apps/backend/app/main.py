# Composition root: crea la app FastAPI, registra routers de dominio,
# middleware de auditoria y CORS. Cada dominio expone su propio router;
# este archivo solo ensambla, no contiene logica de negocio.
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.config.settings import get_settings

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

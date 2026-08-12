# SSE — Sistema de Soporte a la Ensenanza · Reactor Nuclear RA-0

Monorepo del Proyecto Integrador (Ingenieria en Computacion, UNC — CUTN).
Subsistema del SIR (Sistema Informatico del Reactor) del RA-0: adquiere,
almacena, consulta y visualiza datos operativos con fines educativos.
El SSE **no** controla ni interviene sobre la operacion del reactor.

## Estructura

- `apps/backend` — API FastAPI (Python), modular por dominios.
- `apps/frontend` — SPA React + TypeScript.
- `infra/docker` — Dockerfiles e infraestructura de contenedores.
- `docs/` — arquitectura, decisiones (ADR), manual de usuario, contrato API/WS.
- `scripts/` — scripts de desarrollo y de base de datos.

Ver el detalle de decisiones y supuestos en `docs/architecture/overview.md`
y en `docs/decisions/`.

## Quickstart (desarrollo local)

```
cp .env.example .env
docker compose up --build
```

- Backend: http://localhost:8000 (docs interactivas en `/docs`)
- Frontend: http://localhost:5173

## Stack confirmado

Backend Python/FastAPI · PostgreSQL · REST + WebSockets · Frontend
React + TypeScript · Auth JWT propio (access + refresh) · Docker Compose
para desarrollo local · Tests unitarios (pytest / vitest).

Ver `docs/architecture/overview.md` para el detalle de que esta
**confirmado** vs. **asumido**.

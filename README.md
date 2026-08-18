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

Requisitos: Docker Engine y Docker Compose v2 (`docker compose`, con espacio).

```
cp .env.example .env
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
docker compose up --build
```

Los tres `.env` son obligatorios: el de la raiz alimenta a `docker-compose.yml`
(credenciales de Postgres y puertos publicados) y los de `apps/*` se inyectan
en cada contenedor. Ninguno se versiona (ver `.gitignore`).

- Backend: http://localhost:8000 (docs interactivas en `/docs`)
- Frontend: http://localhost:5173
- Postgres: `localhost:5432` (usuario/base segun el `.env` de la raiz)

### Verificacion

```
curl http://localhost:8000/health          # -> {"status":"ok"}
docker compose ps                          # db y backend en estado "healthy"
```

`db` expone un healthcheck con `pg_isready` (`start_period` de 30s para el
primer arranque, que inicializa el cluster) y `backend` uno contra `/health`;
`backend` espera a `db` sano y `frontend` espera a `backend` sano, asi que
`docker compose up` ya respeta el orden de arranque.

Para confirmar la conexion a Postgres desde el backend:

```
docker compose exec backend python -c "from sqlalchemy import text; from app.db.session import engine; print(engine.connect().execute(text('select 1')).scalar())"
```

### Pasos manuales / troubleshooting

- **`docker: unknown command: docker compose`**: hay Compose v2 standalone pero
  no el plugin del CLI. Enlazarlo una vez:
  `mkdir -p ~/.docker/cli-plugins && ln -s "$(which docker-compose)" ~/.docker/cli-plugins/docker-compose`.
- **Cambios en dependencias**: el codigo se toma por bind mount, pero las
  dependencias viven en la imagen. Tras tocar `apps/backend/pyproject.toml` o
  `apps/frontend/package.json` hay que reconstruir. En el frontend, ademas,
  `node_modules` es un volumen anonimo y hay que renovarlo:
  `docker compose up -d --build -V frontend`.
- **Puertos ocupados**: cambiar `POSTGRES_PORT`, `BACKEND_PORT` o
  `FRONTEND_PORT` en el `.env` de la raiz (solo afectan al puerto publicado en
  el host; dentro de la red de Compose los servicios siguen en 5432/8000/5173).
- **Backend fuera de Docker** (venv local, ver `apps/backend/README.md`): en
  `apps/backend/.env` el host de `DATABASE_URL` debe pasar de `db` (nombre del
  servicio en la red de Compose) a `localhost`.
- **Empezar de cero** (borra los datos de Postgres): `docker compose down -v`.

En Windows, `scripts/dev/up.ps1`, `down.ps1` y `logs.ps1` envuelven estos
comandos.

## Stack confirmado

Backend Python/FastAPI · PostgreSQL · REST + WebSockets · Frontend
React + TypeScript · Auth JWT propio (access + refresh) · Docker Compose
para desarrollo local · Tests unitarios (pytest / vitest).

Ver `docs/architecture/overview.md` para el detalle de que esta
**confirmado** vs. **asumido**.

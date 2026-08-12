# Arquitectura — SSE RA-0

## Confirmado (por el usuario)

- Monorepo. Backend Python + FastAPI, estilo "API modular monolitica"
  organizada por dominios. Comunicacion REST + WebSockets. Base de datos
  PostgreSQL. Frontend React + TypeScript, cliente unicamente web. Auth
  JWT propio (access + refresh); sin roles, todos los usuarios tienen el
  mismo privilegio. Despliegue local/desarrollo con Docker Compose. Tests
  unitarios solamente (sin integracion/E2E confirmados).
- Modelo de datos operativos: tabla ancha, una fila por muestra temporal
  (~1 muestra/segundo), una columna por variable (~30 variables). Mismo
  esquema para tiempo real e historicos.
- Regla de negocio central: la señal SERMO habilita/deshabilita el modulo
  de tiempo real (RF04); en falso quedan disponibles los historicos.
- Latencia objetivo <= 2s (RNF01), ~100 usuarios concurrentes (criterio
  no funcional del pedido de estructura; la SRS original menciona 40).

## Asumido (marcar como pendiente de confirmar)

- Framework de build del frontend: **Vite** (no fue confirmado
  explicitamente, solo "React + TypeScript"). Se elige por simplicidad
  para una SPA sin necesidad de SSR.
- Libreria de fetching/estado de servidor: **TanStack Query** para REST.
- Libreria de graficos: NO definida (a proposito). Ver
  `docs/decisions/0002-chart-library-deferred.md`.
- Exportacion a PNG (RF06/area 5): se asume renderizado client-side
  (canvas/SVG -> PNG) y el backend solo audita el evento
  (`domains/exports`). Revisar si se requiere export server-side.
- Login: existen DOS integraciones externas distintas, no confundir:
  1. HOY (confirmado): un modulo externo e independiente valida
     usuario/contrasena via su propia API (`domains/auth/adapters/external_api_provider.py`).
  2. FUTURO (mencionado en la SRS como dependencia): el SSO real de la
     UNC. Reservado en `domains/auth/adapters/sso/` sin implementar.
- Catalogo de ~30 variables del reactor: se tomo como referencia el mock
  del prototipo de frontend (`SSE V1.zip`, `mockData.jsx`). La lista real
  de variables/IDs/unidades debe confirmarse con el SIR/SSO antes de
  cerrar el modelo de datos (`app/domains/reactor_data/`).
- Mecanismo de lectura de tiempo real desde PostgreSQL (polling vs.
  LISTEN/NOTIFY): sin definir, impacta directamente en RNF01 (latencia).
- Rate limiting / bloqueo de intentos fallidos (RF03): implementado hoy
  como tabla en Postgres (`login_attempts`); si la concurrencia real lo
  justifica, evaluar Redis a futuro.

## Riesgos de esta estructura

- La tabla ancha `reactor_samples` (~30 columnas) requiere migraciones
  cada vez que se agrega/renombra una variable; si el listado de
  variables cambia con frecuencia, evaluar una tabla mas flexible
  (a costa de queries mas caras) — no se cambia ahora por no tener
  evidencia de que las variables sean inestables.
- Los dominios `realtime` y `reactor_state` estan separados a proposito
  (single responsibility), pero exige disciplina para no duplicar logica
  de gating por SERMO en ambos — toda la logica de "esta habilitado el
  tiempo real" debe vivir en un solo lugar.

## Evoluciones futuras

- Imagenes Docker de produccion (multi-stage) + `infra/nginx/`.
- Redis para rate limiting / pub-sub de WebSocket si crece la concurrencia.
- Tests de integracion/E2E si el alcance del proyecto lo requiere mas adelante.

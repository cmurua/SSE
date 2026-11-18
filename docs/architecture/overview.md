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
- Origen de SERMO: una FPGA publica la señal por **MQTT**; al recibirla
  el backend abre la operacion y arranca la toma de datos desde la PC
  principal del reactor. La base de datos es proyeccion de esa señal, no
  su fuente. Ver `docs/decisions/0004-representacion-sermo.md` y el
  contrato en `docs/architecture/mqtt-protocol.md`.
- Tiempo real sin consultar Postgres: las transiciones de SERMO llegan por
  push MQTT y las muestras se publican en el mismo proceso apenas se
  guardan (`register_listener()` en `ReactorStateService` y en
  `AcquisitionService`). Ni polling ni LISTEN/NOTIFY; este ultimo queda como
  salida si se pasa a varios procesos. Ver
  `docs/decisions/0006-mecanismo-lectura-tiempo-real.md`.
- Latencia objetivo <= 2s (RNF01), ~100 usuarios concurrentes (criterio
  no funcional del pedido de estructura; la SRS original menciona 40).

## Verificacion del RNF01 (latencia de 2 s o menos)

Medido en la tarea 3.8, el 18/11/2026. **Se cumple con margen**: con 100
clientes conectados a la vez, la peor muestra tardo 1,07 s en verse en
pantalla, y el 99 % llego en menos de 0,41 s.

### Que se mide

Desde que **se toma la muestra** hasta que **se pinta en la pantalla**. El
`timestamp` de cada muestra se fija en el backend al leerla, antes del
INSERT, asi que la cifra incluye todo el camino: lectura, INSERT en
Postgres, reparto (`RealtimeService`), WebSocket, red, React y el pintado.
Es mas exigente que "desde el INSERT", como pedia la tarea.

Dos herramientas, que quedan en el repo para volver a medir:

- **Medidor del navegador** (`features/realtime/hooks/useLatencyProbe.ts`):
  se activa abriendo `/realtime?latencia`. Mide `hora actual - timestamp de
  la muestra` en el frame siguiente al render que la dibujo, y escribe el
  resumen en la consola cada 60 muestras. `__sseLatency.summary()` y
  `__sseLatency.slow()` lo consultan a mano. Las mediciones tomadas con la
  pestana oculta se cuentan aparte (`hidden`) y no entran en el resumen (ver
  "Pestana oculta").
- **Carga de clientes** (`scripts/perf/realtime_latency.py`): abre N
  WebSocket a `/realtime/ws` suscriptos a 2 variables y mide la latencia
  hasta que reciben cada muestra. No cuenta el render. Informa si el
  servidor corto a algun cliente por lento (1013).

```
docker compose exec backend python /scripts/mqtt/fpga.py start
docker compose exec backend python /scripts/perf/realtime_latency.py --clients 1,10,50,100,200 --seconds 60
# y en el navegador: /realtime?latencia, con la consola abierta ANTES de cargar
```

### Entorno

Todo en la misma maquina: notebook AMD Ryzen 5 7520U (4 nucleos, 8 hilos),
13 GiB de RAM, Docker 29.1. Backend, Postgres, Mosquitto, el simulador de la
FPGA, el generador de carga y Firefox compiten por la misma CPU. Stack de
**desarrollo**: `uvicorn --reload` con un worker y React sin optimizar
(`vite dev`). Variables: Potencia y LogA1, a 1 Hz.

### Resultados

**Hasta el cliente** (script, 60 s por fila; latencias en ms):

| Clientes | Muestras | p50 | p95 | p99 | Max | > 2 s | Cortados |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 60 | 9,6 | 11,5 | 11,9 | 12,3 | 0 | 0 |
| 10 | 600 | 9,7 | 11,8 | 12,3 | 12,8 | 0 | 0 |
| 50 | 3.000 | 11,4 | 16,6 | 18,3 | 19,6 | 0 | 0 |
| 100 | 6.000 | 14,1 | 21,0 | 22,7 | 24,6 | 0 | 0 |
| 200 | 12.000 | 16,9 | 31,1 | 89,4 | 94,6 | 0 | 0 |

**Hasta la pantalla** (medidor del navegador, Firefox; latencias en ms):

| Escenario | Mediciones | p50 | p95 | p99 | Max | > 2 s |
|---|---:|---:|---:|---:|---:|---:|
| Solo el navegador, 5 min | 300 | 38 | 48 | 54 | 150 | 0 |
| Navegador + 100 clientes, 3 min | 192 | 97 | 114 | 407 | 1.065 | 0 |

En esa misma corrida de 3 minutos, los 100 clientes del script midieron
p50 11,8, p95 18,6, p99 126,9 y maximo 134,2 ms, sin cortes.

### Lectura

- El reparto escala bien hasta la concurrencia del pedido: de 1 a 100
  clientes la mediana pasa de 10 a 14 ms. Con 200 aparece una cola (p99 de
  89 ms) por servir a todos desde un solo proceso, todavia 20 veces por
  debajo del limite. Ningun cliente fue cortado por lento.
- La mayor parte de la latencia que ve el usuario esta en el navegador:
  unos 30 ms de React y pintado en reposo. La agrupacion por frame de
  `useRealtimeSocket` y el medir un frame despues suman hasta dos frames.
- Con carga, la mediana en pantalla sube de 38 a 97 ms porque el navegador
  comparte la CPU con el backend y con los 100 clientes. En produccion cada
  usuario corre en su propia maquina, asi que esta medicion es pesimista.

### Pestana oculta

Con la pestana oculta (otra pestana u otra aplicacion al frente) el
navegador deja de pintar o lo espacia cada vez mas, y una medicion de ese
momento mide eso y no la transmision: en una prueba controlada dieron entre
1,4 y 16,5 s, creciendo al doble de una a la otra. El medidor las detecta
(`visibilitychange`) y las cuenta aparte. En la prueba quedaron 10
mediciones marcadas como ocultas, entre ellas todas las de mas de 2 s; de
las que siguieron contando, la peor fue de 587 ms. Para el RNF01 no cuentan: es la
latencia hasta lo que el usuario esta mirando, y al volver a la pestana se
dibuja el dato al dia en el frame siguiente.

Una primera corrida sin ese control dio 2 mediciones de mas de 2 s al
principio. Desaparecieron al abrir la consola del navegador ANTES de cargar
la pagina: eran el bloqueo de abrir las herramientas de desarrollo con la
pagina ya cargada, no la transmision. Por eso el protocolo pide abrirla
primero.

### Limites de esta medicion

- **Una sola maquina**: no hay red real ni relojes distintos. En el
  despliegue, el navegador y el servidor van a estar en maquinas distintas:
  hay que volver a medir alli, con los relojes sincronizados por NTP (el
  medidor resta horas de dos relojes).
- **Stack de desarrollo**: un build de produccion deberia dar menos, no mas.
- **Un worker de uvicorn** es condicion del diseno (ver "Riesgos"); la
  medicion vale para esa configuracion.
- No se midio con un navegador por cliente: los 100 clientes del script no
  renderizan. El costo de render es por usuario y no depende de cuantos haya.

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
- Formato exacto del mensaje MQTT de la FPGA y protocolo de lectura de la
  PC principal (pull vs. push): sin confirmar. El backend acepta hoy un
  superconjunto de formatos probables y la fuente de muestras esta detras
  de un puerto (`domains/reactor_data/sources/`) para que definirlo no
  toque el resto. Ver ADR 0004, seccion "pendiente de confirmar".
- Catalogo de ~30 variables del reactor: se tomo como referencia el mock
  del prototipo de frontend (`SSE V1.zip`, `mockData.jsx`). La lista real
  de variables/IDs/unidades debe confirmarse con el SIR/SSO antes de
  cerrar el modelo de datos (`app/domains/reactor_data/`).
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
  tiempo real" debe vivir en un solo lugar. Hoy ese lugar es
  `ReactorStateService`; `domains/realtime` debe preguntarle en vez de
  reimplementar la regla, y `GET /realtime/status` (stub) tiene que
  definirse o eliminarse para no volverse una segunda fuente de verdad.
- El estado de SERMO vive en memoria del proceso del backend. Correr mas
  de un worker de uvicorn daria una copia por worker, cada una con su
  propia toma de datos escribiendo las mismas muestras. El backend corre
  con un worker y el tiempo real depende de eso: cambiarlo requiere pasar
  el aviso de muestras y de SERMO a LISTEN/NOTIFY (ver ADR 0006).

## Evoluciones futuras

- Imagenes Docker de produccion (multi-stage) + `infra/nginx/`.
- Redis para rate limiting / pub-sub de WebSocket si crece la concurrencia.
- Tests de integracion/E2E si el alcance del proyecto lo requiere mas adelante.

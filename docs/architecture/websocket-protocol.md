# Contrato de WebSocket (borrador)

## Topicos

- `reactor.state` — cambios de estado SERMO/operacion. El origen del dato
  es la senal MQTT de la FPGA, no la base: ver
  `docs/architecture/mqtt-protocol.md`. No confundir los topicos MQTT
  (FPGA -> backend) con estos, que son backend -> navegador.
- `realtime.samples` — nuevas muestras mientras el reactor opera.

Ambos definidos en `apps/backend/app/websocket/events.py` (backend) y
deben reflejarse en `apps/frontend/src/services/websocket/topics.ts`
(frontend). Mantener ambos archivos sincronizados manualmente por ahora;
si el contrato crece, evaluar generarlo desde un esquema compartido
(ver "packages/" en la explicacion de la estructura).

Los canales son de **solo bajada**: el servidor publica y el cliente escucha.
Lo que mande el cliente se descarta.

## Autenticacion

Todo WebSocket exige la misma sesion que REST: el **access token** JWT. El
porque de cada decision esta en `docs/decisions/0005-autenticacion-websocket.md`.

### Como viaja el token

Por **uno solo** de estos medios (RFC 6750):

| Medio | Para quien | Ejemplo |
|---|---|---|
| Query param `access_token` | Navegador (la API `WebSocket` no admite headers) | `new WebSocket(\`${base}/api/v1/reactor-state/ws?access_token=${token}\`)` |
| Header `Authorization: Bearer` | Clientes que pueden mandar headers (scripts, tests) | `Authorization: Bearer eyJ...` |

Mandarlo por los dos medios a la vez, o repetir el query param, se rechaza.
Un refresh token no sirve.

El token se valida **antes** de suscribir al cliente: una conexion rechazada
no recibe ningun dato, solo el cierre.

### Codigos de cierre

| Codigo | Significado | Que hace el cliente |
|---|---|---|
| `1008` | Falta el token, es invalido o es un refresh | No reintentar: volver al login |
| `4401` | El token vencio (en el handshake o con la conexion abierta) | Renovar con `POST /auth/refresh` y reconectar con el token nuevo |
| `1013` | El cliente no consumia los mensajes a tiempo | Reconectar con backoff |
| `1006` | Corte sin cierre (red, servidor caido) | Reconectar con backoff |

El motivo (`reason`) acompana al codigo como texto para humanos; el cliente
decide solo por el codigo. Definidos en `WSCloseCode`
(`app/websocket/events.py`) y `WS_CLOSE_CODES` (`topics.ts`).

**Vencimiento con la conexion abierta.** El servidor cierra con `4401` en el
instante en que vence el access token con el que se abrio la conexion. Es el
equivalente al 401 que REST devolveria en la siguiente request.

### Logs

El token en la URL se enmascara en los logs de uvicorn
(`access_token=[REDACTED]`, ver `app/config/logging.py`). Un proxy delante
del backend tiene que hacer lo mismo en su propio log.

## Tipos de evento

`sample`, `state_changed`, `error` — ver `WSEventType` en el backend.

**Pendiente:** definir el payload exacto de cada evento (por ahora solo
el nombre/topico esta reservado).

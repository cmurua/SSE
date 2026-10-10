# Contrato de WebSocket

## Topicos

| Topico | Endpoint | Que publica |
|---|---|---|
| `reactor.state` | `/api/v1/reactor-state/ws` | Cambios de estado SERMO/operacion |
| `realtime.samples` | `/api/v1/realtime/ws` | Nuevas muestras mientras el reactor opera (tarea 3.2) |

El origen de `reactor.state` es la senal MQTT de la FPGA, no la base: ver
`docs/architecture/mqtt-protocol.md`. No confundir los topicos MQTT
(FPGA -> backend) con estos, que son backend -> navegador.

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

## Eventos

### Sobre comun

Todo mensaje del servidor es un objeto JSON con dos campos:

```json
{ "type": "<tipo de evento>", "data": { ... } }
```

`type` dice como interpretar `data`: el cliente despacha por ese campo y no
por la forma del contenido. Los tipos estan en `WSEventType`
(`app/websocket/events.py`) y `WS_EVENT_TYPES` (`topics.ts`); el sobre lo
arma `build_event()` en el mismo archivo del backend.

| Tipo | Topico | Estado |
|---|---|---|
| `state_changed` | `reactor.state` | Definido (abajo) |
| `sample` | `realtime.samples` | Reservado: lo define la tarea 3.2 |
| `error` | — | Reservado, sin uso todavia |

### `state_changed` (topico `reactor.state`)

Estado completo del reactor. Mismo schema que la respuesta de
`GET /api/v1/reactor-state` (`ReactorState` en
`app/domains/reactor_state/schemas.py`):

```json
{
  "type": "state_changed",
  "data": {
    "sermo": true,
    "status": "OPERACION",
    "updated_at": "2026-10-10T14:03:27.512000Z",
    "operation_id": "OP-2026-014",
    "source_connected": true
  }
}
```

| Campo | Tipo | Significado |
|---|---|---|
| `sermo` | `boolean` | Ultimo valor conocido de la senal SERMO: `true` = el reactor opera |
| `status` | `"OPERACION"` \| `"DETENIDO"` | `sermo` como se muestra. Siempre coincide con `sermo` |
| `updated_at` | `string` (ISO 8601, UTC) | Cuando cambio `sermo` por ultima vez: el timestamp que publico la FPGA si lo trajo, o el momento en que se recibio. Antes del primer cambio, la hora de arranque del backend. Un cambio de `source_connected` no lo mueve |
| `operation_id` | `string` \| `null` | Operacion en curso. `null` siempre que `sermo` sea `false` |
| `source_connected` | `boolean` | Si el backend esta recibiendo la senal. `false` = "no se sabe si el reactor opera", que **no** es "detenido": `sermo` conserva el ultimo valor conocido |

**Cuando se envia:**

1. **Al conectarse**, como primer mensaje, con el estado actual. El cliente
   no tiene que esperar a que el reactor arranque o se detenga para saber en
   que estado esta, ni combinarlo con el GET.
2. **En cada cambio** de `sermo` (arranque o detencion del reactor) y de
   `source_connected` (el backend pierde o recupera el broker MQTT). Lo
   reciben todos los clientes conectados, el mismo mensaje.

Un SERMO repetido (reentrega del broker, mensaje retenido al reconectar) no
es un cambio y no se publica.

**Como interpretarlo.** Cada evento trae el estado **completo**, no la
diferencia con el anterior: el cliente reemplaza lo que tenia por `data`.
Por eso no importa recibir dos veces el mismo estado, cosa que puede pasar
justo al conectarse si coincide con un cambio. Lo que el servidor si
garantiza es no perder un cambio entre el estado inicial y el primer evento.

Si la conexion se cae, el cliente reconecta (ver codigos de cierre) y el
primer mensaje de la nueva conexion lo pone al dia: no hace falta consultar
el GET para rellenar el hueco.

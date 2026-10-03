# ADR 0005 — Autenticacion de los WebSocket con el access token

## Estado
Aceptado. Cierra la tarea 2.3 y habilita los WebSocket de los Milestones 2
y 3 (`reactor.state`, `realtime.samples`).

## Contexto
Los endpoints REST exigen sesion con `get_current_user()` (tarea 1.6), que
lee el access token del header `Authorization: Bearer`. Los WebSocket tienen
que exigir la misma sesion, pero tres particularidades impiden copiar ese
mecanismo:

1. **El navegador no puede mandar headers en el handshake.** La API
   `WebSocket` de JS solo acepta la URL y una lista de subprotocolos.
2. **Un rechazo antes de aceptar no le llega al navegador.** Si el servidor
   cierra sin haber aceptado, uvicorn responde HTTP 403 y el navegador solo
   ve un cierre 1006, igual que si el servidor estuviera caido. Verificado
   con las versiones del proyecto (FastAPI 0.142, Starlette 1.7, uvicorn).
3. **Un WebSocket dura horas; el access token, 15 minutos.** REST revalida en
   cada request, un WebSocket una sola vez.

## Decision

**El access token viaja en el handshake, se valida antes de suscribir al
cliente, y su vencimiento cierra la conexion.**

1. **Medio de transporte (RFC 6750).** Se acepta por header
   `Authorization: Bearer <token>` (seccion 2.1), para clientes que pueden
   mandarlo, o por el query param `access_token` (seccion 2.3, nombre fijado
   por el RFC), que es lo que usa el navegador. Mandarlo por los dos medios
   a la vez se rechaza (seccion 2: el cliente NO DEBE usar mas de uno).
2. **Validacion.** `get_current_user_ws()` (`app/websocket/dependencies.py`)
   usa el mismo `decode_access_token()` que REST y devuelve la misma
   `AuthenticatedUser`. Si falla, el endpoint no se ejecuta.
3. **Rechazo con codigo.** La dependency lanza `WebSocketException`. El
   handler global (`app/core/exceptions.py`) acepta y cierra en el acto, para
   que el codigo llegue al cliente. El cliente no recibe ningun dato: no hay
   endpoint ejecutado ni suscripcion.
4. **Codigos de cierre** (`WSCloseCode` en `app/websocket/events.py`):
   - `1008` Policy Violation (RFC 6455): falta el token, es invalido o es un
     refresh. No se reintenta.
   - `4401` (rango privado de RFC 6455; analogo a HTTP 401, misma convencion
     que graphql-ws): el token vencio. Se renueva y se reconecta.
5. **Vencimiento en vivo.** Mientras la conexion siga abierta, la dependency
   programa un cierre `4401` para el instante del `exp`. `decode_token()`
   pasa a exigir el claim `exp`: un token sin vencimiento seria eterno.
6. **Logs.** El token en la URL apareceria en el log de uvicorn en cada
   handshake. `app/config/logging.py` lo enmascara (`access_token=[REDACTED]`).

### Por que no las otras opciones

**Token en el primer mensaje.** Obliga a aceptar la conexion antes de saber
quien es el cliente: entre el accept y el mensaje hay un socket abierto sin
autenticar, y cada endpoint tiene que acordarse de no suscribirlo antes de
validar. La tarea pide validar antes de aceptar.

**Subprotocolo (`Sec-WebSocket-Protocol: bearer, <token>`).** Evita la URL,
pero usa un header de negociacion de protocolo para otra cosa, obliga al
servidor a devolver el subprotocolo al aceptar (si no, el navegador corta) y
ningun estandar lo define. El query param esta definido por RFC 6750, y su
desventaja -- que la URL se loguea -- se resuelve con el filtro de logs y
queda acotada por la vida corta del access token.

**Cookie de sesion.** Requeriria cambiar el modelo de autenticacion entero:
el frontend guarda el access token en memoria a proposito
(`services/api/httpClient.ts`). Ademas abriria la puerta a Cross-Site
WebSocket Hijacking, porque el navegador manda las cookies en el handshake
desde cualquier origen.

**Rechazar con HTTP 401 en el handshake** (extension Websocket Denial
Response de ASGI). Es lo mas fiel a RFC 6750, pero el navegador no expone el
status de un handshake fallido: el frontend veria 1006 igual.

## Consecuencias

- Todo WebSocket se protege con una anotacion, `user: CurrentUserWS`, y se
  atiende con `manager.serve(topic, websocket)`, que garantiza la
  desuscripcion aunque el cliente se corte de golpe.
- Si se agrega un reverse proxy delante del backend (`infra/nginx/`, hoy
  reservado), tambien loguea URLs y tiene que enmascarar `access_token` en su
  propio formato de log.
- El frontend tiene que distinguir `4401` (renovar y reconectar) de `1008`
  (volver al login) y de `1013` (cliente lento: reconectar con backoff).

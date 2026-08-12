# Contrato de WebSocket (borrador)

## Topicos

- `reactor.state` — cambios de estado SERMO/operacion.
- `realtime.samples` — nuevas muestras mientras el reactor opera.

Ambos definidos en `apps/backend/app/websocket/events.py` (backend) y
deben reflejarse en `apps/frontend/src/services/websocket/topics.ts`
(frontend). Mantener ambos archivos sincronizados manualmente por ahora;
si el contrato crece, evaluar generarlo desde un esquema compartido
(ver "packages/" en la explicacion de la estructura).

## Tipos de evento

`sample`, `state_changed`, `error` — ver `WSEventType` en el backend.

**Pendiente:** definir el payload exacto de cada evento (por ahora solo
el nombre/topico esta reservado).

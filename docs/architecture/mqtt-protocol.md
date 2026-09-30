# Contrato MQTT — senal SERMO

Contrato entre la **FPGA** (publica) y el **backend** (consume). Cambiar algo
de este documento implica cambiar el firmware, asi que no se toca sin
acordarlo con quien lo programa.

La decision de usar MQTT y el porque de cada parametro estan en
`docs/decisions/0004-representacion-sermo.md`.

## Topico

| | |
|---|---|
| Topico | `ra0/sermo` (configurable: `MQTT_TOPIC_SERMO`) |
| QoS | 1 (at-least-once) |
| Retenido | si (`retain = true`) |
| Publica | la FPGA |
| Consume | el backend (`app/mqtt/client.py`) |

El nombre por defecto esta en `app/mqtt/topics.py`. **No confundir con los
topicos de WebSocket** (`reactor.state`, `realtime.samples`), que son de la
comunicacion backend -> navegador y estan en `websocket-protocol.md`.

Que el mensaje sea **retenido** es parte del contrato, no un detalle: es lo
que permite que un backend recien arrancado sepa si el reactor esta operando
sin esperar a la proxima transicion.

## Payload

Forma completa:

```json
{
  "sermo": true,
  "timestamp": "2026-09-30T15:58:07.793663+00:00",
  "source": "fpga-ra0",
  "operation": {
    "name": "Practica Reactores I",
    "operator": "Dr. R. Perez",
    "notes": "Sesion practica con estudiantes de grado."
  }
}
```

| Campo | Obligatorio | Descripcion |
|---|---|---|
| `sermo` | si | `true` = el reactor opera, `false` = detenido |
| `timestamp` | no | ISO-8601. Sin offset se interpreta UTC. Si falta, el backend usa su reloj |
| `source` | no | Identificador del publicador. Solo informativo |
| `operation` | no | Metadatos del ensayo. Solo se usan cuando `sermo = true` |

### Forma corta

Tambien se acepta un payload de un solo valor, que es lo que suele emitir un
dispositivo embebido:

```
1   true   on   yes     ->  sermo = true
0   false  off  no      ->  sermo = false
```

Sin distincion de mayusculas. No lleva metadatos: la operacion se abre con
nombre generado y operador por defecto.

### Que NO es una senal

- **Payload vacio.** Es como el broker borra un mensaje retenido. Significa
  "no se sabe", no "el reactor esta detenido": se descarta sin cambiar nada.
  Interpretarlo como `false` apagaria el tiempo real sin que nadie lo pida.
- **Cualquier payload no interpretable.** Se registra en el log y se descarta;
  la suscripcion sigue viva, porque cortarla haria perder la proxima
  transicion valida.

## Comportamiento del backend

1. **Idempotente.** Solo actua cuando el valor de `sermo` cambia. Un mensaje
   repetido (reentrega de QoS 1, o el retenido al reconectar) no abre una
   operacion nueva.
2. **`sermo: true`** -> abre una fila en `operations` (`ended_at = NULL`) y
   arranca la toma de datos a 1 Hz sobre `reactor_samples`.
3. **`sermo: false`** -> detiene la toma de datos y despues cierra la
   operacion, en ese orden.
4. **Sin conexion al broker** -> conserva el ultimo valor conocido y lo marca
   como no confiable (`source_connected: false`). No detiene la toma de datos:
   perder el broker no significa que el reactor se haya detenido.
5. **Reconexion** con backoff exponencial de 1 s a 30 s.

## Configuracion

Todo en `apps/backend/.env` (ver `.env.example`):

```
MQTT_ENABLED=true          # false levanta el backend sin ingesta
MQTT_HOST=mqtt
MQTT_PORT=1883
MQTT_TOPIC_SERMO=ra0/sermo
MQTT_QOS=1
MQTT_CLIENT_ID=sse-backend # debe ser unico por cliente
# MQTT_USERNAME= / MQTT_PASSWORD=   (el broker de desarrollo es anonimo)
```

## Probarlo sin la FPGA

`scripts/mqtt/fpga.py` publica en el mismo topico con el mismo contrato:

```
docker compose exec backend python /scripts/mqtt/fpga.py start
docker compose exec backend python /scripts/mqtt/fpga.py status
docker compose exec backend python /scripts/mqtt/fpga.py stop
docker compose exec backend python /scripts/mqtt/fpga.py --format short start
```

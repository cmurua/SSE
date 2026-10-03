# ADR 0006 — Deteccion de cambios de SERMO y lectura de tiempo real sin consultar Postgres

## Estado
Aceptado. Cierra la tarea 2.4. La reutilizan la tarea 2.5 (WebSocket
`reactor.state`) y la 3.2 (WebSocket `realtime.samples`).

## Contexto
La tarea 2.4 se escribio cuando SERMO iba a salir de la base, y planteaba
elegir entre **polling periodico a Postgres** y **`LISTEN`/`NOTIFY`** para
detectar las transiciones. Despues el ADR 0004 definio que SERMO llega por
**MQTT desde una FPGA** y que la base es su proyeccion, no su origen. La
pregunta original cambio de forma, y hay que contestarla para dos flujos
distintos:

1. **Transiciones de SERMO** (arranque y parada del reactor): pocas por dia,
   tienen que llegar a todos los clientes. Las consume la 2.5.
2. **Muestras del reactor**: 1 por segundo mientras se opera, con unas 34
   variables cada una. Las consume la 3.2.

Requisitos con los que se evaluo:

- **RNF01: latencia de 2 s o menos** entre el evento y la pantalla.
- **Unos 100 usuarios concurrentes** (la SRS original menciona 40).
- **Un solo proceso de backend** (ADR 0004, pendiente 5). La toma de datos,
  el estado de SERMO y los WebSocket viven en el mismo event loop.

## Opciones evaluadas

| | Polling a Postgres | `LISTEN`/`NOTIFY` | Push dentro del proceso (elegida) |
|---|---|---|---|
| Latencia | Hasta un intervalo mas la consulta. Para cumplir 2 s, con margen para la red y el render, hace falta un intervalo de 1 s o menos. | Milisegundos: se entrega al confirmar la transaccion. | Milisegundos. Medido: 30-90 ms para aplicar una transicion de SERMO (ver Verificacion). |
| Carga con 100 usuarios | Con una consulta por cliente: unas 100 consultas por segundo. Con un poller compartido: 1 por segundo, pero se paga aunque no cambie nada. | Una conexion dedicada y un aviso por evento, sin importar cuantos clientes haya. | Ninguna consulta extra. El reparto a los clientes lo hace `websocket.manager`, que serializa una vez por evento y envia en paralelo. |
| Que lee | La proyeccion que escribio este mismo proceso un instante antes: es circular. | Lo mismo, avisado por la base. | El dato en el momento en que se produce. |
| Reconexion | Natural: la proxima consulta reintenta. | Hay que programarla. Lo que se notifica durante el corte **se pierde**, porque `NOTIFY` no persiste, asi que tras reconectar hace falta una consulta para resincronizar. | MQTT: la reconexion con backoff ya existe y el mensaje retenido resincroniza solo (ADR 0004). Base: ver "Caida de la base". |
| Complejidad | Baja. | Media-alta: conexion fuera del pool, driver asincronico o un thread dedicado, payload de 8000 bytes como maximo. | Baja: listeners en dos servicios que ya existen. |
| Limite | Ninguno de procesos. | Funciona entre procesos. | **Un solo proceso.** |

## Decision

**Ningun flujo de tiempo real se lee de Postgres. Las transiciones de SERMO
llegan por push MQTT y las muestras se publican dentro del mismo proceso
apenas se guardan. Postgres queda como almacenamiento, no como canal.**

1. **SERMO.** La "tarea de fondo que detecta la transicion" que pedia el
   issue es el suscriptor MQTT (`app/mqtt/client.py`), atado al lifespan.
   Cada mensaje entra a `ReactorStateService.on_sermo_changed()`, que solo
   actua en el cambio: un valor repetido (reentrega de QoS 1, retenido al
   reconectar) devuelve False sin tocar la base ni avisar a nadie. Los
   cambios se publican con `register_listener()`, que es donde se engancha la
   2.5.
2. **Muestras.** `AcquisitionService` (`app/domains/reactor_data/acquisition.py`)
   avisa cada muestra a los listeners registrados con `register_listener()`,
   **despues** de guardarla. La 3.2 registra ahi el broadcast a
   `realtime.samples`. Se avisan solo muestras guardadas, asi lo que se ve en
   vivo es lo mismo que despues muestran los historicos de esa operacion, y
   un frontend que se reconecta puede rellenar el hueco desde la base sin ver
   otra serie.
3. **La latencia queda a la vista.** Cada transicion registra en el log
   `SERMO ON/OFF aplicado N ms despues de publicado`, tomando el timestamp
   del mensaje. Es la medicion de deteccion que usa la tarea 3.8. Supone los
   relojes de la FPGA y del servidor sincronizados.

### Por que no polling
Para SERMO seria consultar una fila que escribe este mismo proceso un
instante antes a partir de un evento que ya tiene en memoria: agrega
latencia y carga sin agregar informacion. Para las muestras pasa lo mismo:
el dato esta en memoria antes del INSERT.

### Por que no `LISTEN`/`NOTIFY`
Resuelve un problema que hoy no existe: avisarle a **otro proceso** que algo
cambio en la base. Con un solo proceso, quien escribe y quien avisa son el
mismo, y `NOTIFY` solo agregaria una vuelta por Postgres, una conexion
dedicada y la necesidad de resincronizar tras cada corte.

**Queda como salida** si alguna vez el backend corre con varios workers o la
toma de datos pasa a otro proceso. En ese caso la toma de datos haria
`NOTIFY` dentro de la misma transaccion del INSERT (se entrega solo si se
confirma), y cada worker escucharia y alimentaria a sus propios WebSocket.
Como los consumidores (2.5 y 3.2) dependen de `register_listener()` y no del
mecanismo, el cambio queda dentro de `reactor_data` y `reactor_state`.
Redis pub/sub, mencionado en `overview.md`, es la alternativa si ademas
hiciera falta repartir la carga entre maquinas.

## Caida de la base

El issue pedia "manejar la reconexion si se cae la conexion a la DB". Con
esta decision la base no esta en el camino de la deteccion, pero si en el de
sus consecuencias: abrir y cerrar la operacion, y guardar muestras. Se probo
deteniendo el contenedor de Postgres en medio de un ensayo, y aparecieron
problemas que el codigo anterior no cubria.

**1. Una base caida no lanza error: se cuelga.** El ping del pool quedaba
esperando sobre la conexion muerta hasta que la base volvia, sin ningun
error. Se agregaron timeouts al engine (`app/db/session.py`):
`connect_timeout` de 5 s y `tcp_user_timeout` de 5000 ms. Ahora la caida se
manifiesta como `OperationalError` en segundos, y el pool (`pool_pre_ping`)
se reconecta solo en el proximo intento.

**2. La toma de datos no puede depender de la base.** Con lectura y
escritura en el mismo bucle, el INSERT colgado frenaba el muestreo. Al
volver la base, el bucle recuperaba los ticks atrasados de golpe y guardaba
20 muestras con el mismo timestamp. Ahora:

- Leer y escribir son **dos tareas**. La lectura sigue a 1 Hz pase lo que pase
  con la base.
- Las muestras sin guardar quedan en un **buffer en memoria**, acotado por
  `ACQUISITION_MAX_PENDING_SAMPLES` (3600 = 1 h a 1 Hz). Pasado ese limite se
  descartan las mas viejas, con un error en el log.
- La escritura se reintenta con **backoff** (de 1 s hasta
  `DB_RETRY_MAX_SECONDS`, 10 s) y vuelca todo lo pendiente **en una sola
  transaccion**, en orden. Las muestras se sacan del buffer antes del INSERT
  para que un reintento no pueda duplicarlas.
- Al detener se intenta volcar lo que quede **antes** de cerrar la
  operacion. Sus timestamps son anteriores al `ended_at`, asi que no rompen
  el intervalo de la operacion.
- Si el bucle se atrasa por cualquier motivo, **se saltean los ticks
  perdidos** en vez de leerlos en rafaga.

**3. Una transicion de SERMO no puede perderse.** Antes, si la base fallaba
al abrir o cerrar la operacion, la excepcion subia hasta el suscriptor MQTT,
que se reconectaba al broker para que el retenido trajera la senal de
nuevo. Funcionaba de casualidad, y en el medio le mostraba "sin senal" al
frontend aunque el broker estuviera bien. Ahora `ReactorStateService`:

- deja la transicion **pendiente** y la reintenta con el mismo backoff
  (`DB_RETRY_MIN_SECONDS` / `DB_RETRY_MAX_SECONDS`);
- usa el **instante que publico la FPGA**, no el de la recuperacion, como
  `started_at`/`ended_at`;
- avisa a los listeners recien cuando la transicion se aplica;
- deja que una **senal nueva reemplace a la pendiente**: vale el ultimo valor
  publicado. Un ON y un OFF con la base caida no abren nada;
- si llega un ON mientras un OFF esperaba a la base, **retoma la toma de
  datos** sobre la operacion que sigue abierta. El OFF ya la habia cortado, y
  si el ON se ignorara por idempotencia el ensayo quedaria sin muestras.

## Verificacion

Con `docker compose` (backend, Postgres, Mosquitto) y `scripts/mqtt/fpga.py`:

- **Criterio de aceptacion (deteccion de 2 s o menos):** en 6 ciclos de
  `start`/`stop`, cada transicion se aplico entre 30 y 90 ms despues de
  publicada. Esa cifra incluye abrir o cerrar la operacion en la base y
  arrancar o detener la toma de datos. El peor caso registrado fue de 198 ms:
  un OFF que ademas tuvo que volcar 30 muestras acumuladas durante un corte
  de la base.
- **Postgres detenido 15 s en medio de un ensayo:** se guardaron 34 de 34
  muestras, espaciadas entre 0,999 y 1,001 s, sin huecos ni duplicados. No
  hubo reconexiones MQTT.
- **SERMO ON publicado con Postgres caido:** la operacion se abrio 2,5 s
  despues de que volvio la base, con el `started_at` exacto del mensaje.
- Tests unitarios: `tests/domains/reactor_state/test_service.py` y
  `tests/domains/reactor_data/test_acquisition.py`.

Falta medir la latencia de punta a punta hasta el navegador. Eso queda para
la tarea 3.8, cuando existan los WebSocket de la 2.5 y la 3.2.

## Consecuencias

- **Un solo worker es ahora una condicion del diseno**, no solo del MVP: el
  estado de SERMO y el aviso de muestras viven en memoria del proceso. Pasar
  a varios workers obliga a la salida con `LISTEN`/`NOTIFY` descrita arriba.
- La 2.5 y la 3.2 no consultan la base para el tiempo real: registran un
  listener. La carga de la base no crece con la cantidad de usuarios
  conectados.
- Si la base se cae, el tiempo real se congela, porque solo se publican
  muestras guardadas. Las muestras no se pierden, y al volver llegan en
  orden y en rafaga. El frontend (3.3) tiene que tolerar recibir varias
  muestras juntas.
- Los timeouts del engine aplican a toda la app: un endpoint REST con la base
  caida falla en segundos en vez de quedar colgado.
- Configuracion nueva: `ACQUISITION_MAX_PENDING_SAMPLES`,
  `DB_RETRY_MIN_SECONDS`, `DB_RETRY_MAX_SECONDS`.

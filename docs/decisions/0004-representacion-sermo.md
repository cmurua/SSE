# ADR 0004 — La senal SERMO llega por MQTT desde una FPGA

## Estado
Aceptado. Cierra la tarea 2.1 y desbloquea el resto del Milestone 2.

## Contexto
El RF04 hace que el modulo de tiempo real este disponible solo mientras el
reactor opera. Para implementarlo hacia falta una definicion que no existia:
de donde sale la senal SERMO en el MVP.

Cuando se escribio la tarea 2.1 el SSO real no estaba disponible y se
plantearon tres opciones (derivarla de la base, una tabla de estado dedicada
que el SSO escribiria, o una senal externa simulada). Desde entonces se
definio la arquitectura real del lado del reactor:

- Una **FPGA** detecta el inicio y el fin de la operacion.
- La FPGA **publica un mensaje MQTT** a un broker.
- Al recibirlo, arranca la **toma de datos** desde la PC principal del reactor
  hacia la PC donde esta hosteado este servidor.

Es decir, la senal es un evento externo que el backend recibe, no un dato que
el backend tenga que ir a buscar.

## Decision

**SERMO es una senal externa que llega por MQTT. La base de datos no es su
origen sino su proyeccion.**

1. El backend se suscribe al topico `ra0/sermo` del broker
   (`app/mqtt/client.py`). El contrato del mensaje esta en
   `docs/architecture/mqtt-protocol.md`.
2. `ReactorStateService` (`app/domains/reactor_state/service.py`) es el unico
   que interpreta esa senal, y el unico que abre y cierra filas en
   `operations`. Mantiene el estado **en memoria**: un `GET /reactor-state` se
   responde sin tocar la base.
3. Al pasar a SERMO = true abre la operacion y arranca la toma de datos; al
   pasar a false la detiene y cierra la operacion.
4. La toma de datos (`app/domains/reactor_data/acquisition.py`) lee de un
   puerto `SampleSource` con dos adaptadores: `simulated` (desarrollo) y
   `main_pc` (reservado, sin implementar).

### Por que no las otras opciones

**Opcion 1 — derivarlo de `operations.ended_at IS NULL`.** Quedaba sin
respuesta quien escribe esa fila. Con la FPGA definida, la fila abierta es la
*consecuencia* de la senal, no su causa. Se mantiene la tabla igual, pero
consultarla para saber si el reactor opera agrega latencia y una consulta por
request sin agregar certeza, porque quien la escribe es el mismo proceso que
responde.

**Opcion 2 — tabla de estado dedicada escrita por el SSO.** Obligaria a la
FPGA a hablar SQL y a tener credenciales de la base. Un dispositivo embebido
publicando en un broker es el patron habitual y el que efectivamente se
eligio del lado del reactor.

**Opcion 3 — senal externa simulada.** Es lo que termino siendo, salvo que no
es simulada: es real. La simulacion queda como herramienta de desarrollo
(`scripts/mqtt/fpga.py`), publicando en el mismo topico que la FPGA real.

## Decisiones derivadas

**QoS 1 y mensaje retenido.** QoS 0 perderia una transicion ante un corte de
red y el sistema quedaria mostrando "detenido" durante un ensayo; QoS 2 agrega
handshakes que no hacen falta porque el consumidor es idempotente. El mensaje
va **retenido** para que un backend que arranca despues de la transicion
reciba el ultimo valor conocido apenas se suscribe, en vez de quedar ciego
hasta la proxima. Por eso el broker necesita persistencia
(`infra/mosquitto/mosquitto.conf`): sin ella, reiniciarlo borra el retenido.

**Idempotencia.** QoS 1 permite reentregas y el retenido vuelve a llegar en
cada reconexion. `on_sermo_changed()` solo actua cuando el valor **cambia**;
sin eso, cada reentrega partiria el historico en operaciones nuevas.

**Payload tolerante.** La forma exacta del mensaje no esta confirmada con
quien programa la FPGA. El parser acepta el JSON documentado y tambien un
payload minimo (`"1"` / `"0"` / `"on"` / `"off"`), que es lo que suele emitir
un embebido. Aceptar ambas hoy evita que un desacuerdo de formato bloquee el
desarrollo; cuando el contrato se confirme se puede restringir.

**Perder el broker no es "reactor detenido".** Sin conexion el backend no sabe
si el reactor opera. Conserva el ultimo valor y expone `source_connected:
false` para que el frontend pueda mostrar su tercer estado (issues 2.6 y 2.7).
La toma de datos **no** se corta: el reactor sigue operando aunque el broker
se haya caido.

**Una sola operacion abierta, garantizado por la base.** Antes era una
convencion que respetaba el simulador. Ahora que las operaciones se abren
solas, es una invariante: con dos abiertas, "cual es la operacion en curso"
deja de tener respuesta. Se agrego un indice unico parcial
(migracion `a1c3f7d2e910`), porque hay mas de un escritor posible.

**Reinicio del backend en medio de un ensayo.** Al arrancar se cierra la
operacion que haya quedado abierta, y el retenido de SERMO abre una nueva. Un
ensayo atravesado por un reinicio queda partido en dos operaciones
historicas. Se acepta: el hueco de muestras existio de verdad y asi queda
visible. Se descarto retomar la misma operacion porque obliga a decidir que
hacer con el hueco y a sostener un estado "esperando confirmacion" con
temporizador, complejidad que el MVP no justifica.

**Orden al detener.** Primero se corta la toma de datos, despues se cierra la
operacion. Al reves, el bucle podria escribir una muestra con timestamp
posterior al `ended_at`, y una muestra fuera del intervalo de su propia
operacion rompe las consultas de RF05/RF06.

**La ingesta no puede tumbar la API.** Un error en la toma de datos, un
payload invalido o una base sin migrar quedan registrados y el backend sigue
levantado: el login y los historicos no tienen por que caerse porque la
ingesta falle.

## Consecuencias

- Aparece una dependencia de infraestructura nueva: el broker MQTT. En
  desarrollo lo levanta `docker-compose` (servicio `mqtt`); en el reactor hay
  que acordar host, credenciales y TLS.
- Nueva dependencia de Python: `aiomqtt`.
- `scripts/db/simulator.py` **dejo de existir**. Lo reemplaza
  `scripts/mqtt/fpga.py`, que publica la senal en vez de escribir la base. Es
  a proposito: el camino que se prueba en desarrollo es el mismo que va a
  correr en el reactor, en vez de uno paralelo que saltea el modulo a validar.
  El generador de valores se mudo al backend
  (`app/domains/reactor_data/sources/simulated.py`) y lo reutiliza `seed.py`.
- `docs/architecture/data-model.md` y `overview.md` quedan actualizados: la
  tarea 2.1 ya no figura como pendiente.

## Pendiente de confirmar

1. **Formato real del mensaje** que publica la FPGA, y el nombre definitivo
   del topico. Hoy se acepta un superconjunto de lo probable.
2. **Como se nombra una operacion.** La FPGA senaliza que el reactor opera,
   pero no sabe como se llama el ensayo ni quien lo conduce. El sistema es de
   solo lectura, asi que hoy ningun usuario puede completarlo: las operaciones
   se abren con un nombre generado (`Operacion <fecha> <hora>`) y operador
   `Desconocido`. Hay que definir de donde sale ese dato — otro publicador,
   una pantalla de carga, o aceptarlo como esta.
3. **Protocolo de la PC principal** para la toma de datos: direccion, formato,
   y si el backend consulta (pull, que es lo que asume el puerto hoy) o la PC
   emite (push). Ver `app/domains/reactor_data/sources/main_pc.py`.
4. **Seguridad del broker.** El de desarrollo acepta conexiones anonimas en
   claro. En el reactor hacen falta credenciales y TLS; `Settings` ya tiene
   `MQTT_USERNAME` / `MQTT_PASSWORD` previstos.
5. **Un solo proceso de backend.** El estado de SERMO vive en memoria del
   proceso. Con varios workers de uvicorn, cada uno tendria su propia copia y
   su propia toma de datos escribiendo las mismas muestras. El MVP corre con
   un worker; si eso cambia, hace falta coordinacion externa (ver la tarea
   2.4, que decide el mecanismo de tiempo real, y la nota sobre Redis en
   `overview.md`).

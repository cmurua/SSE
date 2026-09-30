# Backend — SSE RA-0 (FastAPI)

## Desarrollo local

```
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
cp .env.example .env
uvicorn app.main:app --reload
```

## Migraciones

```
alembic upgrade head        # aplica el esquema
alembic downgrade -1        # revierte la ultima migracion
alembic revision --autogenerate -m "descripcion"
```

`migrations/env.py` toma la URL de `Settings.database_url` (variable
`DATABASE_URL`), no de `alembic.ini`, e importa todos los modelos de dominio
antes del autogenerate. Al agregar un modelo nuevo alcanza con dejarlo en
`app/domains/<dominio>/models.py`: se descubre solo.

## Senal SERMO y toma de datos

El estado de operacion del reactor **no** se deriva de la base: llega como
mensaje MQTT publicado por una FPGA. Al recibirlo, el backend abre la
operacion y arranca la toma de datos (ver
`docs/decisions/0004-representacion-sermo.md` y el contrato en
`docs/architecture/mqtt-protocol.md`).

Las piezas:

| | |
|---|---|
| `app/mqtt/` | Suscripcion al broker y parseo del payload |
| `app/domains/reactor_state/` | Interpreta la senal; unico que abre/cierra operaciones |
| `app/domains/reactor_data/acquisition.py` | Bucle que escribe `reactor_samples` a 1 Hz |
| `app/domains/reactor_data/sources/` | De donde salen las muestras (simulada / PC principal) |
| `app/composition.py` | Arma todo; se engancha al lifespan de FastAPI |

`MQTT_ENABLED=false` levanta el backend sin ingesta, para trabajar contra
datos ya cargados con `seed.py` sin necesitar un broker.

## Herramientas de desarrollo (`scripts/`)

Emulan las partes del reactor que son externas al proyecto. Sin ellas no hay
datos para probar RF04 (tiempo real) ni RF05 (graficos).

Viven en `scripts/` (raiz del repo) pero necesitan importar `app`, asi que se
ejecutan **dentro del contenedor del backend**, que las ve montadas en
`/scripts`.

### FPGA simulada (`scripts/mqtt/fpga.py`)

```
docker compose exec backend python /scripts/mqtt/fpga.py start
docker compose exec backend python /scripts/mqtt/fpga.py status
docker compose exec backend python /scripts/mqtt/fpga.py stop
```

`start` publica SERMO = true en el topico `ra0/sermo`; el **backend** es el
que abre la operacion y arranca la toma de datos al recibirlo. `stop` publica
false y el backend detiene la toma y cierra la operacion. Opciones utiles:
`--name`, `--operator`, `--notes` en `start`, y `--format short` para publicar
el payload minimo (`1`/`0`) en vez del JSON completo.

`status` muestra las dos caras: el mensaje retenido que hay en el broker y lo
que hizo el backend en la base. Que no coincidan es el sintoma de que el
backend no esta recibiendo la senal.

Este script **no escribe en la base**. Antes existia `scripts/db/simulator.py`
que abria la operacion e insertaba las muestras el mismo; se reemplazo a
proposito, para que el camino que se prueba en desarrollo sea el mismo que va
a correr en el reactor y no uno paralelo que saltea el modulo a validar.

Consecuencias practicas:

- El backend tiene que estar levantado para que `start` haga algo. Si no lo
  esta, el mensaje queda **retenido** en el broker y el backend lo recibe
  apenas arranca — que es exactamente lo que pasaria si se reiniciara el
  servidor durante un ensayo.
- Reiniciar el backend con una operacion en curso la parte en dos: la anterior
  se cierra al arrancar y el retenido abre una nueva. Es intencional, ver
  ADR 0004.
- Solo puede haber una operacion abierta a la vez, garantizado por un indice
  unico parcial en `operations`.

Los valores no son ruido aleatorio: son una superposicion de senoidales sobre
el valor nominal de cada variable (port de `generateSeries()` del prototipo de
frontend), acotada al rango `min`/`max` del catalogo. Eso da curvas suaves,
donde cada muestra se parece a la anterior, que es lo que necesitan los
graficos de RF05. Es determinista: la misma operacion genera siempre la misma
serie. El generador vive en
`app/domains/reactor_data/sources/simulated.py` y lo reutiliza el seed, para
que un historico y una operacion en vivo tengan la misma forma.

### Datos historicos de arranque

```
docker compose exec backend python /scripts/db/seed.py
docker compose exec backend python /scripts/db/seed.py --operations 3
docker compose exec backend python /scripts/db/seed.py --reset
```

Carga operaciones ya **cerradas** (no afectan al estado del reactor) con sus
muestras a 1 Hz, para que las pantallas de historicos no arranquen vacias.
Por defecto son 5 operaciones, unas 43.000 muestras en total; `--interval`
sube el espaciado entre muestras si se quieren menos filas. `--reset` **borra
todas** las operaciones y muestras antes de cargar.

### Espera de disponibilidad de Postgres

```
docker compose exec backend python /scripts/db/wait_for_db.py --timeout 60
```

Bloquea hasta que la base responda un `select 1`, o sale con codigo 1 al
agotarse el plazo. Util antes de correr migraciones en CI o desde un venv
local, donde no aplica el healthcheck de Compose.

## Tests

```
pytest
```

Ver la organizacion por dominios en `app/domains/`. Cada dominio agrupa
router, service, schemas, models y repository — no hay carpetas
transversales `controllers/`, `services/`, `models/` a nivel raiz.

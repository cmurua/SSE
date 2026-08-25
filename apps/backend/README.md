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

## Herramientas de desarrollo (`scripts/db/`)

Emulan al SSO, que es el sistema que en el reactor real publica las muestras.
Sin ellas no hay datos para probar RF04 (tiempo real) ni RF05 (graficos).

Viven en `scripts/` (raiz del repo) pero necesitan importar `app`, asi que se
ejecutan **dentro del contenedor del backend**, que las ve montadas en
`/scripts`.

### Simulador de operacion

```
docker compose exec backend python /scripts/db/simulator.py start
docker compose exec backend python /scripts/db/simulator.py status
docker compose exec backend python /scripts/db/simulator.py stop
```

`start` crea una operacion abierta y queda en primer plano insertando una
muestra por segundo en `reactor_samples`, con las 33 variables del catalogo.
Opciones utiles: `--name`, `--operator`, `--interval` (segundos entre
muestras) y `--max-samples N` para que corte solo.

`stop` cierra la operacion abierta, desde otra terminal. El bucle lo detecta
y termina por su cuenta.

Cortar `start` con Ctrl-C detiene la insercion pero **no** cierra la
operacion: abierto/cerrado es estado de la operacion, no del proceso, igual
que en el sistema real. Queda abierta hasta que corras `stop`.

Solo puede haber una operacion abierta a la vez — el estado del reactor se
deriva de `ended_at IS NULL`, asi que dos abiertas lo volverian ambiguo.

Los valores no son ruido aleatorio: son una superposicion de senoidales sobre
el valor nominal de cada variable (port de `generateSeries()` del prototipo de
frontend), acotada al rango `min`/`max` del catalogo. Eso da curvas suaves,
donde cada muestra se parece a la anterior, que es lo que necesitan los
graficos de RF05. Es determinista: la misma operacion genera siempre la misma
serie.

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

# Bucle de toma de datos. Lo que importa verificar es que escribe con la
# operacion correcta, que se detiene de verdad (una muestra escrita despues
# del cierre quedaria fuera del intervalo de su propia operacion), que un
# error de la fuente no tumba el proceso y que un corte de la base no hace
# perder muestras (ADR 0006).
import asyncio
import threading
from datetime import UTC, datetime

from sqlalchemy.exc import OperationalError

from app.domains.reactor_data.acquisition import AcquisitionService
from app.domains.reactor_data.sources.base import SampleSource
from app.domains.reactor_data.sources.simulated import SimulatedSampleSource
from app.domains.reactor_data.variable_catalog import REACTOR_VARIABLES, sample_column

INTERVAL = 0.01


class FakeSampleRepository:
    def __init__(self):
        self.rows = []
        # Simula la base caida: cada insert_many falla mientras sea True.
        self.down = False
        self.failed_inserts = 0

    def insert_many(self, operation_id, rows):
        if self.down:
            self.failed_inserts += 1
            raise OperationalError("INSERT", {}, ConnectionRefusedError("base caida"))
        self.rows.extend((operation_id, timestamp, values) for timestamp, values in rows)


class CountingSource(SampleSource):
    def __init__(self):
        self.opened = []
        self.closed = 0
        self.reads = []

    async def open(self, operation_id, started_at):
        self.opened.append(operation_id)

    async def read(self, elapsed_seconds):
        self.reads.append(elapsed_seconds)
        # El valor identifica la muestra, para poder verificar orden y
        # duplicados despues de un corte de la base.
        return {"potm4": float(len(self.reads))}

    async def close(self):
        self.closed += 1


class FailingSource(SampleSource):
    async def read(self, elapsed_seconds):
        raise RuntimeError("la PC principal no responde")


def build(source=None, repository=None, **options):
    source = source or CountingSource()
    repository = repository or FakeSampleRepository()
    service = AcquisitionService(
        source=source,
        repository=repository,
        interval_seconds=INTERVAL,
        retry_max_seconds=INTERVAL * 4,
        **options,
    )
    return service, source, repository


async def wait_for(condition, timeout=2.0):
    """Espera activa breve: el bucle corre en su propia tarea."""
    deadline = asyncio.get_running_loop().time() + timeout
    while asyncio.get_running_loop().time() < deadline:
        if condition():
            return True
        await asyncio.sleep(INTERVAL / 2)
    return False


async def test_escribe_muestras_de_la_operacion_en_curso():
    service, source, repository = build()

    await service.start("OP-2026-001", datetime.now(UTC))
    assert await wait_for(lambda: len(repository.rows) >= 3)
    await service.stop()

    assert source.opened == ["OP-2026-001"]
    assert all(row[0] == "OP-2026-001" for row in repository.rows)
    assert source.closed == 1


async def test_stop_corta_la_escritura():
    # Si siguiera escribiendo despues del stop, la muestra caeria fuera del
    # intervalo de la operacion que se esta cerrando.
    service, _, repository = build()

    await service.start("OP-2026-001", datetime.now(UTC))
    assert await wait_for(lambda: len(repository.rows) >= 2)
    await service.stop()

    escritas = len(repository.rows)
    await asyncio.sleep(INTERVAL * 5)

    assert len(repository.rows) == escritas
    assert service.running is False
    assert service.operation_id is None


async def test_el_tiempo_avanza_con_el_intervalo_no_con_el_indice():
    # `read()` recibe segundos de operacion: asi cambiar el intervalo de
    # muestreo no deforma las series.
    service, source, _ = build()

    await service.start("OP-2026-001", datetime.now(UTC))
    assert await wait_for(lambda: len(source.reads) >= 3)
    await service.stop()

    assert source.reads[:3] == [0.0, INTERVAL, INTERVAL * 2]


async def test_arranque_duplicado_no_abre_un_segundo_bucle():
    service, source, _ = build()

    await service.start("OP-2026-001", datetime.now(UTC))
    await service.start("OP-2026-002", datetime.now(UTC))

    assert source.opened == ["OP-2026-001"]
    assert service.operation_id == "OP-2026-001"
    await service.stop()


async def test_un_error_de_la_fuente_no_tumba_el_proceso():
    # Los historicos y el login tienen que seguir funcionando aunque la toma
    # de datos se caiga.
    service, _, repository = build(source=FailingSource())

    await service.start("OP-2026-001", datetime.now(UTC))
    assert await wait_for(lambda: service.running is False)

    assert repository.rows == []
    await service.stop()


async def test_stop_sin_start_no_falla():
    service, _, _ = build()
    await service.stop()
    assert service.running is False


async def test_la_fuente_simulada_llena_el_catalogo_completo_y_dentro_de_rango():
    source = SimulatedSampleSource()
    values = await source.read(42.0)

    assert set(values) == {sample_column(v["id"]) for v in REACTOR_VARIABLES}
    for variable in REACTOR_VARIABLES:
        value = values[sample_column(variable["id"])]
        assert variable["min"] <= value <= variable["max"], variable["id"]


def stored_values(repository):
    return [row[2]["potm4"] for row in repository.rows]


async def test_los_listeners_reciben_cada_muestra_guardada_en_orden():
    # Es el enganche del WebSocket realtime.samples (issue 3.2).
    service, _, repository = build()
    recibidas = []

    async def listener(sample):
        recibidas.append(sample)

    service.register_listener(listener)
    await service.start("OP-2026-001", datetime.now(UTC))
    assert await wait_for(lambda: len(recibidas) >= 3)
    await service.stop()

    assert all(sample.operation_id == "OP-2026-001" for sample in recibidas)
    # Lo que se ve en vivo es exactamente lo que quedo en la base.
    assert [sample.values["potm4"] for sample in recibidas] == stored_values(repository)


async def test_un_listener_roto_no_corta_el_muestreo():
    service, _, repository = build()

    async def listener_roto(sample):
        raise RuntimeError("socket muerto")

    service.register_listener(listener_roto)
    await service.start("OP-2026-001", datetime.now(UTC))
    assert await wait_for(lambda: len(repository.rows) >= 3)

    assert service.running is True
    await service.stop()


async def test_con_la_base_caida_sigue_leyendo_y_vuelca_al_volver():
    # Un reinicio de Postgres en medio de un ensayo no puede dejar un hueco
    # en el historico ni detener la toma de datos.
    service, source, repository = build()
    repository.down = True
    recibidas = []

    async def listener(sample):
        recibidas.append(sample.values["potm4"])

    service.register_listener(listener)
    await service.start("OP-2026-001", datetime.now(UTC))
    assert await wait_for(lambda: len(source.reads) >= 5)

    assert service.running is True
    assert repository.rows == []
    assert recibidas == []  # nada se avisa en vivo si no quedo guardado
    assert service.pending_samples >= 5

    repository.down = False
    assert await wait_for(lambda: service.pending_samples == 0)
    await service.stop()

    valores = stored_values(repository)
    assert valores == sorted(valores)  # en orden
    assert len(valores) == len(set(valores))  # sin duplicados
    assert valores[0] == 1.0  # empezando por la primera, que se leyo con la base caida
    assert recibidas == valores


async def test_los_reintentos_se_espacian_con_la_base_caida():
    service, source, repository = build()
    repository.down = True

    await service.start("OP-2026-001", datetime.now(UTC))
    assert await wait_for(lambda: len(source.reads) >= 20)
    await service.stop()

    # Una lectura por tick, pero no un intento de escritura por tick. El
    # stop() hace un intento final mas.
    assert repository.failed_inserts < len(source.reads) / 2


async def test_el_buffer_acotado_descarta_las_muestras_mas_viejas():
    service, source, repository = build(max_pending_samples=3)
    repository.down = True

    await service.start("OP-2026-001", datetime.now(UTC))
    assert await wait_for(lambda: len(source.reads) >= 6)
    repository.down = False
    assert await wait_for(lambda: len(repository.rows) > 0)
    await service.stop()

    valores = stored_values(repository)
    assert 1.0 not in valores  # la primera se descarto
    assert valores == sorted(valores)


async def test_stop_vuelca_lo_pendiente_antes_de_que_se_cierre_la_operacion():
    service, source, repository = build()
    repository.down = True

    await service.start("OP-2026-001", datetime.now(UTC))
    assert await wait_for(lambda: len(source.reads) >= 3)
    # La base vuelve justo antes del SERMO OFF, entre dos reintentos.
    repository.down = False
    await service.stop()

    # Sin esperar: cuando stop() devuelve el control ya no queda ningun
    # INSERT en vuelo (la operacion se cierra inmediatamente despues).
    assert len(repository.rows) == len(source.reads)
    assert len(set(stored_values(repository))) == len(source.reads)
    assert service.pending_samples == 0


async def test_stop_con_la_base_todavia_caida_no_falla():
    service, source, repository = build()
    repository.down = True

    await service.start("OP-2026-001", datetime.now(UTC))
    assert await wait_for(lambda: len(source.reads) >= 3)
    await service.stop()

    assert repository.rows == []
    assert service.pending_samples == 0
    assert service.running is False


class HangingSampleRepository(FakeSampleRepository):
    """Base que no falla pero tampoco contesta, hasta que se la suelta.

    Es lo que pasa de verdad al detener el contenedor de Postgres: el INSERT
    queda esperando sobre una conexion muerta en vez de lanzar.
    """

    def __init__(self):
        super().__init__()
        self.released = threading.Event()

    def insert_many(self, operation_id, rows):
        self.released.wait(timeout=5)
        super().insert_many(operation_id, rows)


async def test_una_base_colgada_no_frena_el_muestreo():
    repository = HangingSampleRepository()
    service, source, _ = build(repository=repository)

    await service.start("OP-2026-001", datetime.now(UTC))
    # Con la escritura colgada se sigue leyendo a la cadencia normal.
    assert await wait_for(lambda: len(source.reads) >= 5)
    assert repository.rows == []

    repository.released.set()
    assert await wait_for(lambda: service.pending_samples == 0 and len(repository.rows) >= 5)
    await service.stop()

    timestamps = [row[1] for row in repository.rows]
    # Cada muestra con el instante en que se leyo, no una rafaga al volver.
    assert len(set(timestamps)) == len(timestamps)
    assert timestamps == sorted(timestamps)


class StallingSource(CountingSource):
    """La tercera lectura tarda varios intervalos (fuente o event loop lentos)."""

    async def read(self, elapsed_seconds):
        values = await super().read(elapsed_seconds)
        if len(self.reads) == 3:
            await asyncio.sleep(INTERVAL * 6)
        return values


async def test_si_se_atrasa_saltea_ticks_en_vez_de_leer_en_rafaga():
    service, source, _ = build(source=StallingSource())

    await service.start("OP-2026-001", datetime.now(UTC))
    assert await wait_for(lambda: len(source.reads) >= 5)
    await service.stop()

    # Despues del atraso el tiempo de operacion salta: no se recuperan los
    # ticks perdidos leyendo varias veces seguidas el mismo instante.
    pasos = [round((b - a) / INTERVAL) for a, b in zip(source.reads, source.reads[1:])]
    assert pasos[:2] == [1, 1]
    assert pasos[2] > 1


class SlowFailingRepository(FakeSampleRepository):
    """Falla despues de tardar: mientras tanto el lector sigue encolando.

    Si falla se decide al empezar, como con una base real: un intento lanzado
    contra la base caida falla aunque la base vuelva mientras espera. Si se
    decidiera al final, poner `down = False` en medio de un intento lo haria
    terminar bien, y eso es otro caso (ver
    test_si_la_base_vuelve_en_medio_de_un_volcado_el_hueco_queda_contado).
    """

    def insert_many(self, operation_id, rows):
        if self.down:
            threading.Event().wait(INTERVAL * 4)
            self.failed_inserts += 1
            raise OperationalError("INSERT", {}, ConnectionRefusedError("base caida"))
        super().insert_many(operation_id, rows)


async def test_si_falla_un_volcado_con_el_buffer_lleno_se_descartan_las_mas_viejas():
    repository = SlowFailingRepository()
    repository.down = True
    service, source, _ = build(repository=repository, max_pending_samples=3)

    await service.start("OP-2026-001", datetime.now(UTC))
    assert await wait_for(lambda: len(source.reads) >= 10)
    repository.down = False
    assert await wait_for(lambda: len(repository.rows) > 0)
    await service.stop()

    valores = stored_values(repository)
    # Solo se pierde el principio: lo guardado es un tramo contiguo que llega
    # hasta la ultima lectura. Descartar las mas nuevas dejaria huecos.
    assert valores == [float(n) for n in range(int(valores[0]), len(source.reads) + 1)]
    assert valores[0] > 1.0


class BlockingRepository(FakeSampleRepository):
    """Cada INSERT espera a que el test lo suelte, y avisa cuando empieza.

    Sirve para hacer caer el stop() exactamente en medio de un INSERT, sin
    depender de la suerte del scheduler.
    """

    def __init__(self, *, fail: bool = False):
        super().__init__()
        self.fail = fail
        self.started = threading.Event()
        self.released = threading.Event()

    def insert_many(self, operation_id, rows):
        self.started.set()
        self.released.wait(timeout=5)
        if self.fail:
            self.fail = False  # solo el que estaba en vuelo
            raise OperationalError("INSERT", {}, ConnectionRefusedError("base caida"))
        super().insert_many(operation_id, rows)


async def stop_during_insert(service, repository):
    """Llama a stop() con un INSERT en vuelo y lo suelta recien despues."""
    await asyncio.to_thread(repository.started.wait, 2)
    stopping = asyncio.create_task(service.stop())
    await asyncio.sleep(INTERVAL * 3)
    assert not stopping.done(), "stop() no espero al INSERT en vuelo"
    repository.released.set()
    await asyncio.wait_for(stopping, timeout=2)


async def test_stop_espera_al_insert_en_vuelo():
    # Antes stop() devolvia el control con el INSERT todavia corriendo en su
    # thread: las filas aparecian despues de cerrada la operacion.
    repository = BlockingRepository()
    service, source, _ = build(repository=repository)

    await service.start("OP-2026-001", datetime.now(UTC))
    await stop_during_insert(service, repository)

    assert len(repository.rows) == len(source.reads)
    assert service.samples_written == len(source.reads)


async def test_si_el_insert_en_vuelo_falla_al_detener_se_reintenta():
    # Antes el lote en vuelo se perdia sin aviso: la cancelacion salteaba el
    # codigo que lo devuelve al buffer.
    repository = BlockingRepository(fail=True)
    service, source, _ = build(repository=repository)

    await service.start("OP-2026-001", datetime.now(UTC))
    await stop_during_insert(service, repository)

    assert stored_values(repository) == [float(n) for n in range(1, len(source.reads) + 1)]
    assert service.pending_samples == 0


class RecoveringRepository(FakeSampleRepository):
    """El primer INSERT tarda y termina bien: la base estaba colgada, o
    volvio mientras se intentaba."""

    def __init__(self):
        super().__init__()
        self.slow_once = True

    def insert_many(self, operation_id, rows):
        if self.slow_once:
            self.slow_once = False
            threading.Event().wait(INTERVAL * 6)
        super().insert_many(operation_id, rows)


async def test_si_la_base_vuelve_en_medio_de_un_volcado_el_hueco_queda_contado(caplog):
    """Consecuencia aceptada y documentada en AcquisitionService._enqueue():
    el lote en vuelo ya no se puede descartar, asi que si el buffer se llena
    mientras tanto se pierden muestras posteriores a el. Lo que se exige es
    que no pase en silencio."""
    repository = RecoveringRepository()
    service, source, _ = build(repository=repository, max_pending_samples=2)

    with caplog.at_level("INFO", logger="app.domains.reactor_data.acquisition"):
        await service.start("OP-2026-001", datetime.now(UTC))
        assert await wait_for(lambda: len(repository.rows) > 1)
        await service.stop()

    guardadas = len(repository.rows)
    assert guardadas < len(source.reads)
    assert "descartadas" in caplog.text
    assert f"{len(source.reads) - guardadas} descartadas" in caplog.text

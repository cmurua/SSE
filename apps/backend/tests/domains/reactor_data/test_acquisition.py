# Bucle de toma de datos. Lo que importa verificar es que escribe con la
# operacion correcta, que se detiene de verdad (una muestra escrita despues
# del cierre quedaria fuera del intervalo de su propia operacion) y que un
# error de la fuente no tumba el proceso.
import asyncio
from datetime import UTC, datetime

from app.domains.reactor_data.acquisition import AcquisitionService
from app.domains.reactor_data.sources.base import SampleSource
from app.domains.reactor_data.sources.simulated import SimulatedSampleSource
from app.domains.reactor_data.variable_catalog import REACTOR_VARIABLES, sample_column

INTERVAL = 0.01


class FakeSampleRepository:
    def __init__(self):
        self.rows = []

    def insert(self, operation_id, timestamp, values):
        self.rows.append((operation_id, timestamp, values))


class CountingSource(SampleSource):
    def __init__(self):
        self.opened = []
        self.closed = 0
        self.reads = []

    async def open(self, operation_id, started_at):
        self.opened.append(operation_id)

    async def read(self, elapsed_seconds):
        self.reads.append(elapsed_seconds)
        return {"pot_nuc": 5.0}

    async def close(self):
        self.closed += 1


class FailingSource(SampleSource):
    async def read(self, elapsed_seconds):
        raise RuntimeError("la PC principal no responde")


def build(source=None, repository=None):
    source = source or CountingSource()
    repository = repository or FakeSampleRepository()
    service = AcquisitionService(
        source=source, repository=repository, interval_seconds=INTERVAL
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

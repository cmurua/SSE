# Transiciones de SERMO: es la regla de negocio central del RF04 y el punto
# donde un error se paga caro -- una transicion perdida deja el tiempo real
# apagado durante un ensayo, y una de mas parte el historico en dos.
#
# Los tests no tocan la base ni el broker: el repositorio y la toma de datos
# se reemplazan por dobles. Lo que se verifica aca es la decision, no el IO.
import asyncio
from datetime import UTC, datetime

from sqlalchemy.exc import OperationalError

from app.domains.reactor_state.schemas import ReactorStatus
from app.domains.reactor_state.service import ReactorStateService
from app.mqtt.schemas import SermoSignal


class FakeOperationRepository:
    def __init__(self, open_operation=None):
        self._open = open_operation
        self.opened = []
        self.closed = []
        self._sequence = 0
        # Simula la base caida: abrir y cerrar fallan mientras sea True.
        self.down = False

    def _check(self):
        if self.down:
            raise OperationalError("UPDATE operations", {}, ConnectionRefusedError())

    def find_open(self):
        return self._open

    def open(self, *, name, operator, notes, started_at):
        self._check()
        self._sequence += 1
        self._open = {
            "id": f"OP-TEST-{self._sequence:03d}",
            "name": name,
            "operator": operator,
            "started_at": started_at,
        }
        self.opened.append(dict(self._open))
        return self._open

    def close_open(self, ended_at=None):
        self._check()
        if self._open is None:
            return None
        closed, self._open = self._open, None
        closed["ended_at"] = ended_at
        self.closed.append(closed)
        return closed


class FakeAcquisition:
    def __init__(self):
        self.started = []
        self.stops = 0
        self.running = False

    async def start(self, operation_id, started_at):
        self.started.append(operation_id)
        self.running = True

    async def stop(self):
        self.stops += 1
        self.running = False


RETRY = 0.01


def build_service(repository=None):
    repository = repository or FakeOperationRepository()
    acquisition = FakeAcquisition()
    service = ReactorStateService(
        repository=repository,
        acquisition=acquisition,
        retry_min_seconds=RETRY,
        retry_max_seconds=RETRY * 4,
    )
    return service, repository, acquisition


async def wait_for(condition, timeout=2.0):
    deadline = asyncio.get_running_loop().time() + timeout
    while asyncio.get_running_loop().time() < deadline:
        if condition():
            return True
        await asyncio.sleep(RETRY / 2)
    return False


async def test_arranca_detenido():
    service, _, acquisition = build_service()
    state = service.get_current_state()

    assert state.sermo is False
    assert state.status is ReactorStatus.DETENIDO
    assert state.operation_id is None
    assert acquisition.started == []


async def test_sermo_on_abre_operacion_y_arranca_la_toma_de_datos():
    service, repository, acquisition = build_service()

    changed = await service.apply_signal(SermoSignal(sermo=True))

    assert changed is True
    assert len(repository.opened) == 1
    state = service.get_current_state()
    assert state.sermo is True
    assert state.status is ReactorStatus.OPERACION
    assert state.operation_id == repository.opened[0]["id"]
    assert acquisition.started == [state.operation_id]


async def test_sermo_off_detiene_la_toma_de_datos_y_cierra_la_operacion():
    service, repository, acquisition = build_service()
    await service.apply_signal(SermoSignal(sermo=True))

    changed = await service.apply_signal(SermoSignal(sermo=False))

    assert changed is True
    assert acquisition.stops == 1
    assert len(repository.closed) == 1
    state = service.get_current_state()
    assert state.sermo is False
    assert state.operation_id is None


async def test_mensajes_repetidos_no_abren_una_segunda_operacion():
    # QoS 1 permite reentregas y el mensaje retenido vuelve a llegar en cada
    # reconexion: sin idempotencia, cada una partiria el historico.
    service, repository, acquisition = build_service()

    assert await service.apply_signal(SermoSignal(sermo=True)) is True
    assert await service.apply_signal(SermoSignal(sermo=True)) is False
    assert await service.apply_signal(SermoSignal(sermo=True)) is False

    assert len(repository.opened) == 1
    assert acquisition.started == [repository.opened[0]["id"]]


async def test_off_repetido_no_cierra_dos_veces():
    service, repository, acquisition = build_service()

    assert await service.apply_signal(SermoSignal(sermo=False)) is False
    assert repository.closed == []
    assert acquisition.stops == 0


async def test_ciclo_completo_genera_dos_operaciones():
    service, repository, _ = build_service()

    await service.apply_signal(SermoSignal(sermo=True))
    await service.apply_signal(SermoSignal(sermo=False))
    await service.apply_signal(SermoSignal(sermo=True))

    assert len(repository.opened) == 2
    assert len(repository.closed) == 1
    assert service.get_current_state().operation_id == repository.opened[1]["id"]


async def test_usa_los_metadatos_del_mensaje_cuando_vienen():
    service, repository, _ = build_service()

    await service.apply_signal(
        SermoSignal.model_validate(
            {
                "sermo": True,
                "operation": {"name": "Practica Reactores I", "operator": "Dr. Perez"},
            }
        )
    )

    assert repository.opened[0]["name"] == "Practica Reactores I"
    assert repository.opened[0]["operator"] == "Dr. Perez"


async def test_sin_metadatos_genera_nombre_y_operador_por_defecto():
    service, repository, _ = build_service()

    await service.apply_signal(SermoSignal(sermo=True))

    assert repository.opened[0]["name"].startswith("Operacion ")
    assert repository.opened[0]["operator"] == "Desconocido"


async def test_timestamp_sin_zona_se_interpreta_como_utc():
    # La FPGA puede publicar un ISO-8601 sin offset; mezclarlo con datetimes
    # aware al restar fechas lanza TypeError.
    service, repository, _ = build_service()

    await service.apply_signal(
        # Naive a proposito: es justamente el caso que se esta probando.
        SermoSignal(sermo=True, timestamp=datetime(2026, 9, 30, 12, 0, 0))  # noqa: DTZ001
    )

    started_at = repository.opened[0]["started_at"]
    assert started_at.tzinfo is not None
    assert started_at == datetime(2026, 9, 30, 12, 0, 0, tzinfo=UTC)


async def test_perder_el_broker_no_apaga_el_reactor():
    # Sin conexion no se sabe si el reactor opera; eso NO es lo mismo que
    # saber que se detuvo. El frontend necesita poder distinguirlo (issue 2.7).
    service, _, acquisition = build_service()
    await service.apply_signal(SermoSignal(sermo=True))

    await service.set_source_connected(False)

    state = service.get_current_state()
    assert state.sermo is True
    assert state.source_connected is False
    assert acquisition.stops == 0


async def test_reconcile_cierra_la_operacion_que_quedo_abierta():
    stale = {
        "id": "OP-2026-007",
        "name": "Ensayo previo",
        "operator": "Dr. Perez",
        "started_at": datetime(2026, 9, 30, 9, 0, tzinfo=UTC),
    }
    service, repository, _ = build_service(FakeOperationRepository(open_operation=stale))

    await service.reconcile_on_startup()

    assert [operation["id"] for operation in repository.closed] == ["OP-2026-007"]
    assert service.get_current_state().sermo is False


async def test_reconcile_sin_operacion_abierta_no_hace_nada():
    service, repository, _ = build_service()

    await service.reconcile_on_startup()

    assert repository.closed == []


async def test_los_listeners_reciben_cada_cambio():
    # Es el enganche del WebSocket reactor.state (issue 2.5).
    service, _, _ = build_service()
    recibidos = []

    async def listener(state):
        recibidos.append(state)

    service.register_listener(listener)

    await service.apply_signal(SermoSignal(sermo=True))
    await service.apply_signal(SermoSignal(sermo=True))  # repetido: no notifica
    await service.set_source_connected(True)
    await service.apply_signal(SermoSignal(sermo=False))

    assert [state.sermo for state in recibidos] == [True, True, False]
    assert [state.source_connected for state in recibidos] == [False, True, True]


# -- Caida de la base durante una transicion (ADR 0006) ---------------------


async def test_on_con_la_base_caida_se_aplica_solo_cuando_vuelve():
    service, repository, acquisition = build_service()
    recibidos = []

    async def listener(state):
        recibidos.append(state.sermo)

    service.register_listener(listener)
    repository.down = True
    publicado = datetime(2026, 10, 3, 15, 0, tzinfo=UTC)

    # No lanza: si lo hiciera, el suscriptor MQTT se reconectaria al broker y
    # el frontend veria "sin senal" por un problema que es de la base.
    changed = await service.apply_signal(SermoSignal(sermo=True, timestamp=publicado))

    assert changed is False
    assert service.get_current_state().sermo is False
    assert recibidos == []

    await asyncio.sleep(RETRY * 3)
    repository.down = False
    assert await wait_for(lambda: service.get_current_state().sermo is True)

    assert len(repository.opened) == 1
    # La operacion empieza cuando la FPGA lo dijo, no cuando volvio la base.
    assert repository.opened[0]["started_at"] == publicado
    assert acquisition.started == [repository.opened[0]["id"]]
    assert recibidos == [True]
    await service.shutdown()


async def test_off_con_la_base_caida_se_reintenta_hasta_cerrar():
    service, repository, acquisition = build_service()
    await service.apply_signal(SermoSignal(sermo=True))
    repository.down = True

    assert await service.apply_signal(SermoSignal(sermo=False)) is False
    # La toma de datos se corta igual: el reactor se detuvo de verdad.
    assert acquisition.stops == 1
    assert repository.closed == []

    repository.down = False
    assert await wait_for(lambda: service.get_current_state().sermo is False)
    assert len(repository.closed) == 1
    await service.shutdown()


async def test_una_senal_nueva_reemplaza_a_la_pendiente():
    # ON y OFF mientras la base esta caida: cuando vuelve no hay nada que
    # abrir, el ultimo valor publicado es OFF.
    service, repository, acquisition = build_service()
    repository.down = True

    await service.apply_signal(SermoSignal(sermo=True))
    await service.apply_signal(SermoSignal(sermo=False))
    repository.down = False
    await asyncio.sleep(RETRY * 10)

    assert repository.opened == []
    assert acquisition.started == []
    assert service.get_current_state().sermo is False


async def test_on_mientras_el_cierre_esperaba_a_la_base_retoma_la_toma_de_datos():
    # El OFF corto la toma de datos pero no llego a cerrar la operacion. Si
    # el reactor vuelve a arrancar, ignorar el ON por idempotencia dejaria
    # todo el ensayo sin muestras.
    service, repository, acquisition = build_service()
    await service.apply_signal(SermoSignal(sermo=True))
    operation_id = service.get_current_state().operation_id
    repository.down = True

    await service.apply_signal(SermoSignal(sermo=False))
    assert acquisition.running is False
    await service.apply_signal(SermoSignal(sermo=True))

    assert acquisition.running is True
    assert acquisition.started == [operation_id, operation_id]
    repository.down = False
    await asyncio.sleep(RETRY * 10)

    # Sigue siendo la misma operacion: nunca se cerro en la base.
    assert len(repository.opened) == 1
    assert repository.closed == []
    assert service.get_current_state().operation_id == operation_id
    await service.shutdown()


async def test_shutdown_cancela_el_reintento_pendiente():
    service, repository, _ = build_service()
    repository.down = True
    await service.apply_signal(SermoSignal(sermo=True))

    await service.shutdown()
    repository.down = False
    await asyncio.sleep(RETRY * 10)

    assert repository.opened == []

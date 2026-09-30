# El parseo del payload es la frontera con un sistema que no controlamos (la
# FPGA) y cuyo formato exacto todavia no esta confirmado. Es el lugar donde
# conviene ser explicito sobre que se acepta y que no.
import pytest

from app.mqtt.schemas import InvalidSermoPayloadError, parse_sermo_payload


@pytest.mark.parametrize("payload", [b"1", b"true", b"on", b"ON", b" True ", b"operando"])
def test_forma_corta_verdadera(payload):
    assert parse_sermo_payload(payload).sermo is True


@pytest.mark.parametrize("payload", [b"0", b"false", b"off", b"OFF", b" no ", b"detenido"])
def test_forma_corta_falsa(payload):
    assert parse_sermo_payload(payload).sermo is False


def test_json_completo():
    signal = parse_sermo_payload(
        b'{"sermo": true, "timestamp": "2026-09-30T12:00:00Z", "source": "fpga-ra0"}'
    )
    assert signal.sermo is True
    assert signal.source == "fpga-ra0"
    assert signal.timestamp is not None


def test_json_con_metadatos_de_operacion():
    signal = parse_sermo_payload(
        b'{"sermo": true, "operation": {"name": "Practica", "operator": "Dr. Perez"}}'
    )
    assert signal.operation is not None
    assert signal.operation.name == "Practica"
    assert signal.operation.operator == "Dr. Perez"
    assert signal.operation.notes is None


def test_json_sin_metadatos_deja_operation_en_none():
    assert parse_sermo_payload(b'{"sermo": false}').operation is None


def test_payload_vacio_no_es_sermo_false():
    # Un retenido vacio es como el broker borra el mensaje retenido: significa
    # "no se sabe", no "el reactor esta detenido". Interpretarlo como false
    # apagaria el tiempo real sin que nadie lo haya pedido.
    with pytest.raises(InvalidSermoPayloadError):
        parse_sermo_payload(b"   ")


@pytest.mark.parametrize(
    "payload",
    [
        b"quizas",                       # texto no reconocido
        b'{"estado": true}',             # JSON sin el campo sermo
        b'{"sermo": "quizas"}',          # sermo no booleanizable
        b"[1, 2, 3]",                    # JSON que no es objeto
        b"\xff\xfe",                     # bytes que no son UTF-8
    ],
)
def test_payloads_invalidos(payload):
    with pytest.raises(InvalidSermoPayloadError):
        parse_sermo_payload(payload)

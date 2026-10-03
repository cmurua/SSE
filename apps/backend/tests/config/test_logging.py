# Enmascarado del access token en los logs. Los WebSocket del navegador
# mandan el token en la URL (RFC 6750 2.3) y uvicorn escribe la URL completa
# en cada handshake: sin el filtro, los logs guardarian sesiones reutilizables.
import logging

from app.config.logging import RedactQueryParamsFilter, configure_logging

TOKEN = "eyJhbGciOiJIUzI1NiJ9.secreto.firma"


def make_record(msg: str, args: tuple) -> logging.LogRecord:
    return logging.LogRecord("uvicorn.error", logging.INFO, __file__, 1, msg, args, None)


def test_enmascara_el_token_en_el_log_del_handshake_websocket():
    # El mismo formato que usa uvicorn al aceptar un WebSocket.
    record = make_record(
        '%s - "WebSocket %s" [accepted]',
        ("127.0.0.1:5000", f"/api/v1/reactor-state/ws?access_token={TOKEN}"),
    )

    RedactQueryParamsFilter(["access_token"]).filter(record)

    message = record.getMessage()
    assert TOKEN not in message
    assert "access_token=[REDACTED]" in message


def test_conserva_el_resto_de_la_query():
    record = make_record("%s", (f"/ws?a=1&access_token={TOKEN}&b=2",))

    RedactQueryParamsFilter(["access_token"]).filter(record)

    assert record.getMessage() == "/ws?a=1&access_token=[REDACTED]&b=2"


def test_no_rompe_el_formato_del_access_log():
    """El AccessFormatter de uvicorn desempaqueta exactamente cinco args."""
    args = ("127.0.0.1:5000", "GET", f"/x?access_token={TOKEN}", "1.1", 200)
    record = make_record('%s - "%s %s HTTP/%s" %d', args)

    RedactQueryParamsFilter(["access_token"]).filter(record)

    assert len(record.args) == 5
    assert record.args[2] == "/x?access_token=[REDACTED]"
    assert record.args[4] == 200


def test_no_toca_parametros_con_nombre_parecido():
    record = make_record("%s", ("/ws?my_access_token=visible",))

    RedactQueryParamsFilter(["access_token"]).filter(record)

    assert record.getMessage() == "/ws?my_access_token=visible"


def test_configure_logging_instala_el_filtro_en_los_loggers_de_uvicorn_una_sola_vez():
    configure_logging(redact_query_params=["access_token"])
    configure_logging(redact_query_params=["access_token"])

    for name in ("uvicorn.access", "uvicorn.error"):
        filters = logging.getLogger(name).filters
        assert sum(isinstance(f, RedactQueryParamsFilter) for f in filters) == 1

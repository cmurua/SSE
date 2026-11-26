# Traduccion de dias del calendario de Cordoba a instantes. Sin base: es la
# unica logica del servicio que no es SQL, y la que mas facil se rompe con un
# cambio de zona horaria. Los filtros completos se prueban en test_router.py.
from datetime import UTC, date, datetime

from app.domains.historicals.service import LOCAL_TIMEZONE, local_day_bounds


def test_sin_fechas_no_hay_limites():
    assert local_day_bounds(None, None) == (None, None)


def test_from_es_la_medianoche_de_cordoba():
    start, end = local_day_bounds(date(2025, 3, 10), None)

    assert start == datetime(2025, 3, 10, 0, 0, tzinfo=LOCAL_TIMEZONE)
    # Cordoba es UTC-3 todo el anio.
    assert start == datetime(2025, 3, 10, 3, 0, tzinfo=UTC)
    assert end is None


def test_to_inclusivo_termina_en_la_medianoche_siguiente():
    start, end = local_day_bounds(None, date(2025, 3, 10))

    assert start is None
    assert end == datetime(2025, 3, 11, 0, 0, tzinfo=LOCAL_TIMEZONE)


def test_un_solo_dia_dura_24_horas():
    start, end = local_day_bounds(date(2025, 3, 10), date(2025, 3, 10))

    assert (end - start).total_seconds() == 24 * 3600


def test_to_en_la_ultima_fecha_posible_no_tiene_limite_superior():
    # date.max no tiene dia siguiente: sumarle uno desbordaria.
    assert local_day_bounds(None, date.max) == (None, None)


def test_to_a_fin_de_anio_pasa_al_anio_siguiente():
    _, end = local_day_bounds(None, date(2025, 12, 31))

    assert end == datetime(2026, 1, 1, 0, 0, tzinfo=LOCAL_TIMEZONE)

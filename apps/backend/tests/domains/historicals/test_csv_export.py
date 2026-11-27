# Formato del CSV de muestras, sin base (ver historicals/csv_export.py).
from datetime import UTC, datetime, timedelta, timezone

import pytest

from app.domains.historicals.csv_export import (
    BOM,
    csv_chunks,
    format_timestamp,
    format_value,
    header,
)


def test_encabezado_con_la_unidad_de_cada_variable():
    assert header(["LOGA1", "POTM4"]) == ["timestamp", "LOGA1 [c/s]", "POTM4 [W]"]


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (None, ""),
        (0.0, "0,0"),
        (1.5, "1,5"),
        (-0.25, "-0,25"),
        (0.1, "0,1"),
        (1e-05, "1e-05"),
        (1.25e-07, "1,25e-07"),
        (123456.789, "123456,789"),
    ],
)
def test_valores_con_coma_decimal_y_sin_perder_resolucion(value, expected):
    assert format_value(value) == expected


def test_el_texto_vuelve_al_mismo_float():
    value = 0.1 + 0.2
    assert float(format_value(value).replace(",", ".")) == value


def test_timestamp_iso_8601_en_utc_con_milisegundos():
    cordoba = timezone(timedelta(hours=-3))
    assert format_timestamp(datetime(2025, 3, 10, 9, 0, 1, 500000, tzinfo=cordoba)) == (
        "2025-03-10T12:00:01.500+00:00"
    )


def rows(n: int):
    start = datetime(2025, 3, 10, 12, tzinfo=UTC)
    return ((start + timedelta(seconds=i), float(i), None) for i in range(n))


def test_bom_y_encabezado_en_el_primer_bloque():
    chunks = list(csv_chunks(["timestamp", "A [W]", "B [W]"], rows(0)))
    assert chunks == [BOM + "timestamp;A [W];B [W]\r\n"]


def test_filas_separadas_por_punto_y_coma_con_crlf():
    text = "".join(csv_chunks(["timestamp", "A [W]", "B [W]"], rows(2)))
    assert text.removeprefix(BOM).split("\r\n") == [
        "timestamp;A [W];B [W]",
        "2025-03-10T12:00:00.000+00:00;0,0;",
        "2025-03-10T12:00:01.000+00:00;1,0;",
        "",
    ]


def test_manda_de_a_bloques_y_consume_las_filas_de_a_una():
    consumed = []

    def tracked():
        for row in rows(25):
            consumed.append(row)
            yield row

    chunks = csv_chunks(["timestamp", "A", "B"], tracked(), rows_per_chunk=10)
    next(chunks)  # encabezado
    assert consumed == []
    first = next(chunks)
    assert first.count("\r\n") == 10
    assert len(consumed) == 10
    rest = list(chunks)
    assert [c.count("\r\n") for c in rest] == [10, 5]

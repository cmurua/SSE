# Formato del CSV de muestras (GET .../samples.csv, tarea 5.8).
#
# Pensado para abrirse con doble clic en una planilla configurada en espanol
# (Excel o LibreOffice en es-AR), que es lo que usan los alumnos:
#
# - Separador `;` y coma decimal: con la coma como separador de campos, una
#   planilla en espanol partiria cada numero en dos columnas.
# - BOM UTF-8 al principio: sin el, Excel lo lee como ANSI y rompe cualquier
#   caracter no ASCII (hoy las unidades son ASCII, pero no hay que depender
#   de eso).
# - Fin de linea CRLF (RFC 4180).
# - Una muestra por fila, sin reducir. `timestamp` en ISO 8601 UTC con
#   milisegundos, como el resto de la API. Un canal sin dato es una celda
#   vacia, no un 0.
#
# Para leerlo con pandas: read_csv(path, sep=";", decimal=",", encoding="utf-8-sig").
from __future__ import annotations

import csv
import io
from collections.abc import Iterable, Iterator, Sequence
from datetime import UTC, datetime

from app.domains.reactor_data.variable_catalog import REACTOR_VARIABLES_BY_ID

DELIMITER = ";"
DECIMAL_SEPARATOR = ","
BOM = "﻿"
TIMESTAMP_COLUMN = "timestamp"
# Filas por bloque enviado: lo bastante grande para no mandar un paquete por
# fila, lo bastante chico para que el primer byte salga enseguida.
ROWS_PER_CHUNK = 1000


def header(variable_ids: Sequence[str]) -> list[str]:
    """`timestamp` y una columna por variable, con su unidad: `POTM4 [W]`."""
    return [
        TIMESTAMP_COLUMN,
        *(f"{v} [{REACTOR_VARIABLES_BY_ID[v]['unit']}]" for v in variable_ids),
    ]


def format_timestamp(timestamp: datetime) -> str:
    return timestamp.astimezone(UTC).isoformat(timespec="milliseconds")


def format_value(value: float | None) -> str:
    # repr y no str ni un formato fijo: es el texto mas corto que vuelve al
    # mismo float, asi no se pierde resolucion (`1e-05`, `0.1`).
    if value is None:
        return ""
    return repr(float(value)).replace(".", DECIMAL_SEPARATOR)


def csv_chunks(
    columns: Sequence[str],
    rows: Iterable[tuple],
    *,
    rows_per_chunk: int = ROWS_PER_CHUNK,
) -> Iterator[str]:
    """El CSV de a bloques: BOM y encabezado primero, despues las filas.

    `rows` son tuplas `(timestamp, valor_1, ..., valor_n)`; se consumen de a
    una, asi que el CSV entero nunca esta en memoria.
    """
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=DELIMITER, lineterminator="\r\n")

    def flush() -> str:
        text = buffer.getvalue()
        buffer.seek(0)
        buffer.truncate()
        return text

    buffer.write(BOM)
    writer.writerow(columns)
    yield flush()

    pending = 0
    for timestamp, *values in rows:
        writer.writerow([format_timestamp(timestamp), *(format_value(v) for v in values)])
        pending += 1
        if pending == rows_per_chunk:
            yield flush()
            pending = 0
    if pending:
        yield flush()

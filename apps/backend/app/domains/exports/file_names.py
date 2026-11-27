# Nombre de los archivos exportados (tarea 5.8):
#
#     SSE_<operacion>_<variables>_<inicio>-<fin>.<extension>
#     SSE_OP-2025-001_LOGA1-POTM4_00h05m00s-01h30m00s.csv
#
# - <operacion>: el ID, con lo que no sea letra, digito o guion cambiado por
#   un guion (el `_` separa los campos, y `/` o `:` no van en un nombre de
#   archivo de Windows).
# - <variables>: los IDs del catalogo separados por guiones, o `todas` si es
#   el catalogo entero.
# - <inicio>-<fin>: la ventana, medida desde el inicio de la operacion. El
#   inicio se redondea hacia abajo y el fin hacia arriba, asi el nombre cubre
#   la ventana entera. Sin ventana, el campo no va.
#
# El frontend arma el mismo nombre en
# features/operation-viewer/services/exportFileName.ts: si cambia uno, cambiar
# el otro.
from __future__ import annotations

import math
import re
from collections.abc import Sequence

ALL_VARIABLES_LABEL = "todas"
_UNSAFE = re.compile(r"[^A-Za-z0-9-]+")


def _safe(text: str) -> str:
    return _UNSAFE.sub("-", text).strip("-") or "sin-id"


def format_offset(seconds: float) -> str:
    """`5400` -> `01h30m00s`. Las horas siguen sumando pasadas las 99."""
    total = max(0, int(seconds))
    hours, rest = divmod(total, 3600)
    minutes, secs = divmod(rest, 60)
    return f"{hours:02d}h{minutes:02d}m{secs:02d}s"


def export_file_name(
    operation_id: str,
    variable_ids: Sequence[str],
    window: tuple[float, float] | None,
    extension: str,
    *,
    all_variables: bool = False,
) -> str:
    variables = ALL_VARIABLES_LABEL if all_variables else "-".join(_safe(v) for v in variable_ids)
    parts = ["SSE", _safe(operation_id), variables]
    if window is not None:
        start, end = window
        parts.append(f"{format_offset(math.floor(start))}-{format_offset(math.ceil(end))}")
    return "_".join(parts) + "." + extension

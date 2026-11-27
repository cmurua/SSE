# Convencion de nombres de archivo exportado (tarea 5.8). El frontend tiene
# su copia en exportFileName.ts, con los mismos casos.
import pytest

from app.domains.exports.file_names import export_file_name, format_offset


@pytest.mark.parametrize(
    ("seconds", "expected"),
    [
        (0, "00h00m00s"),
        (59, "00h00m59s"),
        (300, "00h05m00s"),
        (5400, "01h30m00s"),
        (3600 * 100 + 1, "100h00m01s"),
        (-5, "00h00m00s"),
    ],
)
def test_format_offset(seconds: float, expected: str):
    assert format_offset(seconds) == expected


def test_nombre_con_operacion_variables_y_ventana():
    name = export_file_name("OP-2025-001", ["LOGA1", "POTM4"], (300, 5400), "csv")
    assert name == "SSE_OP-2025-001_LOGA1-POTM4_00h05m00s-01h30m00s.csv"


def test_la_ventana_redondea_el_inicio_hacia_abajo_y_el_fin_hacia_arriba():
    name = export_file_name("OP-1", ["POTM4"], (59.9, 60.1), "png")
    assert name == "SSE_OP-1_POTM4_00h00m59s-00h01m01s.png"


def test_todas_las_variables():
    name = export_file_name("OP-1", ["LOGA1", "TA1"], (0, 60), "csv", all_variables=True)
    assert name == "SSE_OP-1_todas_00h00m00s-00h01m00s.csv"


def test_sin_ventana_no_lleva_el_campo():
    assert export_file_name("OP-1", ["POTM4"], None, "png") == "SSE_OP-1_POTM4.png"


@pytest.mark.parametrize(
    ("operation_id", "expected"),
    [
        ("OP 2025/001", "OP-2025-001"),
        ("op_1:a", "op-1-a"),
        ("Práctica#3", "Pr-ctica-3"),
        ("--x--", "x"),
        ("///", "sin-id"),
    ],
)
def test_la_operacion_solo_lleva_letras_digitos_y_guiones(operation_id: str, expected: str):
    assert export_file_name(operation_id, ["POTM4"], None, "png") == f"SSE_{expected}_POTM4.png"

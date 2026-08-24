# SUPUESTO: catalogo PROVISIONAL de variables del reactor. Sale del mock del
# prototipo de frontend (docs/design/frontend-prototype/src/mockData.jsx), no
# de la documentacion del SIR/I&C real. IDs, nombres, unidades y rangos deben
# confirmarse antes de fijar el esquema definitivo: agregar o quitar variables
# implica una migracion Alembic sobre `reactor_samples` (ver tarea 3.9).
#
# `min`/`max` son el rango de escala esperado (util para los ejes de los
# graficos de RF05 y para el simulador de la tarea 0.4) y `nominal` el valor
# tipico de operacion; ninguno de los tres se valida contra la muestra.
REACTOR_VARIABLES = [
    {"id": "POT_NUC", "name": "Potencia neutrónica", "unit": "W", "group": "Núcleo", "min": 0, "max": 10, "nominal": 5.2},
    {"id": "FLU_NEU", "name": "Flujo de neutrones", "unit": "n/cm²s", "group": "Núcleo", "min": 0, "max": 1e10, "nominal": 6.3e9},
    {"id": "TEM_NUC", "name": "Temperatura del núcleo", "unit": "°C", "group": "Núcleo", "min": 18, "max": 65, "nominal": 32.4},
    {"id": "TEM_PIL", "name": "Temperatura de pileta", "unit": "°C", "group": "Refrigeración", "min": 18, "max": 45, "nominal": 27.1},
    {"id": "PRE_PRI", "name": "Presión primario", "unit": "kPa", "group": "Refrigeración", "min": 95, "max": 115, "nominal": 101.4},
    {"id": "CAU_REF", "name": "Caudal refrigerante", "unit": "L/min", "group": "Refrigeración", "min": 0, "max": 500, "nominal": 312},
    {"id": "NIV_PIL", "name": "Nivel de pileta", "unit": "m", "group": "Refrigeración", "min": 0, "max": 6, "nominal": 5.42},
    {"id": "POS_BR1", "name": "Inserción barra control 1", "unit": "%", "group": "Control", "min": 0, "max": 100, "nominal": 58.2},
    {"id": "POS_BR2", "name": "Inserción barra control 2", "unit": "%", "group": "Control", "min": 0, "max": 100, "nominal": 54.7},
    {"id": "POS_BR3", "name": "Inserción barra control 3", "unit": "%", "group": "Control", "min": 0, "max": 100, "nominal": 49.4},
    {"id": "POS_BR4", "name": "Inserción barra control 4", "unit": "%", "group": "Control", "min": 0, "max": 100, "nominal": 46.8},
    {"id": "POS_BRS", "name": "Inserción barra de seguridad", "unit": "%", "group": "Control", "min": 0, "max": 100, "nominal": 100},
    {"id": "NIV_MOD", "name": "Nivel moderador en núcleo", "unit": "%", "group": "Núcleo", "min": 0, "max": 100, "nominal": 98.6},
    {"id": "PER_REA", "name": "Período del reactor", "unit": "s", "group": "Cinética", "min": -100, "max": 1000, "nominal": 240},
    {"id": "REA_NEU", "name": "Reactividad", "unit": "pcm", "group": "Cinética", "min": -300, "max": 300, "nominal": 12},
    {"id": "DOS_SAL", "name": "Tasa de dosis · sala", "unit": "µSv/h", "group": "Radiación", "min": 0, "max": 50, "nominal": 1.8},
    {"id": "DOS_PIL", "name": "Tasa de dosis · pileta", "unit": "µSv/h", "group": "Radiación", "min": 0, "max": 100, "nominal": 4.6},
    {"id": "DOS_VEN", "name": "Dosis aire ventilación", "unit": "Bq/m³", "group": "Radiación", "min": 0, "max": 1000, "nominal": 25},
    {"id": "TEM_AMB", "name": "Temperatura sala", "unit": "°C", "group": "Sala", "min": 15, "max": 30, "nominal": 22.1},
    {"id": "HUM_AMB", "name": "Humedad relativa", "unit": "%", "group": "Sala", "min": 20, "max": 80, "nominal": 48},
    {"id": "PRE_ATM", "name": "Presión atmosférica", "unit": "hPa", "group": "Sala", "min": 980, "max": 1030, "nominal": 1013},
    {"id": "VOL_DET1", "name": "Voltaje detector CIC-1", "unit": "V", "group": "Instrumentación", "min": 0, "max": 10, "nominal": 7.2},
    {"id": "VOL_DET2", "name": "Voltaje detector CIC-2", "unit": "V", "group": "Instrumentación", "min": 0, "max": 10, "nominal": 7.4},
    {"id": "FRE_DET", "name": "Frecuencia conteo BF3", "unit": "cps", "group": "Instrumentación", "min": 0, "max": 1e6, "nominal": 4.2e5},
    {"id": "RUI_DET", "name": "Ruido de fondo", "unit": "cps", "group": "Instrumentación", "min": 0, "max": 200, "nominal": 28},
    {"id": "TEN_RED", "name": "Tensión red 380V", "unit": "V", "group": "Eléctrico", "min": 360, "max": 400, "nominal": 381},
    {"id": "COR_BOM", "name": "Corriente bomba primaria", "unit": "A", "group": "Eléctrico", "min": 0, "max": 30, "nominal": 18.4},
    # Booleana (bomba encendida/apagada), guardada igual que el resto como
    # float para que `reactor_samples` no necesite columnas de otro tipo.
    {"id": "EST_BOM", "name": "Estado bomba primaria", "unit": "0/1", "group": "Eléctrico", "min": 0, "max": 1, "nominal": 1},
    {"id": "CAU_VEN", "name": "Caudal de ventilación", "unit": "m³/h", "group": "Ventilación", "min": 0, "max": 5000, "nominal": 3200},
    {"id": "PRE_VEN", "name": "Presión sala (depresión)", "unit": "Pa", "group": "Ventilación", "min": -50, "max": 0, "nominal": -22},
    {"id": "CON_PH", "name": "pH agua pileta", "unit": "—", "group": "Química", "min": 5, "max": 8, "nominal": 6.4},
    {"id": "CON_O2", "name": "Oxígeno disuelto", "unit": "ppm", "group": "Química", "min": 0, "max": 10, "nominal": 4.2},
    {"id": "CON_CON", "name": "Conductividad", "unit": "µS/cm", "group": "Química", "min": 0, "max": 50, "nominal": 1.8},
]

REACTOR_VARIABLES_BY_ID = {variable["id"]: variable for variable in REACTOR_VARIABLES}


def sample_column(variable_id: str) -> str:
    """Columna de `reactor_samples` donde se guarda la variable.

    La convencion es el ID del catalogo en minusculas (POT_NUC -> pot_nuc).
    Existe como funcion, y no como una clave mas del catalogo, para tener un
    unico lugar donde cambiarla si el listado real trae IDs que no sirven como
    nombre de columna.
    """
    return variable_id.lower()

# Catalogo de señales del RA-0. Reemplaza al catalogo provisional que salia del
# mock del prototipo de frontend (tarea 3.9).
#
# ORIGEN: listado de señales aportado por el equipo del RA-0. La designacion
# completa de cada señal lleva el prefijo "SM" (ej. "SM LogA1"); el prefijo es
# constante en las 34 y no discrimina, asi que no forma parte del `id`.
#
# QUE ESTA CONFIRMADO Y QUE NO -- la distincion importa porque el costo de
# corregir cada cosa es muy distinto:
#
#   * `id`, `name` y `group` salen del listado real: CONFIRMADOS. Son los que
#     fijan el esquema, porque `reactor_samples` es una tabla ancha con una
#     columna por señal; cambiarlos cuesta una migracion Alembic.
#   * `min`, `max`, `nominal` y `unit` estan declarados en el listado para solo
#     5 de las 34 señales. El resto son SUPUESTOS, marcados con
#     `range_source="supuesto"`: no tocan el esquema, solo alimentan la
#     generacion de valores de la fuente simulada y los ejes de los graficos
#     (RF05), asi que corregirlos es editar este diccionario.
#
# Cuando lleguen los rangos reales del I&C, filtrar por
# `range_source == "supuesto"` da exactamente la lista de lo que hay que
# revisar, sin tener que releer el archivo entero.
#
# Los supuestos no son arbitrarios: PotM4 va de 0 a 10 W, o sea que el RA-0 es
# un reactor de potencia nula, y eso ancla el resto -- las temperaturas no se
# alejan del ambiente, los caudales son chicos, las posiciones de barra son
# 0-100% por definicion, y cada nivel de disparo comparte unidad y escala con
# el monitor de area que vigila.

# Valores declarados en el listado del RA-0.
CONFIRMADO = "tabla"
# Valores inferidos; pendientes de confirmar contra la documentacion del I&C.
SUPUESTO = "supuesto"

# Señal medida: varia con la operacion del reactor.
MEDIDA = "medida"
# Señal de consigna: un umbral configurado, no una medicion. Se mantiene
# constante mientras no lo cambie un operador, asi que la fuente simulada la
# emite plana en vez de hacerla oscilar (un nivel de disparo que se mueve solo
# no existe, y ademas haria ruido en los graficos).
CONSIGNA = "consigna"

# Nombres legibles de los grupos del I&C, para agrupar en la UI.
REACTOR_GROUPS = {
    "SA1": "Canal de Arranque 1",
    "SA2": "Canal de Arranque 2",
    "SM1": "Canal de Marcha 1",
    "SM2": "Canal de Marcha 2",
    "SMP": "Canal Lineal de Marcha",
    "SP2": "Proteccion",
    "SMA": "Monitores de Area",
    "SCM": "Circuito de Moderador",
    "SBC": "Barras de Control",
    "SSO": "Supervision de Operacion",
}

REACTOR_VARIABLES = [
    # --- SA1 / SA2: canales de arranque -----------------------------------
    {"id": "LOGA1", "name": "Logaritmico de Arranque 1", "unit": "c/s", "group": "SA1",
     "min": 1, "max": 1e5, "nominal": 1e3, "kind": MEDIDA, "range_source": CONFIRMADO},
    {"id": "TA1", "name": "Tasa de Arranque 1", "unit": "dpm", "group": "SA1",
     "min": -1.0, "max": 5.0, "nominal": 0.0, "kind": MEDIDA, "range_source": SUPUESTO},
    {"id": "LOGA2", "name": "Logaritmico de Arranque 2", "unit": "c/s", "group": "SA2",
     "min": 1, "max": 1e5, "nominal": 1e3, "kind": MEDIDA, "range_source": CONFIRMADO},
    {"id": "TA2", "name": "Tasa de Arranque 2", "unit": "dpm", "group": "SA2",
     "min": -1.0, "max": 5.0, "nominal": 0.0, "kind": MEDIDA, "range_source": SUPUESTO},

    # --- SM1 / SM2: canales de marcha -------------------------------------
    # SUPUESTO: los logaritmicos de marcha cubren el rango de potencia (la
    # cadena de arranque cuenta pulsos; la de marcha ya mide potencia), de ahi
    # que el tope coincida con el de PotM4.
    {"id": "LOGM1", "name": "Logaritmico de Marcha 1", "unit": "W", "group": "SM1",
     "min": 1e-3, "max": 10.0, "nominal": 5.0, "kind": MEDIDA, "range_source": SUPUESTO},
    {"id": "TM1", "name": "Tasa de Marcha 1", "unit": "dpm", "group": "SM1",
     "min": -1.0, "max": 5.0, "nominal": 0.0, "kind": MEDIDA, "range_source": SUPUESTO},
    {"id": "LOGM2", "name": "Logaritmico de Marcha 2", "unit": "W", "group": "SM2",
     "min": 1e-3, "max": 10.0, "nominal": 5.0, "kind": MEDIDA, "range_source": SUPUESTO},
    {"id": "TM2", "name": "Tasa de Marcha 2", "unit": "dpm", "group": "SM2",
     "min": -1.0, "max": 5.0, "nominal": 0.0, "kind": MEDIDA, "range_source": SUPUESTO},

    # --- SMP / SP2: canal lineal y proteccion -----------------------------
    {"id": "LCM4", "name": "Lineal Canal de Marcha 4", "unit": "V", "group": "SMP",
     "min": 0.0, "max": 1.0, "nominal": 0.52, "kind": MEDIDA, "range_source": CONFIRMADO},
    {"id": "LINM4", "name": "Lineal de Marcha 4", "unit": "V", "group": "SMP",
     "min": 0.0, "max": 1.0, "nominal": 0.54, "kind": MEDIDA, "range_source": SUPUESTO},
    # SUPUESTO: es el umbral de disparo del canal, no una medicion, de ahi que
    # sea consigna. El rango si esta declarado.
    {"id": "NDCM4", "name": "Disparo Canal de Marcha 4", "unit": "V", "group": "SP2",
     "min": 0.0, "max": 1.0, "nominal": 0.85, "kind": CONSIGNA, "range_source": CONFIRMADO},

    # --- SMA: monitores de area y sus niveles de disparo -------------------
    # SUPUESTO: tasa de dosis en uSv/h. Las escalas se diferencian por zona
    # (el recinto y la boca de tanque ven mas que la sala de control), y cada
    # nivel de disparo (ND**) comparte unidad y escala con su monitor.
    {"id": "MASC", "name": "Monitor de Area Sala de Control", "unit": "uSv/h", "group": "SMA",
     "min": 0, "max": 50, "nominal": 1.5, "kind": MEDIDA, "range_source": SUPUESTO},
    {"id": "MABT", "name": "Monitor de Area Boca de Tanque", "unit": "uSv/h", "group": "SMA",
     "min": 0, "max": 100, "nominal": 5.0, "kind": MEDIDA, "range_source": SUPUESTO},
    {"id": "MARR", "name": "Monitor de Area Recinto del Reactor", "unit": "uSv/h", "group": "SMA",
     "min": 0, "max": 100, "nominal": 8.0, "kind": MEDIDA, "range_source": SUPUESTO},
    {"id": "MATM", "name": "Monitor de Area Boca de Taller Mantenimiento", "unit": "uSv/h", "group": "SMA",
     "min": 0, "max": 50, "nominal": 1.2, "kind": MEDIDA, "range_source": SUPUESTO},
    {"id": "MAAE", "name": "Monitor de Area Area Especial", "unit": "uSv/h", "group": "SMA",
     "min": 0, "max": 50, "nominal": 2.0, "kind": MEDIDA, "range_source": SUPUESTO},
    {"id": "NDSC", "name": "Nivel de Disparo Monitor Sala de Control", "unit": "uSv/h", "group": "SMA",
     "min": 0, "max": 50, "nominal": 25.0, "kind": CONSIGNA, "range_source": SUPUESTO},
    {"id": "NDBT", "name": "Nivel de Disparo Monitor Boca de Tanque", "unit": "uSv/h", "group": "SMA",
     "min": 0, "max": 100, "nominal": 50.0, "kind": CONSIGNA, "range_source": SUPUESTO},
    {"id": "NDRR", "name": "Nivel de Disparo Monitor Recinto del Reactor", "unit": "uSv/h", "group": "SMA",
     "min": 0, "max": 100, "nominal": 50.0, "kind": CONSIGNA, "range_source": SUPUESTO},
    {"id": "NDTM", "name": "Nivel de Disparo Monitor Taller de Mantenimiento", "unit": "uSv/h", "group": "SMA",
     "min": 0, "max": 50, "nominal": 25.0, "kind": CONSIGNA, "range_source": SUPUESTO},
    {"id": "NDAE", "name": "Nivel de Disparo Monitor Area Especial", "unit": "uSv/h", "group": "SMA",
     "min": 0, "max": 50, "nominal": 25.0, "kind": CONSIGNA, "range_source": SUPUESTO},

    # --- SCM: circuito de moderador ---------------------------------------
    # SUPUESTO: a 10 W de potencia no hay calentamiento apreciable, asi que
    # las temperaturas se mueven alrededor del ambiente y los caudales son
    # chicos.
    {"id": "TT1", "name": "Temperatura del Tanque 1", "unit": "C", "group": "SCM",
     "min": 15, "max": 40, "nominal": 22.5, "kind": MEDIDA, "range_source": SUPUESTO},
    {"id": "TN1", "name": "Temperatura del Nucleo 1", "unit": "C", "group": "SCM",
     "min": 15, "max": 40, "nominal": 23.0, "kind": MEDIDA, "range_source": SUPUESTO},
    {"id": "NT1", "name": "Nivel del Tanque 1", "unit": "%", "group": "SCM",
     "min": 0, "max": 100, "nominal": 95.0, "kind": MEDIDA, "range_source": SUPUESTO},
    {"id": "NN1", "name": "Nivel del Nucleo 1", "unit": "%", "group": "SCM",
     "min": 0, "max": 100, "nominal": 98.0, "kind": MEDIDA, "range_source": SUPUESTO},
    {"id": "QIN", "name": "Caudal de Ingreso al Nucleo", "unit": "L/min", "group": "SCM",
     "min": 0, "max": 50, "nominal": 28.0, "kind": MEDIDA, "range_source": SUPUESTO},
    {"id": "QTM", "name": "Caudal Total de Moderador", "unit": "L/min", "group": "SCM",
     "min": 0, "max": 100, "nominal": 45.0, "kind": MEDIDA, "range_source": SUPUESTO},
    {"id": "QRD", "name": "Caudal de Recirculacion despues", "unit": "L/min", "group": "SCM",
     "min": 0, "max": 50, "nominal": 20.0, "kind": MEDIDA, "range_source": SUPUESTO},

    # --- SBC: barras de control -------------------------------------------
    # La escala 0-100% es por definicion de la magnitud, no un supuesto de
    # escala; los nominales si lo son.
    {"id": "POSBC1", "name": "Posicion Barra de Control 1", "unit": "%", "group": "SBC",
     "min": 0, "max": 100, "nominal": 58.2, "kind": MEDIDA, "range_source": SUPUESTO},
    {"id": "POSBC2", "name": "Posicion Barra de Control 2", "unit": "%", "group": "SBC",
     "min": 0, "max": 100, "nominal": 54.7, "kind": MEDIDA, "range_source": SUPUESTO},
    {"id": "POSBC3", "name": "Posicion Barra de Control 3", "unit": "%", "group": "SBC",
     "min": 0, "max": 100, "nominal": 49.4, "kind": MEDIDA, "range_source": SUPUESTO},
    {"id": "POSBC4", "name": "Posicion Barra de Control 4", "unit": "%", "group": "SBC",
     "min": 0, "max": 100, "nominal": 46.8, "kind": MEDIDA, "range_source": SUPUESTO},

    # --- SSO: supervision de operacion ------------------------------------
    # SUPUESTO para reactividad: en operacion estacionaria el reactor esta
    # critico, o sea reactividad 0, y el rango tipico de un reactor de
    # investigacion es de algunos cientos de pcm.
    {"id": "REACTM4", "name": "Reactividad", "unit": "pcm", "group": "SSO",
     "min": -300, "max": 300, "nominal": 0.0, "kind": MEDIDA, "range_source": SUPUESTO},
    {"id": "POTM4", "name": "Potencia", "unit": "W", "group": "SSO",
     "min": 0.0, "max": 10.0, "nominal": 5.0, "kind": MEDIDA, "range_source": CONFIRMADO},
]

REACTOR_VARIABLES_BY_ID = {variable["id"]: variable for variable in REACTOR_VARIABLES}


def sample_column(variable_id: str) -> str:
    """Columna de `reactor_samples` donde se guarda la señal.

    La convencion es el ID del catalogo en minusculas (LOGA1 -> loga1).
    Existe como funcion, y no como una clave mas del catalogo, para tener un
    unico lugar donde cambiarla si algun identificador del I&C no sirviera
    como nombre de columna.
    """
    return variable_id.lower()

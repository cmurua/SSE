from pydantic import BaseModel


class ReactorVariable(BaseModel):
    """Una señal del catalogo, tal como la consume el frontend.

    Es la proyeccion de una entrada de variable_catalog.py: se exponen los
    metadatos que el selector y los graficos necesitan, no los internos.
    """

    id: str
    name: str
    unit: str
    # Codigo del subsistema del I&C (SA1, SMA, SCM...) y su nombre legible.
    # Van los dos para que el frontend pueda agrupar por un valor estable y
    # mostrar un titulo sin tener que duplicar la tabla de nombres.
    group: str
    group_name: str
    # Rango de escala esperado y valor tipico de operacion. Los graficos de
    # RF05 los usan para los ejes; ninguno se valida contra la muestra.
    min: float
    max: float
    nominal: float
    # "medida" o "consigna". Una consigna es un umbral configurado (los
    # niveles de disparo), no una medicion: al graficarla corresponde una
    # linea de referencia y no una serie.
    kind: str


class ReactorSample(BaseModel):
    operation_id: str
    timestamp: str
    values: dict[str, float]

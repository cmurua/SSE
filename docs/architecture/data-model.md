# Modelo de datos (borrador)

## operations
id, name, started_at, ended_at, operator, notes.

Una operacion **abierta** es la que no tiene fecha de cierre
(`ended_at IS NULL`): el reactor esta operando y siguen llegando
muestras. Cerrarla es escribir `ended_at`. La duracion no se persiste:
se deriva de `ended_at - started_at`, que ademas es la unica forma
consistente de tratar una operacion todavia abierta.

La fila abierta es la **proyeccion** de la senal SERMO, no su origen:
SERMO llega por MQTT desde la FPGA y `ReactorStateService` es el unico
que abre y cierra estas filas (ADR 0004). "Hay una operacion abierta"
sigue siendo equivalente a "el reactor opera", pero el estado se
consulta en memoria, no con un SELECT.

**Invariante:** como maximo una operacion abierta a la vez, garantizada
por un indice unico parcial sobre `(ended_at IS NULL)` — indice sobre la
expresion y no sobre la columna, porque en Postgres dos NULL no chocan
entre si (migracion `a1c3f7d2e910`). Con dos abiertas, "cual es la
operacion en curso" no tendria respuesta y las muestras de tiempo real
no sabrian a cual pertenecen.

**PENDIENTE:** el nombre y el operador de una operacion. La FPGA no los
conoce y el sistema es de solo lectura, asi que hoy se generan
(`Operacion <fecha> <hora>`, operador `Desconocido`). Ver ADR 0004.

## reactor_samples
Tabla ancha: id, operation_id (FK), timestamp, + 1 columna por variable
(~30, ver `app/domains/reactor_data/variable_catalog.py`; el nombre de
columna es el ID del catalogo en minusculas). Todas Float y nullable:
una muestra puede llegar incompleta. Misma estructura para datos en
tiempo real (filas que van llegando) e historicos (operacion ya
cerrada). Indice compuesto `(operation_id, timestamp)`, que es como
consultan las series temporales de RF05 y RF06.

**ASUNCION:** el listado exacto de variables (nombres, unidades, rangos)
esta tomado del prototipo de frontend a modo de ejemplo y debe
confirmarse contra la documentacion real del SIR/I&C antes de fijar el
esquema definitivo — agregar/quitar columnas despues implica una
migracion Alembic.

## refresh_tokens / login_attempts
Soporte de auth (RF01-03): revocacion de sesion y control de intentos
fallidos.

## reports
Sugerencias y reportes de error (RF08).

## audit_logs
Trazabilidad (RNF03): accesos, errores, exportaciones, consultas,
conexiones WebSocket.

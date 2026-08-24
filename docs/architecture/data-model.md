# Modelo de datos (borrador)

## operations
id, name, started_at, ended_at, operator, notes.

Una operacion **abierta** es la que no tiene fecha de cierre
(`ended_at IS NULL`): el reactor esta operando y siguen llegando
muestras. Cerrarla es escribir `ended_at`. La duracion no se persiste:
se deriva de `ended_at - started_at`, que ademas es la unica forma
consistente de tratar una operacion todavia abierta.

**PENDIENTE:** la tarea 2.1 decide si SERMO se deriva de esta tabla
(opcion 1) o de una senal dedicada. El esquema soporta la opcion 1; si
gana otra, `ended_at` queda como metadato de la operacion.

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

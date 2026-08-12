# Modelo de datos (borrador)

## operations
id, name, date, duration_minutes, operator, notes.

## reactor_samples
Tabla ancha: id, operation_id (FK), timestamp, + 1 columna por variable
(~30, ver `app/domains/reactor_data/variable_catalog.py`). Misma
estructura para datos en tiempo real (filas que van llegando) e
historicos (operacion ya cerrada).

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

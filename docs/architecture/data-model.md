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
Tabla ancha: id, operation_id (FK), timestamp, + 1 columna por señal
(34, ver `app/domains/reactor_data/variable_catalog.py`; el nombre de
columna es el ID del catalogo en minusculas). Todas Float y nullable:
una muestra puede llegar incompleta. Misma estructura para datos en
tiempo real (filas que van llegando) e historicos (operacion ya
cerrada). Indice compuesto `(operation_id, timestamp)`, que es como
consultan las series temporales de RF05 y RF06.

### Catalogo de señales

El listado de señales es el **real del RA-0**, aportado por el equipo del
reactor (tarea 3.9). Ya no sale del prototipo de frontend. La designacion
completa de cada señal lleva el prefijo `SM` (ej. `SM LogA1`), constante
en las 34 y por eso fuera del `id`.

Agrupadas por subsistema del I&C:

| Grupo | Señales | Que mide |
|---|---|---|
| SA1 / SA2 | LOGA1, TA1, LOGA2, TA2 | Canales de arranque: logaritmico y tasa |
| SM1 / SM2 | LOGM1, TM1, LOGM2, TM2 | Canales de marcha: logaritmico y tasa |
| SMP | LCM4, LINM4 | Canal lineal de marcha |
| SP2 | NDCM4 | Proteccion: disparo del canal de marcha |
| SMA | MASC, MABT, MARR, MATM, MAAE + NDSC, NDBT, NDRR, NDTM, NDAE | Monitores de area y sus niveles de disparo |
| SCM | TT1, TN1, NT1, NN1, QIN, QTM, QRD | Circuito de moderador: temperaturas, niveles, caudales |
| SBC | POSBC1-4 | Posicion de las barras de control |
| SSO | REACTM4, POTM4 | Reactividad y potencia |

**Lo confirmado y lo asumido se distingue por campo, no por archivo.**
`id`, `name` y `group` salen del listado real y son los que fijan el
esquema: cambiarlos implica una migracion Alembic. En cambio `min`,
`max`, `nominal` y `unit` estan declarados en el listado para solo 5 de
las 34 señales (NDCM4 y LCM4 en 0.0-1.0 V, LOGA1/LOGA2 en 1-10^5 c/s,
POTM4 en 0.0-10.0 W); el resto son supuestos, marcados en el catalogo
con `range_source="supuesto"`. Esos no tocan el esquema — solo alimentan
la fuente simulada y los ejes de los graficos — asi que corregirlos es
editar un diccionario. Filtrar por ese campo da la lista exacta de lo
que falta confirmar contra la documentacion del I&C.

Cada señal declara ademas un `kind`: `medida` (varia con la operacion) o
`consigna` (un umbral configurado, como los niveles de disparo). La
fuente simulada emite las consignas planas en su nominal, porque un
nivel de disparo que oscila solo no existe.

### Diferencias contra el catalogo provisional

El catalogo anterior tenia 33 variables inventadas a partir del mock del
prototipo; el real tiene 34. **Ningun identificador coincide**, y los
grupos son otros: el provisional agrupaba por tema (Nucleo,
Refrigeracion, Sala, Quimica) y el real por subsistema del I&C.

Lo que mas cambia no es el listado sino la estructura. El real tiene
**cadenas redundantes**: dos canales de arranque independientes (SA1,
SA2) y dos de marcha (SM1, SM2), cada uno con su logaritmico y su tasa.
Esa redundancia es de diseño de seguridad y el mock no la tenia. Tambien
aparecen los **niveles de disparo** (NDSC, NDBT, NDRR, NDTM, NDAE, NDCM4),
que son consignas y no mediciones — una categoria que antes no existia.

Algunas variables del provisional tienen correspondencia conceptual
aunque cambien de nombre: `POS_BR1..4` → `POSBC1..4`, `POT_NUC` →
`POTM4`, `REA_NEU` → `REACTM4`, `TEM_NUC` → `TN1`, `NIV_MOD`/`NIV_PIL` →
`NN1`/`NT1`, y las dosis `DOS_*` → los monitores de area `MA**`.

En cambio **desaparecen por completo** las que el prototipo invento y el
reactor no instrumenta en este listado: sala y ambiente (`TEM_AMB`,
`HUM_AMB`, `PRE_ATM`), electrico (`TEN_RED`, `COR_BOM`, `EST_BOM`),
ventilacion (`CAU_VEN`, `PRE_VEN`) y quimica del agua (`CON_PH`,
`CON_O2`, `CON_CON`). Con `EST_BOM` se va tambien la unica variable
booleana, y con ella el caso especial que la fuente simulada tenia para
redondearla a 0/1.

Como no hay correspondencia de columnas, la migracion `8a9c3062a7f0` no
convierte datos: elimina las columnas viejas y crea las nuevas, dejando
en NULL las muestras ya cargadas. En desarrollo se regeneran con
`scripts/db/seed.py --reset`.

## refresh_tokens / login_attempts
Soporte de auth (RF01-03): revocacion de sesion y control de intentos
fallidos.

## reports
Sugerencias y reportes de error (RF08).

## audit_logs
Trazabilidad (RNF03): accesos, errores, exportaciones, consultas,
conexiones WebSocket.

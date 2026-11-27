# Zona horaria del reactor. Todo se guarda en UTC; esta zona solo se usa para
# lo que el usuario lee o elige como hora del calendario del RA-0: los dias de
# los filtros de historicos y el nombre por defecto de una operacion.
from zoneinfo import ZoneInfo

LOCAL_TIMEZONE = ZoneInfo("America/Argentina/Cordoba")

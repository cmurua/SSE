# Catalogo de topicos MQTT. Es el espejo en codigo de
# docs/architecture/mqtt-protocol.md, que es el contrato acordado con quien
# programa la FPGA: cambiar un nombre aca sin actualizar ese documento deja el
# firmware publicando en un topico que nadie escucha.
#
# El valor efectivo se lee de Settings (MQTT_TOPIC_SERMO), porque el prefijo
# puede cambiar entre el broker de desarrollo y el del reactor. Lo de aca es el
# default documentado, no una constante inmutable.

# Senal de operacion del reactor. La publica la FPGA, la consume el backend.
# Retenido (retain=True): un backend que arranca despues de la transicion
# igual recibe el ultimo valor conocido apenas se suscribe.
DEFAULT_SERMO_TOPIC = "ra0/sermo"

# QoS 1 (at-least-once). QoS 0 perderia una transicion ante un corte de red y
# el reactor quedaria mostrandose detenido mientras opera; QoS 2 agrega dos
# vueltas de handshake que no hacen falta, porque el consumidor es idempotente
# (ver ReactorStateService.on_sermo_changed: solo actua en el cambio).
SERMO_QOS = 1

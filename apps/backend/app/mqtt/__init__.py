# Transporte MQTT: recepcion de la senal SERMO que publica la FPGA.
#
# Este paquete es simetrico a `app/websocket/`: no sabe nada de reactor ni de
# negocio, solo de conexiones, topicos y payloads. Quien decide que hacer con
# una transicion de SERMO es domains/reactor_state.

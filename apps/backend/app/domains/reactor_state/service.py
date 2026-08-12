# Mantiene el estado SERMO (operando / detenido) y notifica al
# websocket.manager cuando cambia. Fuente del dato: SSO (aun sin
# integracion confirmada - ver docs/architecture/overview.md, supuestos).
class ReactorStateService:
    def get_current_state(self) -> dict:
        raise NotImplementedError

    def on_sermo_changed(self, sermo: bool) -> None:
        raise NotImplementedError

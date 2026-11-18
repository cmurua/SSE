export interface ReactorVariable {
  id: string;
  name: string;
  unit: string;
  group: string;
}

// Estado de operacion del reactor. Espejo de
// app/domains/reactor_state/schemas.py::ReactorState: lo devuelve
// GET /reactor-state y llega como `data` del evento `state_changed`.
export type ReactorStatus = "OPERACION" | "DETENIDO";

export interface ReactorState {
  sermo: boolean;
  status: ReactorStatus;
  updated_at: string; // ISO 8601, UTC
  operation_id: string | null; // null siempre que sermo sea false
  // false = el backend no esta recibiendo la senal: no se sabe si el reactor
  // opera. NO es "detenido": `sermo` conserva el ultimo valor conocido.
  source_connected: boolean;
}

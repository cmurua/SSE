// Una senal del catalogo. Espejo de
// app/domains/reactor_data/schemas.py::ReactorVariable: lo devuelve
// GET /reactor-data/variables.
export interface ReactorVariable {
  id: string; // ID del catalogo: el que se manda en `subscribe`
  name: string;
  unit: string;
  group: string; // codigo del subsistema del I&C (SA1, SMA, SCM...)
  group_name: string; // nombre legible del grupo
  // Rango de escala esperado y valor tipico de operacion. Para los ejes; no
  // se valida contra la muestra.
  min: number;
  max: number;
  nominal: number;
  // "consigna" = umbral configurado (niveles de disparo), no una medicion.
  kind: ReactorVariableKind;
}

export type ReactorVariableKind = "medida" | "consigna";

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

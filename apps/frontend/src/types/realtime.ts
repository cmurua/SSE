// Contrato de realtime.samples. Espejo de app/domains/realtime/schemas.py;
// la forma de cada mensaje esta en docs/architecture/websocket-protocol.md.

/** `data` de `sample`: una muestra con las variables elegidas y las de
 *  `always_variables`. */
export interface RealtimeSample {
  operation_id: string;
  timestamp: string; // ISO 8601, UTC: cuando se tomo la muestra
  // null = el canal no publico nada en esa muestra. NO es un 0 medido.
  values: Record<string, number | null>;
}

/** `data` de `subscribed`: la seleccion vigente en el servidor. */
export interface RealtimeSubscription {
  operation_id: string;
  variables: string[];
  /** Las que llegan en todas las muestras sin pedirlas ni contar en el tope
   *  de 2: hoy, las barras de control (grupo SBC). */
  always_variables: string[];
}

export type RealtimeErrorCode = "invalid_message" | "unknown_variable" | "too_many_variables";

/** `data` de `error`: un `subscribe` rechazado. La conexion sigue y la
 *  seleccion anterior queda intacta. */
export interface RealtimeError {
  // string y no RealtimeErrorCode: un codigo nuevo del backend no tiene que
  // descartar el mensaje. Comparar contra RealtimeErrorCode al usarlo.
  code: string;
  message: string;
}

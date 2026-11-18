// Suscribe al topico realtime.samples. Solo debe usarse cuando
// useReactorState().sermo === true (RF04); si no, RealtimePage ya muestra
// "no disponible" (con el enlace a historicos) o "sin conexion".
export function useRealtimeSocket() {
  throw new Error("TODO: implementar con services/websocket/wsClient");
}

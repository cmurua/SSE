// Suscribe al topico realtime.samples. Solo debe usarse cuando
// useReactorState().sermo === true (RF04); si sermo es false, la pagina
// debe mostrar el estado "no disponible" y redirigir a historicos.
export function useRealtimeSocket() {
  throw new Error("TODO: implementar con services/websocket/wsClient");
}

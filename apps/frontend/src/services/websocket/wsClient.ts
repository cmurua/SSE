// Manager generico de WebSocket con reconexion. Los topicos concretos
// (realtime.samples, reactor.state) se definen en topics.ts y deben
// mantenerse en sync con app/websocket/events.py del backend.
export function createWsClient(_topic: string) {
  throw new Error("TODO: implementar conexion + reconexion + parsing de eventos");
}

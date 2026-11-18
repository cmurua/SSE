// WebSocket en memoria para tests: registra cada instancia creada y deja que
// el test dispare a mano la apertura, los mensajes y el cierre del servidor.
// Se instala con `vi.stubGlobal("WebSocket", FakeWebSocket)`.
export class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  static reset(): void {
    FakeWebSocket.instances = [];
  }

  static last(): FakeWebSocket {
    const ws = FakeWebSocket.instances.at(-1);
    if (ws === undefined) throw new Error("No se creo ningun WebSocket");
    return ws;
  }

  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  sent: string[] = [];
  closedByClientWith: number | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number): void {
    this.closedByClientWith = code ?? 1005;
  }

  // --- Lado del servidor ---------------------------------------------------

  serverOpen(): void {
    this.onopen?.();
  }

  serverSend(data: unknown): void {
    this.onmessage?.({ data: typeof data === "string" ? data : JSON.stringify(data) });
  }

  networkError(): void {
    this.onerror?.();
  }

  serverClose(code: number): void {
    this.onclose?.({ code });
  }
}

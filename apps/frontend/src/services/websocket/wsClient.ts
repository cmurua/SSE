// Manager generico de WebSocket con reconexion. Los topicos concretos
// (realtime.samples, reactor.state) se definen en topics.ts y deben
// mantenerse en sync con app/websocket/events.py del backend.
//
// No sabe nada de reactor: abre la conexion con el access token de la sesion,
// entrega cada evento ya parseado y decide si reconectar segun el codigo de
// cierre (tabla "Codigos de cierre" en docs/architecture/websocket-protocol.md).
// Que hacer con cada evento lo decide quien lo crea.
import { forceLogout, getAccessToken, refreshAccessToken } from "@/services/api/httpClient";
import { WS_ACCESS_TOKEN_PARAM, WS_CLOSE_CODES, WS_TOPIC_PATHS, type WsTopic } from "./topics";

export const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL;

/** Sobre comun de todo mensaje del servidor. `data` queda sin tipar: su forma
 *  depende de `type` y la interpreta quien despacha. */
export interface WsEvent {
  type: string;
  data: unknown;
}

/**
 * - `connecting`: primer intento tras `connect()`.
 * - `open`: conectado.
 * - `reconnecting`: la conexion se perdio (o el intento fallo) y hay un
 *   reintento en curso o programado.
 * - `closed`: sin conexion y sin reintento: no se llamo a `connect()`, se
 *   llamo a `close()`, no hay sesion, o el servidor cerro con un codigo que no
 *   admite reintento (1008, 4409).
 */
export type WsStatus = "connecting" | "open" | "reconnecting" | "closed";

export interface WsClientOptions {
  onEvent: (event: WsEvent) => void;
  onStatusChange?: (status: WsStatus) => void;
}

export interface WsClient {
  /** Abre la conexion. No hace nada si ya esta abierta o intentandolo. */
  connect(): void;
  /** Cierra la conexion y cancela cualquier reintento pendiente. */
  close(): void;
  /** Envia un mensaje JSON. false si la conexion no esta abierta. */
  send(message: unknown): boolean;
  readonly status: WsStatus;
}

// Backoff exponencial: 1 s, 2 s, 4 s... hasta 30 s. El tope evita que un
// backend caido un buen rato deje al cliente esperando minutos despues de
// volver.
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;

// Tope para que un intento de conexion se abra. Sin el, un intento que nunca
// termina (una red que descarta los paquetes sin rechazarlos) dejaria al
// cliente esperando para siempre, sin reintentar.
export const CONNECT_TIMEOUT_MS = 10_000;

// Codigo normal de RFC 6455, para los cierres que pide el propio cliente.
const NORMAL_CLOSURE = 1000;
// Cierre anormal: el que reporta el navegador cuando la conexion no se pudo
// establecer o se corto sin frame de cierre.
const ABNORMAL_CLOSURE = 1006;

export function backoffDelay(attempt: number): number {
  const ceiling = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** attempt);
  // Mitad fija y mitad al azar: cuando el backend reinicia, todos los
  // clientes pierden la conexion en el mismo instante, y sin el azar
  // volverian todos juntos en cada reintento.
  return ceiling / 2 + Math.random() * (ceiling / 2);
}

function buildUrl(topic: WsTopic, token: string): string {
  // El navegador no deja mandar headers en el handshake: el token va en la
  // query (RFC 6750 2.3), ver docs/decisions/0005-autenticacion-websocket.md.
  const query = new URLSearchParams({ [WS_ACCESS_TOKEN_PARAM]: token });
  return `${WS_BASE_URL}${WS_TOPIC_PATHS[topic]}?${query}`;
}

function parseEvent(raw: unknown): WsEvent | null {
  // Ningun topico manda binarios.
  if (typeof raw !== "string") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const { type, data } = parsed as { type?: unknown; data?: unknown };
  return typeof type === "string" ? { type, data } : null;
}

export function createWsClient(topic: WsTopic, options: WsClientOptions): WsClient {
  let socket: WebSocket | null = null;
  let status: WsStatus = "closed";
  let attempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let connectTimer: ReturnType<typeof setTimeout> | null = null;
  // Cambia con cada connect() y close(). Una renovacion de token que termina
  // despues lo compara para no revivir una conexion que ya se cerro.
  let generation = 0;

  function setStatus(next: WsStatus): void {
    if (next === status) return;
    status = next;
    options.onStatusChange?.(next);
  }

  function clearConnectTimer(): void {
    if (connectTimer === null) return;
    clearTimeout(connectTimer);
    connectTimer = null;
  }

  /** Da por fallido un intento que no llego a abrirse. */
  function abandon(ws: WebSocket): void {
    clearConnectTimer();
    socket = null;
    ws.close();
    handleClose(ABNORMAL_CLOSURE);
  }

  function open(): void {
    const token = getAccessToken();
    if (token === null) {
      // Sin sesion el servidor rechazaria con 1008: no tiene sentido intentar.
      setStatus("closed");
      return;
    }

    const ws = new WebSocket(buildUrl(topic, token));
    socket = ws;
    let opened = false;
    connectTimer = setTimeout(() => {
      if (socket === ws) abandon(ws);
    }, CONNECT_TIMEOUT_MS);

    // Cada handler se fija si `ws` sigue siendo el socket vigente: uno viejo,
    // reemplazado o cerrado por close(), puede disparar eventos tarde.
    ws.onopen = () => {
      if (socket !== ws) return;
      clearConnectTimer();
      opened = true;
      attempt = 0;
      setStatus("open");
    };
    ws.onmessage = (message: MessageEvent) => {
      if (socket !== ws) return;
      const event = parseEvent(message.data);
      // Un mensaje fuera del contrato se descarta: cortar la conexion por eso
      // dejaria sin datos a la pantalla por un error del que publica.
      if (event === null) {
        console.warn(`[ws ${topic}] mensaje descartado, no respeta el sobre {type, data}`);
        return;
      }
      options.onEvent(event);
    };
    ws.onerror = () => {
      // Un error antes de abrir es un intento fallido. El estandar lo hace
      // seguir de un close 1006, pero no todas las implementaciones lo
      // disparan (el WebSocket de Node 20 no), asi que no se lo espera. Con
      // la conexion abierta, en cambio, se espera al close: trae el codigo.
      if (socket !== ws || opened) return;
      abandon(ws);
    };
    ws.onclose = (close: CloseEvent) => {
      if (socket !== ws) return;
      clearConnectTimer();
      socket = null;
      handleClose(close.code);
    };
  }

  function handleClose(code: number): void {
    switch (code) {
      case WS_CLOSE_CODES.POLICY_VIOLATION:
        // Token invalido: reintentar con el mismo no sirve, hay que volver a
        // iniciar sesion.
        setStatus("closed");
        forceLogout();
        return;
      case WS_CLOSE_CODES.REACTOR_NOT_OPERATING:
        // Solo realtime.samples. Reintentar en loop no cambia nada: quien usa
        // el cliente espera a que reactor.state informe sermo = true y vuelve
        // a llamar a connect().
        setStatus("closed");
        return;
      case WS_CLOSE_CODES.TOKEN_EXPIRED:
        void renewAndReconnect();
        return;
      default:
        // 1006 (red, servidor caido), 1013 (cliente lento), 1012 (reinicio
        // del servidor) y cualquier otro: reconectar con backoff.
        scheduleReconnect();
    }
  }

  function scheduleReconnect(): void {
    setStatus("reconnecting");
    const delay = backoffDelay(attempt);
    attempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      open();
    }, delay);
  }

  async function renewAndReconnect(): Promise<void> {
    setStatus("reconnecting");
    const current = generation;
    const token = await refreshAccessToken();
    if (current !== generation) return;

    if (token === null) {
      setStatus("closed");
      forceLogout();
      return;
    }
    // Con backoff y no al instante: si el servidor rechazara tambien el token
    // nuevo (p. ej. relojes desfasados), un reintento inmediato seria un loop.
    scheduleReconnect();
  }

  return {
    connect() {
      if (status !== "closed") return;
      generation += 1;
      attempt = 0;
      setStatus("connecting");
      open();
    },

    close() {
      generation += 1;
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      clearConnectTimer();
      const ws = socket;
      // Se suelta antes de cerrar para que su onclose no programe un reintento.
      socket = null;
      ws?.close(NORMAL_CLOSURE);
      setStatus("closed");
    },

    send(message) {
      if (socket === null || status !== "open") return false;
      socket.send(JSON.stringify(message));
      return true;
    },

    get status() {
      return status;
    },
  };
}

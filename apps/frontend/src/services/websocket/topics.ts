// Debe reflejar exactamente app/websocket/events.py::WSTopic del backend.
export const WS_TOPICS = {
  REALTIME_SAMPLES: "realtime.samples",
  REACTOR_STATE: "reactor.state",
} as const;

// Debe reflejar app/websocket/events.py::WSCloseCode. Que hacer ante cada
// uno: docs/architecture/websocket-protocol.md.
export const WS_CLOSE_CODES = {
  POLICY_VIOLATION: 1008, // token ausente/invalido: volver al login
  TRY_AGAIN_LATER: 1013, // cliente lento: reconectar con backoff
  TOKEN_EXPIRED: 4401, // renovar con el refresh token y reconectar
} as const;

// Nombre fijado por RFC 6750 2.3; el backend lo lee en
// app/websocket/dependencies.py::ACCESS_TOKEN_QUERY_PARAM.
export const WS_ACCESS_TOKEN_PARAM = "access_token";

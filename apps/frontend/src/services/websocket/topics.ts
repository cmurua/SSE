// Debe reflejar exactamente app/websocket/events.py::WSTopic del backend.
export const WS_TOPICS = {
  REALTIME_SAMPLES: "realtime.samples",
  REACTOR_STATE: "reactor.state",
} as const;

// Rutas de la API, relativas a VITE_API_BASE_URL (que ya incluye /api/v1).
// Centralizarlas evita que un cambio de contrato obligue a buscar strings
// sueltos por todos los features. Las que llevan parametros son funciones,
// para no armar los paths concatenando en cada llamador.
export const ENDPOINTS = {
  auth: {
    login: "/auth/login",
    refresh: "/auth/refresh",
    logout: "/auth/logout",
  },
  reactorState: "/reactor-state",
  realtimeStatus: "/realtime/status",
  historicals: {
    operations: "/historicals/operations",
    operation: (operationId: string) => `/historicals/operations/${operationId}`,
    operationSamples: (operationId: string) =>
      `/historicals/operations/${operationId}/samples`,
  },
  reports: "/reports",
  exportsLog: "/exports/log",
  helpSections: "/help/sections",
} as const;

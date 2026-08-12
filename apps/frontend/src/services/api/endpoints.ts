export const ENDPOINTS = {
  auth: { login: "/auth/login", refresh: "/auth/refresh", logout: "/auth/logout" },
  reactorState: "/reactor-state",
  realtimeStatus: "/realtime/status",
  historicalsOperations: "/historicals/operations",
  reports: "/reports",
  exportsLog: "/exports/log",
} as const;

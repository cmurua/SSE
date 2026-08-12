// TanStack Query para cache de REST (historicos, catalogo de variables).
// El realtime NO pasa por aca: usa services/websocket directamente.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const queryClient = new QueryClient();

export function QueryProvider({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

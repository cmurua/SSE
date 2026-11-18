// Catalogo de senales (GET /reactor-data/variables). Es estatico: cambia con
// un deploy, asi que se pide una vez y se reutiliza entre navegaciones. El
// backend lo marca con Cache-Control de una hora; aca se usa el mismo plazo.
import { useQuery } from "@tanstack/react-query";
import { realtimeApi } from "../services/realtimeApi";

export const VARIABLE_CATALOG_KEY = ["reactor-data", "variables"] as const;

const ONE_HOUR_MS = 60 * 60 * 1000;

export function useVariableCatalog() {
  return useQuery({
    queryKey: VARIABLE_CATALOG_KEY,
    queryFn: ({ signal }) => realtimeApi.getVariables({ signal }),
    staleTime: ONE_HOUR_MS,
  });
}

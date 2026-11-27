// Catalogo de senales (GET /reactor-data/variables). Es estatico: cambia con
// un deploy, asi que se pide una vez y se reutiliza entre navegaciones (y
// entre Tiempo Real y el historico, que comparten la key). El backend lo
// marca con Cache-Control de una hora; aca se usa el mismo plazo.
import { useQuery } from "@tanstack/react-query";
import { reactorDataApi } from "@/services/api/reactorDataApi";

export const VARIABLE_CATALOG_KEY = ["reactor-data", "variables"] as const;

const ONE_HOUR_MS = 60 * 60 * 1000;

export function useVariableCatalog() {
  return useQuery({
    queryKey: VARIABLE_CATALOG_KEY,
    queryFn: ({ signal }) => reactorDataApi.getVariables({ signal }),
    staleTime: ONE_HOUR_MS,
  });
}

// Pagina del listado de historicos (GET /historicals/operations).
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ApiError } from "@/services/api/httpClient";
import { historicalsApi } from "../services/historicalsApi";
import { toApiParams, type ListFilters } from "../services/listFilters";

/** Prefijo comun de las queries de historicos, para invalidarlas juntas. */
export const HISTORICALS_KEY = ["historicals"] as const;

export function operationsListKey(filters: ListFilters) {
  return [...HISTORICALS_KEY, "operations", filters] as const;
}

/** Un 4xx no se arregla reintentando (y el 401 ya lo maneja httpClient):
 *  mostrar el error enseguida. Un 5xx o un corte de red se reintenta una vez. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status < 500) return false;
  return failureCount < 1;
}

export function useOperationsList(filters: ListFilters) {
  return useQuery({
    queryKey: operationsListKey(filters),
    queryFn: ({ signal }) => historicalsApi.listOperations(toApiParams(filters), { signal }),
    // Al cambiar de pagina o de filtros la tabla anterior sigue a la vista
    // hasta que llega la nueva, en vez de parpadear al estado "cargando".
    placeholderData: keepPreviousData,
    retry: shouldRetry,
  });
}

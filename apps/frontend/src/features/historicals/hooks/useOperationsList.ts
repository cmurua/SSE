// Pagina del listado de historicos (GET /historicals/operations).
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { historicalsApi } from "../services/historicalsApi";
import { toApiParams, type ListFilters } from "../services/listFilters";
import { retryUnlessClientError } from "./retry";

/** Prefijo comun de las queries de historicos, para invalidarlas juntas. */
export const HISTORICALS_KEY = ["historicals"] as const;

export function operationsListKey(filters: ListFilters) {
  return [...HISTORICALS_KEY, "operations", filters] as const;
}

export function useOperationsList(filters: ListFilters) {
  return useQuery({
    queryKey: operationsListKey(filters),
    queryFn: ({ signal }) => historicalsApi.listOperations(toApiParams(filters), { signal }),
    // Al cambiar de pagina o de filtros la tabla anterior sigue a la vista
    // hasta que llega la nueva, en vez de parpadear al estado "cargando".
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
  });
}

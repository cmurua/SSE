// Detalle de una operacion historica (GET /historicals/operations/{id}).
import { useQuery } from "@tanstack/react-query";
import { historicalsApi } from "../services/historicalsApi";
import { retryUnlessClientError } from "./retry";
import { HISTORICALS_KEY } from "./useOperationsList";

export function operationKey(operationId: string) {
  return [...HISTORICALS_KEY, "operation", operationId] as const;
}

export function operationDetailKey(operationId: string) {
  return [...operationKey(operationId), "detail"] as const;
}

/** Una operacion cerrada no cambia: no hace falta volver a pedirla al volver
 *  a la pantalla. Un 404 (no existe o sigue abierta) no se reintenta. */
export function useOperationDetail(operationId: string) {
  return useQuery({
    queryKey: operationDetailKey(operationId),
    queryFn: ({ signal }) => historicalsApi.getOperation(operationId, { signal }),
    staleTime: Infinity,
    retry: retryUnlessClientError,
  });
}

// Politica de reintentos de las queries de historicos.
import { ApiError } from "@/services/api/httpClient";

/** Un 4xx no se arregla reintentando (y el 401 ya lo maneja httpClient):
 *  mostrar el error enseguida. Un 5xx o un corte de red se reintenta una vez. */
export function retryUnlessClientError(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status < 500) return false;
  return failureCount < 1;
}

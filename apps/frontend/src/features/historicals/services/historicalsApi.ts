import { ENDPOINTS } from "@/services/api/endpoints";
import { httpClient, type RequestOptions } from "@/services/api/httpClient";
import type { OperationDetail, OperationPage } from "@/types/operation";

/** Parametros de GET /historicals/operations, con los nombres de la URL. El
 *  backend responde 422 ante un parametro que no conoce, asi que aca no
 *  puede viajar ningun otro. Los que valen undefined no se mandan. */
export interface OperationListParams {
  /** Primer dia incluido, AAAA-MM-DD en hora de Cordoba. */
  from?: string;
  /** Ultimo dia incluido, AAAA-MM-DD en hora de Cordoba. */
  to?: string;
  /** Texto a buscar en el id o el nombre. */
  q?: string;
  /** Pagina, empezando en 1. */
  page?: number;
  page_size?: number;
}

export const historicalsApi = {
  listOperations: (params: OperationListParams, options?: Omit<RequestOptions, "params">) =>
    httpClient.get<OperationPage>(ENDPOINTS.historicals.operations, {
      ...options,
      params: { ...params },
    }),
  getOperation: (operationId: string, options?: RequestOptions) =>
    httpClient.get<OperationDetail>(
      ENDPOINTS.historicals.operation(encodeURIComponent(operationId)),
      options,
    ),
};

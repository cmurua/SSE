import { ENDPOINTS } from "@/services/api/endpoints";
import { httpClient, type RequestOptions } from "@/services/api/httpClient";
import type { OperationDetail, OperationPage, OperationSamples } from "@/types/operation";

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

/** Tope de variables por pedido de series (MAX_SAMPLE_VARIABLES del
 *  backend): las 2 del grafico mas las del panel del nucleo. */
export const MAX_SAMPLE_VARIABLES = 8;

/** Parametros de GET /historicals/operations/{id}/samples. */
export interface OperationSamplesParams {
  /** IDs del catalogo, hasta MAX_SAMPLE_VARIABLES. Viajan separados por comas. */
  variables: readonly string[];
  /** Ventana [start, end) en segundos desde el inicio de la operacion. Sin
   *  ellos, la operacion entera. */
  start?: number;
  end?: number;
  /** Sin el, el del backend (2000). */
  max_points?: number;
}

/** Parametros de GET /historicals/operations/{id}/samples.csv. */
export interface OperationSamplesCsvParams {
  /** IDs del catalogo. Vacio = todas las variables del catalogo. */
  variables: readonly string[];
  /** Ventana [start, end) en segundos desde el inicio de la operacion. */
  start?: number;
  end?: number;
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
  getOperationSamples: (
    operationId: string,
    { variables, ...rest }: OperationSamplesParams,
    options?: Omit<RequestOptions, "params">,
  ) =>
    httpClient.get<OperationSamples>(
      ENDPOINTS.historicals.operationSamples(encodeURIComponent(operationId)),
      { ...options, params: { variables: variables.join(","), ...rest } },
    ),
  /** El CSV de la ventana, sin reducir puntos (tarea 5.8). El backend deja
   *  constancia de la descarga. Sin variables, `variables` no viaja y el
   *  backend manda todas. */
  downloadOperationSamplesCsv: (
    operationId: string,
    { variables, ...rest }: OperationSamplesCsvParams,
    options?: Omit<RequestOptions, "params">,
  ) =>
    httpClient.getBlob(ENDPOINTS.historicals.operationSamplesCsv(encodeURIComponent(operationId)), {
      ...options,
      params: { variables: variables.length > 0 ? variables.join(",") : undefined, ...rest },
    }),
};

// Series de una operacion historica (GET /historicals/operations/{id}/samples),
// ya convertidas a la forma de ChartRendererProps.data.
//
// En esta tarea (5.6) se pide la operacion entera y el backend la reduce a
// sus 2000 puntos por defecto. La ventana de analisis y la reproduccion
// (tarea 5.7) van a pedir `start` y `end`.
import { useQuery, type QueryKey } from "@tanstack/react-query";
import { samplesToSeries, type SampleSeries } from "@/features/operation-viewer/services/samples";
import type { OperationSamples } from "@/types/operation";
import { historicalsApi } from "../services/historicalsApi";
import { retryUnlessClientError } from "./retry";
import { operationKey } from "./useOperationDetail";

export function operationSamplesKey(operationId: string, variableIds: readonly string[]) {
  return [...operationKey(operationId), "samples", [...variableIds]] as const;
}

export interface OperationSeries extends SampleSeries {
  /** Las series son promedios por intervalos de `bucketSeconds`. */
  downsampled: boolean;
  bucketSeconds: number | null;
}

/** Fuera del hook para que TanStack Query no la recalcule en cada render. Las
 *  series salen de `variables` de la respuesta: son las que se pidieron. */
export function toOperationSeries(data: OperationSamples): OperationSeries {
  return {
    ...samplesToSeries(data.samples, data.variables),
    downsampled: data.downsampled,
    bucketSeconds: data.bucket_seconds,
  };
}

/** Al cambiar las variables, el grafico sigue mostrando las anteriores hasta
 *  que llegan las nuevas, en vez de vaciarse. Nunca las de otra operacion. */
function previousOfSameOperation(operationId: string) {
  return (previous: OperationSamples | undefined, previousQuery?: { queryKey: QueryKey }) =>
    previousQuery?.queryKey[2] === operationId ? previous : undefined;
}

/**
 * @param variableIds Las del grafico y las del panel del nucleo, hasta
 *   MAX_SAMPLE_VARIABLES. Sin ninguna no se pide nada.
 * @param enabled false mientras no se sabe que variables pedir (el catalogo
 *   todavia no llego), para no pedir dos veces.
 */
export function useOperationSamples(
  operationId: string,
  variableIds: readonly string[],
  enabled = true,
) {
  return useQuery({
    queryKey: operationSamplesKey(operationId, variableIds),
    queryFn: ({ signal }) =>
      historicalsApi.getOperationSamples(operationId, { variables: variableIds }, { signal }),
    select: toOperationSeries,
    enabled: enabled && variableIds.length > 0,
    placeholderData: previousOfSameOperation(operationId),
    // Las muestras de una operacion cerrada no cambian.
    staleTime: Infinity,
    retry: retryUnlessClientError,
  });
}

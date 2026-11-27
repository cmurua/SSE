// Series de una operacion historica (GET /historicals/operations/{id}/samples),
// ya convertidas a la forma de ChartRendererProps.data.
//
// Se pide la ventana de analisis (`start` y `end`, tarea 5.7) y el backend la
// reduce a sus 2000 puntos por defecto: al acercar la ventana, cada punto
// cubre menos tiempo y se ve mas detalle.
import { useQuery, type QueryKey } from "@tanstack/react-query";
import { samplesToSeries, type SampleSeries } from "@/features/operation-viewer/services/samples";
import type { OperationSamples } from "@/types/operation";
import { historicalsApi } from "../services/historicalsApi";
import type { AnalysisWindow } from "../services/playback";
import { retryUnlessClientError } from "./retry";
import { operationKey } from "./useOperationDetail";

export function operationSamplesKey(
  operationId: string,
  variableIds: readonly string[],
  win: AnalysisWindow,
) {
  return [
    ...operationKey(operationId),
    "samples",
    [...variableIds],
    { start: win.start, end: win.end },
  ] as const;
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

/** Al cambiar las variables o la ventana, el grafico sigue mostrando las
 *  series anteriores hasta que llegan las nuevas, en vez de vaciarse. Nunca
 *  las de otra operacion. */
function previousOfSameOperation(operationId: string) {
  return (previous: OperationSamples | undefined, previousQuery?: { queryKey: QueryKey }) =>
    previousQuery?.queryKey[2] === operationId ? previous : undefined;
}

/**
 * @param variableIds Las del grafico y las del panel del nucleo, hasta
 *   MAX_SAMPLE_VARIABLES. Sin ninguna no se pide nada.
 * @param win Ventana a pedir, en segundos desde el inicio de la
 *   operacion. La pagina la pasa con un retardo, para no pedir en cada paso
 *   mientras se arrastra una manija.
 * @param enabled false mientras no se sabe que variables pedir (el catalogo
 *   todavia no llego), para no pedir dos veces.
 */
export function useOperationSamples(
  operationId: string,
  variableIds: readonly string[],
  win: AnalysisWindow,
  enabled = true,
) {
  return useQuery({
    queryKey: operationSamplesKey(operationId, variableIds, win),
    queryFn: ({ signal }) =>
      historicalsApi.getOperationSamples(
        operationId,
        // El backend exige end > 0: una operacion de 0 s se pide sin `end`.
        { variables: variableIds, start: win.start, end: win.end > 0 ? win.end : undefined },
        { signal },
      ),
    select: toOperationSeries,
    enabled: enabled && variableIds.length > 0,
    placeholderData: previousOfSameOperation(operationId),
    // Las muestras de una operacion cerrada no cambian.
    staleTime: Infinity,
    retry: retryUnlessClientError,
  });
}

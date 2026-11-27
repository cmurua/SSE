// Logica del detalle de una operacion historica sin React: a donde vuelve
// "Volver al listado", que pantalla mostrar segun la respuesta del backend y
// que variables pedir. Separada de la pagina para probarla sin renderizar.
import { panelVariableIds } from "@/features/operation-viewer/services/controlBars";
import { ApiError } from "@/services/api/httpClient";
import type { ReactorVariable } from "@/types/reactor";
import { MAX_SAMPLE_VARIABLES } from "./historicalsApi";
import type { HistoricalsListLocationState } from "./listFilters";

/** Link de "Volver al listado": el listado con los filtros y la pagina que
 *  dejo en `location.state` al abrir la operacion. Sin eso (link directo, F5
 *  en otra pestana) o con algo que no es una query, el listado sin filtros. */
export function backToListHref(state: unknown): string {
  const listSearch = (state as Partial<HistoricalsListLocationState> | null)?.listSearch;
  if (typeof listSearch !== "string" || (listSearch !== "" && !listSearch.startsWith("?"))) {
    return "/historicals";
  }
  return `/historicals${listSearch}`;
}

export type DetailScreen = "loading" | "notFound" | "error" | "ready";

/** El backend responde 404 si la operacion no existe o si sigue abierta:
 *  para el usuario es lo mismo, todavia no hay una operacion historica que
 *  ver. Cualquier otro error se puede reintentar. Mientras se reintenta, la
 *  query sigue en error hasta que llega la respuesta: se muestra "cargando"
 *  para que el boton no parezca no hacer nada. */
export function detailScreen(query: {
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  error: unknown;
}): DetailScreen {
  if (query.isError && !query.isFetching) {
    return query.error instanceof ApiError && query.error.status === 404 ? "notFound" : "error";
  }
  return query.isPending || query.isError ? "loading" : "ready";
}

/**
 * Variables a pedir: las elegidas para el grafico y las del panel del nucleo,
 * sin repetir y en ese orden. Si el catalogo creciera mas alla del tope del
 * backend, se recortan las del panel y nunca las elegidas: pedir de mas
 * terminaria en un 422 y el grafico quedaria vacio.
 */
export function samplesVariableIds(
  selection: readonly string[],
  catalog: readonly ReactorVariable[] | undefined,
): string[] {
  const ids = [...new Set([...selection, ...panelVariableIds(catalog)])];
  return ids.slice(0, MAX_SAMPLE_VARIABLES);
}

/** Largo de los intervalos de la reduccion, con un decimal como mucho:
 *  "5,4" en es y "5.4" en en. */
export function formatBucketSeconds(seconds: number, language: string): string {
  return new Intl.NumberFormat(language === "en" ? "en-US" : "es-AR", {
    maximumFractionDigits: 1,
  }).format(seconds);
}

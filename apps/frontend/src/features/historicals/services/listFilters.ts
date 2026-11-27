// Logica del listado de historicos sin React: pasar de la URL a filtros y de
// vuelta, armar la query para el backend, calcular la paginacion y dar formato
// a las celdas. Separada de la pagina para probarla sin renderizar (el
// proyecto no tiene jsdom).
//
// La URL es la fuente de verdad de los filtros y la pagina
// (`/historicals?from=&to=&q=&page=`): asi el boton Atras y "Volver al
// listado" los conservan, y un link compartido abre el mismo listado.
import type { OperationListParams } from "./historicalsApi";

/** Igual que `q` en OperationSearchParams (max_length del backend). */
export const MAX_QUERY_LENGTH = 100;

/** Zona en la que el backend interpreta `from` y `to` (service.local_day_bounds).
 *  Las fechas de la tabla se muestran en la misma zona, para que una
 *  operacion que aparece al filtrar por el 9 tambien diga 9 en la tabla. */
export const OPERATION_TIME_ZONE = "America/Argentina/Cordoba";

export interface ListFilters {
  /** AAAA-MM-DD, o null sin filtro. */
  from: string | null;
  to: string | null;
  q: string | null;
  /** Pagina pedida, empezando en 1. */
  page: number;
}

export const EMPTY_FILTERS: ListFilters = { from: null, to: null, q: null, page: 1 };

/** Lo que el listado le deja al detalle en `location.state` al abrir una
 *  operacion. Con esto "Volver al listado" vuelve con los mismos filtros y la
 *  misma pagina; sin el (link directo al detalle) se vuelve a /historicals. */
export interface HistoricalsListLocationState {
  /** `location.search` del listado, por ejemplo "?q=OP&page=2" o "". */
  listSearch: string;
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2026-02-30" o "2026-13-01" no son dias: el backend responderia 422. */
function parseDay(raw: string | null): string | null {
  if (raw === null) return null;
  const match = ISO_DAY.exec(raw);
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const valid =
    date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  return valid ? raw : null;
}

/** Normaliza el texto de busqueda como lo haria el backend antes de fallar:
 *  sin espacios en los bordes, sin NUL (Postgres no lo admite) y con el
 *  largo maximo. Vacio es "sin filtro". */
export function normalizeQuery(raw: string | null): string | null {
  if (raw === null) return null;
  const clean = raw.split("\u0000").join("").trim().slice(0, MAX_QUERY_LENGTH).trim();
  return clean === "" ? null : clean;
}

function parsePage(raw: string | null): number {
  if (raw === null || !/^\d+$/.test(raw)) return 1;
  const page = Number(raw);
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}

/** Filtros a partir de la URL. Lo que no es valido se descarta en vez de
 *  mandarlo: una URL editada a mano no puede terminar en un 422 que
 *  "Reintentar" nunca va a arreglar. Si `from` es posterior a `to`, se
 *  descarta el rango entero, porque no se sabe cual de los dos esta mal. */
export function parseListParams(search: URLSearchParams): ListFilters {
  let from = parseDay(search.get("from"));
  let to = parseDay(search.get("to"));
  if (from !== null && to !== null && from > to) {
    from = null;
    to = null;
  }
  return { from, to, q: normalizeQuery(search.get("q")), page: parsePage(search.get("page")) };
}

/** Camino inverso de parseListParams. Solo escribe lo que tiene valor, y la
 *  pagina 1 no se escribe: `/historicals` y `/historicals?page=1` son el
 *  mismo listado y conviene que tengan la misma URL. */
export function toSearchParams(filters: ListFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.q) params.set("q", filters.q);
  if (filters.page > 1) params.set("page", String(filters.page));
  return params;
}

/** Query de GET /historicals/operations. `page_size` no se manda: se usa el
 *  del backend (20), que vuelve en la respuesta. */
export function toApiParams(filters: ListFilters): OperationListParams {
  return {
    from: filters.from ?? undefined,
    to: filters.to ?? undefined,
    q: filters.q ?? undefined,
    page: filters.page,
  };
}

/** Si hay algun filtro puesto (la pagina no cuenta). */
export function hasActiveFilters(filters: ListFilters): boolean {
  return filters.from !== null || filters.to !== null || filters.q !== null;
}

/** Cantidad de paginas; 0 si no hay operaciones. */
export function pageCount(total: number, pageSize: number): number {
  if (total <= 0 || pageSize <= 0) return 0;
  return Math.ceil(total / pageSize);
}

export type PageItem = number | "gap";

/** Botones de la paginacion: siempre la primera, la ultima y las vecinas de
 *  la actual; lo demas se resume en "gap" ("…"). Un hueco de una sola pagina
 *  se muestra como esa pagina, que ocupa lo mismo que los puntos suspensivos.
 *  Ej.: pagina 5 de 10 -> [1, "gap", 4, 5, 6, "gap", 10]. */
export function pageRange(current: number, pages: number): PageItem[] {
  if (pages <= 0) return [];
  const wanted = new Set([1, pages, current - 1, current, current + 1]);
  const numbers = [...wanted].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);

  const items: PageItem[] = [];
  let previous = 0;
  for (const n of numbers) {
    if (n - previous === 2) items.push(n - 1);
    else if (n - previous > 2) items.push("gap");
    items.push(n);
    previous = n;
  }
  return items;
}

/** Posicion de la pagina dentro del total, para "Mostrando 21–40 de 137".
 *  null si la pagina vino vacia. */
export function shownRange(
  page: number,
  pageSize: number,
  itemCount: number,
): { first: number; last: number } | null {
  if (itemCount <= 0) return null;
  const first = (page - 1) * pageSize + 1;
  return { first, last: first + itemCount - 1 };
}

/** Pagina a la que hay que llevar al usuario si pidio una que ya no existe
 *  (URL vieja o editada, o se borraron operaciones), o null si la pedida es
 *  valida. Con 0 operaciones no se redirige: es el estado vacio. */
export function pageToRedirect(requested: number, total: number, pageSize: number): number | null {
  const pages = pageCount(total, pageSize);
  return pages > 0 && requested > pages ? pages : null;
}

const DAY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: OPERATION_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: OPERATION_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((p) => p.type === type)?.value ?? "";
}

/** Inicio de la operacion en hora de Cordoba: dia AAAA-MM-DD (el formato del
 *  prototipo y de los filtros) y hora HH:MM. */
export function formatOperationStart(iso: string): { day: string; time: string } {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { day: "—", time: "" };
  const day = DAY_FORMAT.formatToParts(date);
  const time = TIME_FORMAT.formatToParts(date);
  return {
    day: `${part(day, "year")}-${part(day, "month")}-${part(day, "day")}`,
    time: `${part(time, "hour")}:${part(time, "minute")}`,
  };
}

/** Duracion como en el prototipo (fmtDur): 125 -> "2h 05m". */
export function formatDuration(minutes: number | null): string {
  if (minutes === null || minutes < 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/** Cantidad de muestras con separador de miles: "7.500" en es, "7,500" en en. */
export function formatSampleCount(count: number, language: string): string {
  return new Intl.NumberFormat(language === "en" ? "en-US" : "es-AR").format(count);
}

/** Que muestra la tabla: el error, las filas o el estado cargando. */
export type ResultsStatus = "loading" | "error" | "ready";

/** Estado de la tabla a partir de la query del listado. Al reintentar despues
 *  de un error (o al aplicar de nuevo los mismos filtros), la query sigue en
 *  error hasta que llega la respuesta: mientras tanto se muestra "cargando",
 *  para que el boton no parezca no hacer nada. */
export function resultsStatus(query: {
  isError: boolean;
  isFetching: boolean;
  hasData: boolean;
}): ResultsStatus {
  if (query.isError && !query.isFetching) return "error";
  return query.hasData && !query.isError ? "ready" : "loading";
}

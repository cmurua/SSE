// Puerto del listado de Histories.jsx (RF06): filtros por fecha y por id o
// nombre, tabla de operaciones cerradas y paginacion real contra
// GET /historicals/operations.
//
// Los filtros aplicados y la pagina viven en la URL
// (`?from=&to=&q=&page=`), no en estado de React: el boton Atras los
// recupera, y al abrir una operacion el listado le deja su `location.search`
// al detalle (HistoricalsListLocationState) para que "Volver al listado"
// vuelva al mismo lugar. El panel de filtros tiene su propio borrador, que
// solo pasa a la URL con "Aplicar filtros".
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { IChevronL, IChevronR, IFilter } from "@/components/icons";
import { Field } from "@/components/ui/Field";
import type { OperationListItem, OperationPage } from "@/types/operation";
import { useOperationsList } from "../hooks/useOperationsList";
import {
  EMPTY_FILTERS,
  MAX_QUERY_LENGTH,
  formatDuration,
  formatOperationStart,
  formatSampleCount,
  hasActiveFilters,
  normalizeQuery,
  pageCount,
  pageRange,
  pageToRedirect,
  parseListParams,
  resultsStatus,
  shownRange,
  toSearchParams,
  type HistoricalsListLocationState,
  type ListFilters,
  type ResultsStatus,
} from "../services/listFilters";

/** Columnas del listado, compartidas por el encabezado, las filas y el
 *  esqueleto de carga. Mismas proporciones que las 2/4/2/2/1 de 12 del
 *  prototipo, pero la ultima (el boton "Ir a la operacion") tiene ancho fijo:
 *  con 1 de 12 el boton no entraba y la tarjeta lo recortaba. Fijo y no
 *  `auto` porque cada fila es una grilla aparte: con `auto` el encabezado
 *  (sin boton) repartiria distinto y los titulos no quedarian sobre sus
 *  columnas. 8rem alcanza para el boton en es, en y pt. */
const LIST_GRID =
  "grid grid-cols-[minmax(0,2fr)_minmax(0,4fr)_minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)_8rem] gap-4";

export function HistoricalsPage() {
  const { t } = useTranslation("common");
  const [searchParams, setSearchParams] = useSearchParams();
  const { search } = useLocation();
  const filters = useMemo(() => parseListParams(searchParams), [searchParams]);
  const query = useOperationsList(filters);
  const { data, isPlaceholderData, refetch } = query;

  // Una pagina que ya no existe (URL vieja o editada) llega vacia pero con
  // total > 0: se lleva al usuario a la ultima, reemplazando la entrada del
  // historial para que Atras no lo devuelva a la pagina vacia.
  useEffect(() => {
    if (!data || isPlaceholderData) return;
    const target = pageToRedirect(filters.page, data.total, data.page_size);
    if (target !== null) {
      setSearchParams(toSearchParams({ ...filters, page: target }), { replace: true });
    }
  }, [data, isPlaceholderData, filters, setSearchParams]);

  const showFilters = (next: ListFilters) => {
    const nextSearch = toSearchParams(next);
    // Aplicar los mismos filtros no agrega una entrada repetida al
    // historial: vuelve a pedir el listado, que es lo que se espera del boton.
    if (nextSearch.toString() === toSearchParams(filters).toString()) {
      void refetch();
      return;
    }
    setSearchParams(nextSearch);
  };

  const showPage = (page: number) => {
    setSearchParams(toSearchParams({ ...filters, page }));
    window.scrollTo({ top: 0 });
  };

  const status = resultsStatus({
    isError: query.isError,
    isFetching: query.isFetching,
    hasData: data !== undefined,
  });

  return (
    <div className="space-y-5">
      <div className="banner">{t("historicals.list.title")}</div>

      <div className="grid grid-cols-12 gap-5">
        <aside className="col-span-12 lg:col-span-3 card card-pad self-start">
          <FiltersPanel
            // Si los filtros cambian por la URL (Atras, Adelante, un link), el
            // borrador se descarta y el panel vuelve a mostrar lo aplicado.
            key={`${filters.from}|${filters.to}|${filters.q}`}
            applied={filters}
            onApply={showFilters}
          />
          <div className="mt-5 pt-4 border-t border-line text-[11px] text-muted">
            <ResultsCounter status={status} data={data} />
          </div>
        </aside>

        <OperationsResults
          status={status}
          data={data}
          updating={isPlaceholderData}
          filtersActive={hasActiveFilters(filters)}
          listSearch={search}
          onRetry={() => void refetch()}
          onPageChange={showPage}
          onClearFilters={() => showFilters(EMPTY_FILTERS)}
        />
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Filtros
// --------------------------------------------------------------------------

interface FiltersPanelProps {
  applied: ListFilters;
  onApply: (filters: ListFilters) => void;
}

function FiltersPanel({ applied, onApply }: FiltersPanelProps) {
  const { t } = useTranslation("common");
  const [from, setFrom] = useState(applied.from ?? "");
  const [to, setTo] = useState(applied.to ?? "");
  const [q, setQ] = useState(applied.q ?? "");
  const rangeError = from !== "" && to !== "" && from > to;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (rangeError) return;
    // Filtros nuevos, pagina 1: la pagina en la que se estaba puede no
    // existir con el resultado nuevo.
    onApply({ from: from || null, to: to || null, q: normalizeQuery(q), page: 1 });
  };

  const clear = () => {
    setFrom("");
    setTo("");
    setQ("");
    onApply(EMPTY_FILTERS);
  };

  return (
    <form onSubmit={submit} noValidate>
      <div className="flex items-center gap-2 mb-4">
        <IFilter size={15} />
        <div className="font-semibold text-[14px]">{t("historicals.list.filters.title")}</div>
      </div>

      <Field
        label={t("historicals.list.filters.from")}
        type="date"
        name="from"
        className="mb-3"
        value={from}
        max={to || undefined}
        onChange={(e) => setFrom(e.target.value)}
        aria-invalid={rangeError || undefined}
      />
      <Field
        label={t("historicals.list.filters.to")}
        type="date"
        name="to"
        className="mb-3"
        value={to}
        min={from || undefined}
        onChange={(e) => setTo(e.target.value)}
        aria-invalid={rangeError || undefined}
      />
      {rangeError && (
        <p role="alert" className="text-bad text-[12px] -mt-1 mb-3">
          {t("historicals.list.filters.rangeError")}
        </p>
      )}
      <Field
        label={t("historicals.list.filters.q")}
        type="search"
        name="q"
        className="mb-4"
        placeholder={t("historicals.list.filters.qPlaceholder")}
        maxLength={MAX_QUERY_LENGTH}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div className="flex items-center gap-2">
        <button type="submit" className="btn-dark flex-1" disabled={rangeError}>
          {t("historicals.list.filters.apply")}
        </button>
        <button type="button" className="btn-ghost" onClick={clear}>
          {t("historicals.list.filters.clear")}
        </button>
      </div>
    </form>
  );
}

// --------------------------------------------------------------------------
// Resultados
// --------------------------------------------------------------------------

export type { ResultsStatus };

/** "Mostrando 21-40 de 137 operaciones." */
export function ResultsCounter({ status, data }: { status: ResultsStatus; data?: OperationPage }) {
  const { t } = useTranslation("common");
  if (status !== "ready" || !data) return <div>{t("historicals.list.searching")}</div>;

  const range = shownRange(data.page, data.page_size, data.items.length);
  if (range === null) return <div>{t("historicals.list.showingNone")}</div>;

  return (
    <div>
      <Trans
        t={t}
        i18nKey="historicals.list.showing"
        values={{ first: range.first, last: range.last, total: data.total }}
        components={{ n: <span className="font-mono text-[var(--ink)]" /> }}
      />
    </div>
  );
}

export interface OperationsResultsProps {
  status: ResultsStatus;
  data?: OperationPage;
  /** Hay una pagina nueva en camino y se sigue mostrando la anterior. */
  updating: boolean;
  filtersActive: boolean;
  /** `location.search` del listado, para dejarselo al detalle. */
  listSearch: string;
  onRetry: () => void;
  onPageChange: (page: number) => void;
  onClearFilters: () => void;
}

/** Tabla con sus estados (cargando, error, vacio) y la paginacion. Separada
 *  de la pagina para probar cada estado sin red. */
export function OperationsResults({
  status,
  data,
  updating,
  filtersActive,
  listSearch,
  onRetry,
  onPageChange,
  onClearFilters,
}: OperationsResultsProps) {
  const { t } = useTranslation("common");

  let body: ReactNode;
  if (status === "error") {
    body = (
      <Notice tone="error">
        {t("historicals.list.error")}
        <button type="button" className="btn-ghost mt-3 block mx-auto" onClick={onRetry}>
          {t("historicals.list.retry")}
        </button>
      </Notice>
    );
  } else if (status === "loading" || !data || (data.items.length === 0 && data.total > 0)) {
    // Lo ultimo es una pagina que ya no existe: la pagina redirige a la
    // ultima, asi que no es "sin resultados".
    body = <SkeletonRows />;
  } else if (data.items.length === 0) {
    body = (
      <Notice tone="empty">
        {filtersActive ? t("historicals.list.empty") : t("historicals.list.emptyNoData")}
        {filtersActive && (
          <button type="button" className="btn-ghost mt-3 block mx-auto" onClick={onClearFilters}>
            {t("historicals.list.clearFilters")}
          </button>
        )}
      </Notice>
    );
  } else {
    body = (
      <div className={updating ? "opacity-60 transition-opacity" : undefined} aria-busy={updating}>
        {data.items.map((operation) => (
          <OperationRow key={operation.id} operation={operation} listSearch={listSearch} />
        ))}
      </div>
    );
  }

  const pages = data ? pageCount(data.total, data.page_size) : 0;

  return (
    <section className="col-span-12 lg:col-span-9 card overflow-hidden">
      <div className={`${LIST_GRID} px-5 py-3 bg-surface-hover border-b border-line text-[11px] uppercase tracking-widest text-muted font-mono`}>
        <div>{t("historicals.list.columns.id")}</div>
        <div>{t("historicals.list.columns.operation")}</div>
        <div>{t("historicals.list.columns.date")}</div>
        <div>{t("historicals.list.columns.operator")}</div>
        <div className="text-right">{t("historicals.list.columns.samples")}</div>
        <div className="text-right normal-case tracking-normal">
          {updating && <span role="status">{t("historicals.list.updating")}</span>}
        </div>
      </div>

      {body}

      {status === "ready" && data && data.items.length > 0 && (
        <Pagination page={data.page} pages={pages} onPageChange={onPageChange} />
      )}
    </section>
  );
}

function OperationRow({
  operation,
  listSearch,
}: {
  operation: OperationListItem;
  listSearch: string;
}) {
  const { t, i18n } = useTranslation("common");
  const start = formatOperationStart(operation.started_at);
  const samples = formatSampleCount(operation.sample_count, i18n.language);
  const state: HistoricalsListLocationState = { listSearch };

  return (
    <div
      data-operation={operation.id}
      className={`${LIST_GRID} px-5 py-4 border-b border-line items-center hover-surface`}
    >
      <div className="font-mono text-[12px] font-medium break-all">{operation.id}</div>
      <div className="min-w-0">
        <div className="text-[14px] font-semibold truncate" title={operation.name}>
          {operation.name}
        </div>
        {operation.notes && (
          <div className="text-[12px] text-muted truncate" title={operation.notes}>
            {operation.notes}
          </div>
        )}
      </div>
      <div className="font-mono text-[12px]">
        {start.day}
        <div className="text-[10px] text-muted whitespace-nowrap">
          {start.time} · {formatDuration(operation.duration_minutes)}
        </div>
      </div>
      <div className="text-[12px]">{operation.operator}</div>
      <div className="text-right font-mono text-[12px]">{samples}</div>
      <div className="text-right">
        <Link
          to={`/historicals/${encodeURIComponent(operation.id)}`}
          state={state}
          aria-label={t("historicals.list.openAria", { id: operation.id })}
          className="btn-dark inline-block whitespace-nowrap !py-1.5 !px-3 !text-[11px]"
        >
          {t("historicals.list.open")}
        </Link>
      </div>
    </div>
  );
}

function Pagination({
  page,
  pages,
  onPageChange,
}: {
  page: number;
  pages: number;
  onPageChange: (page: number) => void;
}) {
  const { t } = useTranslation("common");
  const pageButton = "w-7 h-7 rounded-md text-[12px] flex items-center justify-center";

  return (
    <div className="flex items-center justify-between px-5 py-3 text-[12px] text-muted">
      <div>{t("historicals.list.page", { page, pages })}</div>
      {pages > 1 && (
        <nav aria-label={t("historicals.list.pagination")} className="flex items-center gap-1">
          <button
            type="button"
            className={`${pageButton} hover-surface disabled:opacity-40`}
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label={t("historicals.list.previous")}
          >
            <IChevronL size={12} />
          </button>
          {pageRange(page, pages).map((item, index) =>
            item === "gap" ? (
              <span key={`gap-${index}`} className="px-1" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                data-page={item}
                className={
                  `${pageButton} ` +
                  (item === page ? "bg-[var(--ink)] text-[var(--surface)]" : "hover-surface")
                }
                aria-current={item === page ? "page" : undefined}
                aria-label={t("historicals.list.goToPage", { page: item })}
                onClick={() => item !== page && onPageChange(item)}
              >
                {item}
              </button>
            ),
          )}
          <button
            type="button"
            className={`${pageButton} hover-surface disabled:opacity-40`}
            disabled={page >= pages}
            onClick={() => onPageChange(page + 1)}
            aria-label={t("historicals.list.next")}
          >
            <IChevronR size={12} />
          </button>
        </nav>
      )}
    </div>
  );
}

function Notice({ tone, children }: { tone: "error" | "empty"; children: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      data-state={tone}
      className="px-5 py-12 text-center text-muted text-[13px]"
    >
      {children}
    </div>
  );
}

const SKELETON_ROWS = 5;

function SkeletonRows() {
  const { t } = useTranslation("common");
  const bar = "h-3 rounded bg-[var(--bg-2)] animate-pulse";
  return (
    <div data-state="loading" aria-busy="true">
      <span role="status" className="sr-only">
        {t("historicals.list.loading")}
      </span>
      {Array.from({ length: SKELETON_ROWS }, (_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className={`${LIST_GRID} px-5 py-5 border-b border-line items-center`}
        >
          <div className={bar} />
          <div className={bar} />
          <div className={bar} />
          <div className={bar} />
          <div className={bar} />
          <div />
        </div>
      ))}
    </div>
  );
}

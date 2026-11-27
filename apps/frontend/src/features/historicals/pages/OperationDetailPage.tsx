// Detalle de una operacion historica (RF06, tarea 5.6). Puerto de
// HistoryDetail (Histories.jsx), con el mismo visor que Tiempo Real: las
// piezas de features/operation-viewer y el grafico via ChartRenderer.
//
// Los datos salen de REST: el detalle de GET /historicals/operations/{id} y
// las series de .../samples, la operacion entera. El panel del nucleo y los
// valores instantaneos muestran la posicion del cursor, que en esta tarea
// queda fija en la ultima muestra; la ventana de analisis y la reproduccion
// van en la 5.7.
//
// "Volver al listado" vuelve con los filtros y la pagina que el listado dejo
// en location.state (HistoricalsListLocationState).
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useParams } from "react-router-dom";
import { ChartRenderer } from "@/components/charts/ChartRenderer";
import type { ChartMode, ChartVariable } from "@/components/charts/types";
import { IAlert, IChevronL } from "@/components/icons";
import { useVariableCatalog } from "@/hooks/useVariableCatalog";
import { ChartModeToggle } from "@/features/operation-viewer/components/ChartModeToggle";
import { ControlBarsPanel } from "@/features/operation-viewer/components/ControlBarsPanel";
import { InstantValuePanel } from "@/features/operation-viewer/components/InstantValuePanel";
import { OperationStrip } from "@/features/operation-viewer/components/OperationStrip";
import { VariableSelector } from "@/features/operation-viewer/components/VariableSelector";
import { displayedChartMode } from "@/features/operation-viewer/services/chartMode";
import { latestSnapshot, panelVariableIds } from "@/features/operation-viewer/services/controlBars";
import { latestValue, type InstantValue } from "@/features/operation-viewer/services/instantValues";
import { DEFAULT_SELECTION } from "@/features/operation-viewer/services/variableSelection";
import type { OperationDetail } from "@/types/operation";
import { useOperationDetail } from "../hooks/useOperationDetail";
import { useOperationSamples } from "../hooks/useOperationSamples";
import { formatDuration, formatOperationStart, formatSampleCount } from "../services/listFilters";
import {
  backToListHref,
  detailScreen,
  formatBucketSeconds,
  type DetailScreen,
  samplesVariableIds,
} from "../services/operationDetail";

export function OperationDetailPage() {
  const { operationId = "" } = useParams();
  const location = useLocation();
  const detail = useOperationDetail(operationId);

  return (
    <OperationDetailView
      operationId={operationId}
      backHref={backToListHref(location.state)}
      screen={detailScreen(detail)}
      operation={detail.data}
      onRetry={() => void detail.refetch()}
    />
  );
}

export interface OperationDetailViewProps {
  /** El de la URL: se muestra en el titulo aunque la operacion no exista. */
  operationId: string;
  backHref: string;
  screen: DetailScreen;
  /** El detalle, con `screen` "ready". */
  operation: OperationDetail | undefined;
  onRetry: () => void;
}

/** La pantalla segun el estado del detalle. Separada de la pagina para
 *  probar cada estado sin red (el 404, por ejemplo). */
export function OperationDetailView({
  operationId,
  backHref,
  screen,
  operation,
  onRetry,
}: OperationDetailViewProps) {
  const { t } = useTranslation("common");

  return (
    <div className="space-y-5">
      <DetailHeader operationId={operationId} operation={operation} backHref={backHref} />
      {screen === "ready" && operation && <OperationViewer operation={operation} />}
      {screen === "loading" && (
        <Notice state="loading">
          <span role="status">{t("historicals.detail.loading")}</span>
        </Notice>
      )}
      {screen === "notFound" && (
        <Notice state="notFound" alert>
          <div className="text-[16px] font-semibold text-[var(--ink)]">
            {t("historicals.detail.notFound.title")}
          </div>
          <div className="mt-1">{t("historicals.detail.notFound.lead")}</div>
          <Link to={backHref} className="btn-dark inline-block mt-4">
            {t("historicals.detail.back")}
          </Link>
        </Notice>
      )}
      {screen === "error" && (
        <Notice state="error" alert>
          {t("historicals.detail.error")}
          <button type="button" className="btn-ghost mt-3 block mx-auto" onClick={onRetry}>
            {t("historicals.detail.retry")}
          </button>
        </Notice>
      )}
    </div>
  );
}

/** "Volver al listado" y el titulo. Mientras carga (o si no existe) el
 *  titulo lleva solo el ID de la URL. */
function DetailHeader({
  operationId,
  operation,
  backHref,
}: {
  operationId: string;
  operation: OperationDetail | undefined;
  backHref: string;
}) {
  const { t } = useTranslation("common");
  let title = t("historicals.detail.title", { id: operationId });
  if (operation) {
    const start = formatOperationStart(operation.started_at);
    title = t("historicals.detail.titleWithDate", {
      id: operation.id,
      date: `${start.day} ${start.time}`.trim(),
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link to={backHref} className="btn-ghost flex items-center gap-1.5">
        <IChevronL size={12} /> {t("historicals.detail.back")}
      </Link>
      <div className="banner flex-1 min-w-0">{title}</div>
    </div>
  );
}

/** Operacion, operador, duracion, muestras y notas, con la franja del visor. */
function OperationSummaryStrip({ operation }: { operation: OperationDetail }) {
  const { t, i18n } = useTranslation("common");
  return (
    <OperationStrip
      tiles={[
        {
          key: "name",
          label: t("historicals.detail.tiles.name"),
          wide: true,
          value: <span title={operation.name}>{operation.name}</span>,
        },
        { key: "operator", label: t("historicals.detail.tiles.operator"), value: operation.operator },
        {
          key: "duration",
          label: t("historicals.detail.tiles.duration"),
          mono: true,
          value: formatDuration(operation.duration_minutes),
        },
        {
          key: "samples",
          label: t("historicals.detail.tiles.samples"),
          mono: true,
          value: formatSampleCount(operation.sample_count, i18n.language),
        },
        {
          key: "notes",
          label: t("historicals.detail.tiles.notes"),
          wide: true,
          value: operation.notes ? <span title={operation.notes}>{operation.notes}</span> : "—",
        },
      ]}
    />
  );
}

/** El visor: mismo armado que RealtimeAvailable, con datos de REST. */
function OperationViewer({ operation }: { operation: OperationDetail }) {
  const { t, i18n } = useTranslation("common");
  const catalog = useVariableCatalog();
  const [selection, setSelection] = useState<string[]>(() => [...DEFAULT_SELECTION]);
  const [preferredMode, setPreferredMode] = useState<ChartMode>("time");

  // Sin el catalogo no se sabe cuales son las del panel: se espera a tenerlo
  // para no pedir las series dos veces.
  const variableIds = useMemo(
    () => samplesVariableIds(selection, catalog.data),
    [selection, catalog.data],
  );
  const samples = useOperationSamples(operation.id, variableIds, catalog.data !== undefined);
  const series = samples.data?.series ?? EMPTY_SERIES;
  // Posicion del cursor: fija en la ultima muestra hasta la tarea 5.7.
  const cursorAt = samples.data?.lastSampleAt ?? null;

  const selectedVariables = useMemo(() => {
    const byId = new Map((catalog.data ?? []).map((v) => [v.id, v]));
    return selection.map((id) => byId.get(id)).filter((v) => v !== undefined);
  }, [catalog.data, selection]);
  const chartVariables = useMemo(
    () => selectedVariables.map(({ id, name, unit }): ChartVariable => ({ id, name, unit })),
    [selectedVariables],
  );
  const mode = displayedChartMode(preferredMode, chartVariables.length);

  const instantValues = useMemo(() => {
    const values: Record<string, InstantValue | null> = {};
    for (const { id } of selectedVariables) values[id] = latestValue(series[id], cursorAt);
    return values;
  }, [selectedVariables, series, cursorAt]);
  const controlBarsSnapshot = useMemo(
    () => latestSnapshot(panelVariableIds(catalog.data), series, cursorAt),
    [catalog.data, series, cursorAt],
  );

  const statsCaption =
    samples.data?.downsampled && samples.data.bucketSeconds !== null
      ? t("historicals.detail.statsDownsampled", {
          seconds: formatBucketSeconds(samples.data.bucketSeconds, i18n.language),
        })
      : t("historicals.detail.stats");

  const noData =
    samples.isSuccess &&
    !samples.isPlaceholderData &&
    chartVariables.length > 0 &&
    chartVariables.every(({ id }) => (series[id]?.length ?? 0) === 0);

  return (
    <>
      <OperationSummaryStrip operation={operation} />
      <div className="grid grid-cols-12 gap-5">
        <aside className="col-span-12 lg:col-span-4 xl:col-span-3 self-start">
          <VariableSelector
            catalog={catalog.data}
            loading={catalog.isPending}
            failed={catalog.isError}
            onRetry={() => void catalog.refetch()}
            selection={selection}
            onChange={setSelection}
          />
        </aside>
        <section className="col-span-12 lg:col-span-8 xl:col-span-9 space-y-4">
          <ControlBarsPanel catalog={catalog.data} snapshot={controlBarsSnapshot} />
          <div className="flex flex-wrap items-center gap-3">
            <ChartModeToggle
              mode={mode}
              xyAvailable={chartVariables.length >= 2}
              onChange={setPreferredMode}
            />
            <SeriesStatus
              // Tambien al reintentar despues de un error, que sigue en error
              // hasta que llega la respuesta.
              loading={samples.isFetching && samples.data === undefined}
              updating={samples.isPlaceholderData}
              noData={noData}
            />
          </div>
          {samples.isError && !samples.isFetching && samples.data === undefined ? (
            <Notice state="seriesError" alert>
              {t("historicals.detail.series.error")}
              <button
                type="button"
                className="btn-ghost mt-3 block mx-auto"
                onClick={() => void samples.refetch()}
              >
                {t("historicals.detail.retry")}
              </button>
            </Notice>
          ) : (
            <ChartRenderer
              variables={chartVariables}
              data={series}
              mode={mode}
              title={t(`viewer.mode.${mode}`)}
              height={360}
            />
          )}
          <InstantValuePanel
            variables={selectedVariables}
            values={instantValues}
            series={series}
            statsCaption={statsCaption}
          />
        </section>
      </div>
    </>
  );
}

const EMPTY_SERIES: Record<string, never[]> = {};

/** Al lado del selector de modo: si las series estan en camino o si las
 *  elegidas no tienen datos en esta operacion. */
function SeriesStatus({
  loading,
  updating,
  noData,
}: {
  loading: boolean;
  updating: boolean;
  noData: boolean;
}) {
  const { t } = useTranslation("common");
  let text: string | null = null;
  if (loading) text = t("historicals.detail.series.loading");
  else if (updating) text = t("historicals.detail.series.updating");
  else if (noData) text = t("historicals.detail.series.empty");
  if (text === null) return null;
  return (
    <span role="status" className="text-[12px] text-muted flex items-center gap-1.5">
      {noData && <IAlert size={13} className="text-warn" />}
      {text}
    </span>
  );
}

function Notice({
  state,
  alert = false,
  children,
}: {
  state: string;
  alert?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      role={alert ? "alert" : undefined}
      data-state={state}
      className="card card-pad !py-12 text-center text-muted text-[13px]"
    >
      {children}
    </div>
  );
}

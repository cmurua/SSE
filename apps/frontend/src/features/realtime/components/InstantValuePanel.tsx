// Valor instantaneo de cada variable elegida (RF05, tarea 3.7), debajo del
// grafico. Puerto de las tarjetas de Realtime.jsx, sin la mini grafica (repite
// lo que ya muestra el grafico principal).
//
// Lee el mismo snapshot que el grafico (series, lastSampleAt), asi que los
// dos se actualizan en el mismo render.
import { useTranslation } from "react-i18next";
import type { ChartPoint } from "@/components/charts/types";
import { seriesAt } from "@/components/charts/series";
import type { ReactorVariable } from "@/types/reactor";
import { formatValue, latestValue, windowStats } from "../services/instantValues";
import { formatRange } from "../services/variableSelection";

export interface InstantValuePanelProps {
  /** Variables elegidas, en orden (A, B), con los datos del catalogo. */
  variables: ReactorVariable[];
  series: Record<string, ChartPoint[]>;
  lastSampleAt: number | null;
}

export function InstantValuePanel({ variables, series, lastSampleAt }: InstantValuePanelProps) {
  const { t } = useTranslation("common");
  if (variables.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {variables.map((variable, index) => {
        const color = seriesAt(index);
        const latest = latestValue(series[variable.id], lastSampleAt);
        const stats = windowStats(series[variable.id]);
        return (
          <div key={variable.id} className={"card card-pad " + (color?.className ?? "")}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full shrink-0 series-dot" />
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold truncate">{variable.name}</div>
                  <div className="text-[10px] text-muted font-mono">
                    {color?.label} · {variable.id}
                  </div>
                </div>
              </div>
              <div className="font-mono text-[10px] text-muted shrink-0">{formatRange(variable)}</div>
            </div>

            <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted font-mono">
                  {t("realtime.instant.value")}
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-[28px] font-mono font-semibold leading-none series-text">
                    {latest ? formatValue(latest.value) : "—"}
                  </span>
                  <span className="text-[13px] font-mono text-muted">{variable.unit}</span>
                </div>
                {latest && !latest.current && (
                  <div className="mt-1.5 text-[11px] text-warn">{t("realtime.instant.noData")}</div>
                )}
              </div>
              {stats && (
                <div className="ml-auto grid grid-cols-3 gap-4 text-right">
                  <Stat label={t("realtime.instant.min")} value={formatValue(stats.min)} />
                  <Stat label={t("realtime.instant.mean")} value={formatValue(stats.mean)} />
                  <Stat label={t("realtime.instant.max")} value={formatValue(stats.max)} />
                </div>
              )}
            </div>
            {stats && (
              <div className="mt-2 text-[10px] text-muted text-right">{t("realtime.instant.window")}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-muted text-[9px] uppercase tracking-wider">{label}</div>
      <div className="font-mono font-semibold text-[12px]">{value}</div>
    </div>
  );
}

// Valor instantaneo de cada variable elegida (RF05, tarea 3.7), debajo del
// grafico. Puerto de las tarjetas de Realtime.jsx, sin la mini grafica (repite
// lo que ya muestra el grafico principal).
//
// Compartido entre Tiempo Real y el historico (tarea 5.3): no sabe de donde
// salen los datos. La pagina decide que valor mostrar (el ultimo en Tiempo
// Real, el de la posicion del cursor en el historico) y de que puntos sacar
// las estadisticas. En Tiempo Real lee el mismo snapshot que el grafico, asi
// que los dos se actualizan en el mismo render.
import { useTranslation } from "react-i18next";
import type { ChartPoint } from "@/components/charts/types";
import { seriesAt } from "@/components/charts/series";
import type { ReactorVariable } from "@/types/reactor";
import { formatValue, windowStats, type InstantValue } from "../services/instantValues";
import { formatRange } from "../services/variableSelection";

export interface InstantValuePanelProps {
  /** Variables elegidas, en orden (A, B), con los datos del catalogo. */
  variables: ReactorVariable[];
  /** Valor a mostrar por variable. Sin entrada (o null), se muestra "—". */
  values: Record<string, InstantValue | null>;
  /** Puntos de los que salen el minimo, el promedio y el maximo. */
  series: Record<string, ChartPoint[]>;
  /** Que abarcan esas estadisticas, por ejemplo "los ultimos 5 minutos". */
  statsCaption: string;
}

export function InstantValuePanel({ variables, values, series, statsCaption }: InstantValuePanelProps) {
  const { t } = useTranslation("common");
  if (variables.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {variables.map((variable, index) => {
        const color = seriesAt(index);
        const value = values[variable.id] ?? null;
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
                  {t("viewer.instant.value")}
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-[28px] font-mono font-semibold leading-none series-text">
                    {value ? formatValue(value.value) : "—"}
                  </span>
                  <span className="text-[13px] font-mono text-muted">{variable.unit}</span>
                </div>
                {value && !value.current && (
                  <div className="mt-1.5 text-[11px] text-warn">{t("viewer.instant.noData")}</div>
                )}
              </div>
              {stats && (
                <div className="ml-auto grid grid-cols-3 gap-4 text-right">
                  <Stat label={t("viewer.instant.min")} value={formatValue(stats.min)} />
                  <Stat label={t("viewer.instant.mean")} value={formatValue(stats.mean)} />
                  <Stat label={t("viewer.instant.max")} value={formatValue(stats.max)} />
                </div>
              )}
            </div>
            {stats && <div className="mt-2 text-[10px] text-muted text-right">{statsCaption}</div>}
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

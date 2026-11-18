// Selector de variables de RF05: hasta dos a la vez. Puerto del panel
// lateral de Realtime.jsx (prototipo), con una diferencia a proposito: al
// llegar al tope las demas variables se deshabilitan, en vez de reemplazar
// a la mas vieja como hacia el prototipo (criterio de aceptacion de la 3.4).
//
// No guarda estado propio salvo el texto de busqueda: la seleccion es de la
// pagina, que la pasa a useRealtimeSocket.
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ICheck, ISearch, IX } from "@/components/icons";
import { seriesAt } from "@/components/charts/series";
import type { ReactorVariable } from "@/types/reactor";
import {
  canSelect,
  formatRange,
  groupVariables,
  MAX_SELECTED_VARIABLES,
  toggleVariable,
} from "../services/variableSelection";

export interface VariableSelectorProps {
  /** Catalogo completo. undefined mientras carga o si fallo. */
  catalog: ReactorVariable[] | undefined;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  selection: readonly string[];
  onChange: (selection: string[]) => void;
}

export function VariableSelector({
  catalog,
  loading,
  failed,
  onRetry,
  selection,
  onChange,
}: VariableSelectorProps) {
  const { t } = useTranslation("common");
  const [query, setQuery] = useState("");
  const groups = useMemo(() => groupVariables(catalog ?? [], query), [catalog, query]);
  const byId = useMemo(() => new Map((catalog ?? []).map((v) => [v.id, v])), [catalog]);
  const full = selection.length >= MAX_SELECTED_VARIABLES;

  const toggle = (id: string) => onChange(toggleVariable(selection, id));

  return (
    <div className="card flex flex-col">
      <div className="px-4 py-3 border-b border-line">
        <div className="font-semibold text-[14px]">{t("realtime.variables.title")}</div>
        <div className="text-[11px] text-muted mt-0.5">
          {t("realtime.variables.hint", { max: MAX_SELECTED_VARIABLES })}
        </div>
      </div>

      {/* Seleccionadas: A y B con su color, y el boton para quitarlas */}
      <div className="px-4 py-3 border-b border-line">
        <div className="text-[11px] uppercase tracking-wider text-muted font-mono mb-2">
          {t("realtime.variables.selected")} · {selection.length}/{MAX_SELECTED_VARIABLES}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {selection.length === 0 && (
            <div className="text-[12px] text-muted italic">{t("realtime.variables.none")}</div>
          )}
          {selection.map((id, index) => {
            const series = seriesAt(index);
            const name = byId.get(id)?.name ?? id;
            return (
              <span key={id} className={"chip series-border " + (series?.className ?? "")}>
                <span className="w-2 h-2 rounded-full series-dot" />
                <span className="font-mono text-[10px] font-semibold series-text">
                  {series?.label}
                </span>
                <span className="text-[11px]">{name}</span>
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  className="ml-1 text-muted hover:text-[var(--ink)]"
                  aria-label={t("realtime.variables.remove", { name })}
                >
                  <IX size={11} />
                </button>
              </span>
            );
          })}
        </div>
      </div>

      <div className="px-4 py-3 border-b border-line">
        <div className="relative">
          <ISearch
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
          />
          <input
            className="field !pl-9"
            type="search"
            placeholder={t("realtime.variables.search")}
            aria-label={t("realtime.variables.search")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      <div className="overflow-y-auto max-h-[460px]">
        {loading && <Notice>{t("realtime.variables.loading")}</Notice>}
        {failed && (
          <Notice>
            {t("realtime.variables.loadError")}
            <button type="button" className="btn-ghost mt-3 block mx-auto" onClick={onRetry}>
              {t("realtime.variables.retry")}
            </button>
          </Notice>
        )}
        {catalog !== undefined && groups.length === 0 && (
          <Notice>{t("realtime.variables.noResults")}</Notice>
        )}

        {groups.map((group) => (
          <div key={group.code}>
            <div className="px-4 py-2 bg-surface-hover text-[10px] uppercase tracking-widest text-muted font-mono border-b border-line">
              {group.code} · {group.name}
            </div>
            {group.variables.map((variable) => {
              const index = selection.indexOf(variable.id);
              const selected = index >= 0;
              const series = seriesAt(index);
              const disabled = !selected && !canSelect(selection, variable.id);
              return (
                <button
                  key={variable.id}
                  type="button"
                  onClick={() => toggle(variable.id)}
                  disabled={disabled}
                  aria-pressed={selected}
                  title={
                    disabled
                      ? t("realtime.variables.limitReached", { max: MAX_SELECTED_VARIABLES })
                      : undefined
                  }
                  className={
                    "w-full text-left px-4 py-2.5 flex items-center gap-3 border-b border-line hover-surface " +
                    (selected ? "bg-surface-hover " : "") +
                    (disabled ? "opacity-40 cursor-not-allowed" : "")
                  }
                >
                  <span
                    className={
                      "w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 " +
                      (selected ? "series-fill " + (series?.className ?? "") : "border-line-2")
                    }
                  >
                    {selected && <ICheck size={9} className="text-white" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium truncate">{variable.name}</span>
                    <span className="block text-[10px] text-muted font-mono">
                      {variable.id} · {formatRange(variable)}
                      {variable.kind === "consigna" && ` · ${t("realtime.variables.setpoint")}`}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {full && (
        <div className="px-4 py-2.5 border-t border-line text-[11px] text-muted">
          {t("realtime.variables.limitReached", { max: MAX_SELECTED_VARIABLES })}
        </div>
      )}
    </div>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return <div className="px-4 py-6 text-center text-muted text-[13px]">{children}</div>;
}

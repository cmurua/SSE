// "Variable vs. tiempo" / "Variable vs. variable", como en el prototipo.
// Compartido entre Tiempo Real y el historico (tarea 5.3). Recibe el modo ya
// resuelto con displayedChartMode (services/chartMode.ts).
import { useTranslation } from "react-i18next";
import type { ChartMode } from "@/components/charts/types";

export interface ChartModeToggleProps {
  mode: ChartMode;
  /** false = hay menos de 2 variables: el X·Y se deshabilita. */
  xyAvailable: boolean;
  onChange: (mode: ChartMode) => void;
}

export function ChartModeToggle({ mode, xyAvailable, onChange }: ChartModeToggleProps) {
  const { t } = useTranslation("common");
  const option = (value: ChartMode, disabled = false) => (
    <button
      type="button"
      onClick={() => onChange(value)}
      disabled={disabled}
      aria-pressed={mode === value}
      title={disabled ? t("viewer.mode.xyNeedsTwo") : undefined}
      className={
        "px-3 py-1 text-[12px] rounded-full font-medium " +
        (mode === value ? "bg-surface shadow-sm" : "text-muted") +
        (disabled ? " opacity-40 cursor-not-allowed" : "")
      }
    >
      {t(`viewer.mode.${value}`)}
    </button>
  );

  return (
    <div className="card flex flex-wrap items-center gap-3 px-4 py-3">
      <div role="group" aria-label={t("viewer.mode.label")} className="flex items-center gap-1 bg-app rounded-full p-1">
        {option("time")}
        {option("xy", !xyAvailable)}
      </div>
      {!xyAvailable && (
        <span className="text-[11px] text-muted">{t("viewer.mode.xyNeedsTwo")}</span>
      )}
    </div>
  );
}

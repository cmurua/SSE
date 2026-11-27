// Panel del nucleo (tarea 5.4): posicion de las barras de control y nivel de
// moderador. Puerto de docs/design/frontend-prototype/src/ControlBarsPanel.jsx,
// armado a partir del catalogo:
// - una barra por cada variable del grupo SBC, con su nombre y unidad;
// - el tanque, con el nivel de moderador en el nucleo (MODERATOR_LEVEL_ID).
// Los IDs del mock (POS_BR*, POS_BRS, NIV_MOD) no existen en el catalogo y no
// se usan.
//
// No pasa por components/charts/: es una visualizacion propia del reactor,
// no un grafico generico. Compartido entre Tiempo Real y el historico: recibe
// una "foto" {variableId: valor} y no sabe de donde sale.
import { useTranslation } from "react-i18next";
import type { ReactorVariable } from "@/types/reactor";
import {
  barPercent,
  barTone,
  controlBarVariables,
  moderatorLevelVariable,
  moderatorStatus,
  type ControlBarsSnapshot,
} from "../services/controlBars";

export interface ControlBarsPanelProps {
  /** Catalogo de senales (GET /reactor-data/variables). undefined mientras
   *  carga: el panel no se muestra. */
  catalog: readonly ReactorVariable[] | undefined;
  /** Valor de cada variable en el instante que se esta mirando. */
  snapshot: ControlBarsSnapshot;
  /** Canales mas bajos, para pantallas con menos lugar. */
  compact?: boolean;
}

// Marcas de los canales y del tanque, en % de la escala.
const BAR_TICKS = [0, 25, 50, 75, 100];
const TANK_GRID = [20, 40, 60, 80];

export function ControlBarsPanel({ catalog, snapshot, compact = false }: ControlBarsPanelProps) {
  const { t } = useTranslation("common");
  const bars = controlBarVariables(catalog);
  const moderator = moderatorLevelVariable(catalog);
  if (bars.length === 0 && moderator === undefined) return null;

  return (
    <section className="card overflow-hidden" aria-label={t("viewer.controlBars.title")}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-line">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-[13px]">{t("viewer.controlBars.title")}</span>
          <span className="text-[10px] uppercase tracking-widest text-muted font-mono">
            {t(moderator ? "viewer.controlBars.subtitle" : "viewer.controlBars.subtitleBars")}
          </span>
        </div>
        <span className="text-[10px] text-muted font-mono">{t("viewer.controlBars.scale")}</span>
      </div>

      <div className="p-4 grid grid-cols-12 gap-4">
        {bars.length > 0 && (
          <div className={"col-span-12 " + (moderator ? "md:col-span-8" : "")}>
            <div
              className="grid gap-3 h-full"
              style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}
            >
              {bars.map((variable) => (
                <ControlBar
                  key={variable.id}
                  variable={variable}
                  value={snapshot[variable.id]}
                  compact={compact}
                />
              ))}
            </div>
          </div>
        )}
        {moderator && (
          <div className={"col-span-12 " + (bars.length > 0 ? "md:col-span-4" : "")}>
            <ModeratorGauge variable={moderator} value={snapshot[moderator.id]} compact={compact} />
          </div>
        )}
      </div>
    </section>
  );
}

function ControlBar({
  variable,
  value,
  compact,
}: {
  variable: ReactorVariable;
  value: number | null | undefined;
  compact: boolean;
}) {
  const pct = barPercent(variable, value);
  const tone = barTone(pct);
  const height = compact ? 90 : 130;
  const fill = pct === null ? 0 : (pct / 100) * height;
  return (
    <div
      className={"flex flex-col items-center rod-tone-" + tone}
      data-variable={variable.id}
      data-tone={tone}
    >
      <div className="text-[11px] font-mono font-semibold mb-1.5 rod-tone-text">
        {pct === null ? "—" : `${pct.toFixed(1)}${variable.unit}`}
      </div>
      <div className="relative" style={{ width: 26, height }}>
        <div className="absolute inset-0 rounded-md overflow-hidden rod-channel">
          {BAR_TICKS.map((tick) => (
            <div
              key={tick}
              className="absolute left-0 right-0 rod-tick"
              style={{ top: ((100 - tick) / 100) * height, height: 0 }}
            />
          ))}
          {/* Porcion de la barra dentro del canal, desde arriba. */}
          <div
            className="absolute inset-x-0 top-0 transition-[height] duration-300 rod-fill"
            style={{ height: fill }}
          >
            <div className="absolute inset-0 rod-hatch" />
          </div>
          {/* Nucleo, al pie del canal. */}
          <div className="absolute inset-x-0 bottom-0 h-1.5 rod-core" />
        </div>
      </div>
      <div className="mt-1.5 text-[11px] font-semibold text-center leading-tight">
        {variable.name}
      </div>
      <div className="text-[9px] uppercase tracking-wider text-muted font-mono">{variable.id}</div>
    </div>
  );
}

function ModeratorGauge({
  variable,
  value,
  compact,
}: {
  variable: ReactorVariable;
  value: number | null | undefined;
  compact: boolean;
}) {
  const { t } = useTranslation("common");
  const pct = barPercent(variable, value);
  const status = moderatorStatus(pct);
  const height = compact ? 110 : 140;
  const fill = pct === null ? 0 : (pct / 100) * height;

  return (
    <div
      className={"h-full flex flex-col mod-status-" + status}
      data-variable={variable.id}
      data-status={status}
    >
      <div className="text-[11px] uppercase tracking-widest text-muted font-mono mb-2">
        {t("viewer.controlBars.moderator.title")}
      </div>
      <div className="flex items-center gap-4 flex-1">
        <div className="relative" style={{ width: 56, height }}>
          <div className="absolute inset-0 rounded-md overflow-hidden mod-tank">
            {/* Moderador, desde abajo. */}
            <div
              className="absolute inset-x-0 bottom-0 transition-[height] duration-500 mod-fill"
              style={{ height: fill }}
            >
              <div className="absolute -top-1 left-0 right-0 h-2 mod-ripple" />
            </div>
            {TANK_GRID.map((tick) => (
              <div
                key={tick}
                className="absolute left-0 right-0 mod-grid"
                style={{ top: ((100 - tick) / 100) * height, height: 0 }}
              />
            ))}
          </div>
          <div className="absolute -right-7 top-0 h-full flex flex-col justify-between font-mono text-[9px] text-muted">
            <span>100</span>
            <span>50</span>
            <span>0</span>
          </div>
        </div>

        <div className="flex-1 min-w-0 pl-4">
          <div className="text-[28px] font-mono font-semibold leading-none mod-status-text">
            {pct === null ? "—" : pct.toFixed(1)}
            <span className="text-[14px] text-muted ml-1">{variable.unit}</span>
          </div>
          <div className="mt-1 text-[11px] font-medium mod-status-text">
            {status === "none" ? "—" : t(`viewer.controlBars.moderator.status.${status}`)}
          </div>
          <div className="mt-2 text-[10px] text-muted leading-snug">
            {t("viewer.controlBars.moderator.description")}
          </div>
          <div className="mt-1 text-[9px] uppercase tracking-wider text-muted font-mono">
            {variable.id}
          </div>
        </div>
      </div>
    </div>
  );
}

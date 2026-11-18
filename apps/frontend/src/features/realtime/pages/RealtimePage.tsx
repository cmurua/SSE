// Puerto de Realtime.jsx. Depende de useReactorState (gating por SERMO,
// RF04) y useRealtimeSocket (stream de muestras). El grafico se renderiza
// SIEMPRE via components/charts/ChartRenderer, nunca importando una
// libreria de graficos directamente (ver ADR 0002).
//
// RF04: el modulo solo esta disponible en modo OPERACION. La pantalla sigue
// a useReactorState en vivo, sin recargar: si el reactor se detiene estando
// aca, pasa a "no disponible", y vuelve sola cuando arranca. El backend
// aplica la misma regla por su lado: realtime.samples rechaza con 4409 si el
// reactor no opera.
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ChartRenderer } from "@/components/charts/ChartRenderer";
import type { ChartMode, ChartVariable } from "@/components/charts/types";
import { IAlert } from "@/components/icons";
import type { ReactorView } from "@/store/reactorStateStore";
import type { RealtimeError } from "@/types/realtime";
import { VariableSelector } from "../components/VariableSelector";
import { useReactorState } from "../hooks/useReactorState";
import { useRealtimeSocket, type RealtimeSnapshot } from "../hooks/useRealtimeSocket";
import { useVariableCatalog } from "../hooks/useVariableCatalog";
import { REALTIME_WINDOW_MS } from "../services/realtimeBuffer";
import { DEFAULT_SELECTION } from "../services/variableSelection";

export type RealtimeScreen = "available" | "unavailable" | "unknown" | "loading";

/** Que pantalla corresponde a cada estado del reactor. Separado del
 *  componente para poder probarlo sin renderizar. */
export function realtimeScreen(view: ReactorView): RealtimeScreen {
  switch (view) {
    case "operating":
      return "available";
    case "stopped":
      return "unavailable";
    // Sin conexion no se sabe si el reactor opera: no se habilita el modulo,
    // pero tampoco se dice que el reactor esta detenido.
    case "disconnected":
      return "unknown";
    case "loading":
      return "loading";
  }
}

/** Operacion a la que conectar el stream de muestras. Sale del ultimo estado
 *  recibido y no de `view`: si reactor.state se corta un instante (`view`
 *  pasa a "disconnected"), el stream de muestras sigue vivo y no hay que
 *  cerrarlo ni perder el buffer. Si la operacion termino, el servidor ya
 *  corta con 4409 por su lado. */
export function streamOperationId(state: { sermo: boolean; operation_id: string | null } | null) {
  return state?.sermo ? state.operation_id : null;
}

/** Modo que se muestra: el elegido, salvo que no haya 2 variables para el
 *  X·Y. Se guarda el elegido aparte para que, si se quita la Variable B y se
 *  elige otra, el grafico vuelva solo a X·Y. */
export function displayedChartMode(preferred: ChartMode, variableCount: number): ChartMode {
  return preferred === "xy" && variableCount < 2 ? "time" : preferred;
}

export function RealtimePage() {
  const { t } = useTranslation("common");
  const { view, connection, state } = useReactorState();
  const screen = realtimeScreen(view);

  // La seleccion y el stream viven aca y no en RealtimeAvailable, para que
  // sobrevivan a que esa pantalla se desmonte por un corte de reactor.state.
  const [selection, setSelection] = useState<string[]>(() => [...DEFAULT_SELECTION]);
  // El modo es solo de presentacion: no se le pasa al hook, asi que
  // cambiarlo no toca la conexion ni el buffer.
  const [preferredMode, setPreferredMode] = useState<ChartMode>("time");
  const realtime = useRealtimeSocket({
    operationId: streamOperationId(state),
    variables: selection,
  });

  return (
    <div className="space-y-5">
      <div className="banner">{t("realtime.title")}</div>
      {screen === "available" && (
        <RealtimeAvailable
          selection={selection}
          onSelectionChange={setSelection}
          preferredMode={preferredMode}
          onModeChange={setPreferredMode}
          realtime={realtime}
        />
      )}
      {screen === "unavailable" && <RealtimeUnavailable />}
      {/* Con el WebSocket abierto, lo que falta es la senal del reactor
          (source_connected: false); si no, es el servidor. */}
      {screen === "unknown" && <RealtimeUnknown signalLost={connection === "open"} />}
      {screen === "loading" && <RealtimeLoading />}
    </div>
  );
}

// TODO(Milestone 3): el panel de valor instantaneo y metadatos de la
// operacion (3.7) se completa en su tarea.
function RealtimeAvailable({
  selection,
  onSelectionChange,
  preferredMode,
  onModeChange,
  realtime,
}: {
  selection: string[];
  onSelectionChange: (selection: string[]) => void;
  preferredMode: ChartMode;
  onModeChange: (mode: ChartMode) => void;
  realtime: RealtimeSnapshot;
}) {
  const { t } = useTranslation("common");
  const catalog = useVariableCatalog();

  const chartVariables = useMemo(() => {
    const byId = new Map((catalog.data ?? []).map((v) => [v.id, v]));
    return selection
      .map((id) => byId.get(id))
      .filter((v) => v !== undefined)
      .map(({ id, name, unit }): ChartVariable => ({ id, name, unit }));
  }, [catalog.data, selection]);
  const mode = displayedChartMode(preferredMode, chartVariables.length);

  return (
    <div className="grid grid-cols-12 gap-5">
      <aside className="col-span-12 lg:col-span-4 xl:col-span-3 self-start">
        <VariableSelector
          catalog={catalog.data}
          loading={catalog.isPending}
          failed={catalog.isError}
          onRetry={() => void catalog.refetch()}
          selection={selection}
          onChange={onSelectionChange}
        />
      </aside>
      <section className="col-span-12 lg:col-span-8 xl:col-span-9 space-y-4">
        {realtime.error && <SubscribeError error={realtime.error} />}
        <ModeToggle
          mode={mode}
          xyAvailable={chartVariables.length >= 2}
          onChange={onModeChange}
        />
        <ChartRenderer
          variables={chartVariables}
          data={realtime.series}
          mode={mode}
          title={t(`realtime.mode.${mode}`)}
          height={360}
          timeWindowMs={REALTIME_WINDOW_MS}
        />
      </section>
    </div>
  );
}

/** "Variable vs. tiempo" / "Variable vs. variable", como en el prototipo. */
function ModeToggle({
  mode,
  xyAvailable,
  onChange,
}: {
  mode: ChartMode;
  xyAvailable: boolean;
  onChange: (mode: ChartMode) => void;
}) {
  const { t } = useTranslation("common");
  const option = (value: ChartMode, disabled = false) => (
    <button
      type="button"
      onClick={() => onChange(value)}
      disabled={disabled}
      aria-pressed={mode === value}
      title={disabled ? t("realtime.mode.xyNeedsTwo") : undefined}
      className={
        "px-3 py-1 text-[12px] rounded-full font-medium " +
        (mode === value ? "bg-surface shadow-sm" : "text-muted") +
        (disabled ? " opacity-40 cursor-not-allowed" : "")
      }
    >
      {t(`realtime.mode.${value}`)}
    </button>
  );

  return (
    <div className="card flex flex-wrap items-center gap-3 px-4 py-3">
      <div role="group" aria-label={t("realtime.mode.label")} className="flex items-center gap-1 bg-app rounded-full p-1">
        {option("time")}
        {option("xy", !xyAvailable)}
      </div>
      {!xyAvailable && (
        <span className="text-[11px] text-muted">{t("realtime.mode.xyNeedsTwo")}</span>
      )}
    </div>
  );
}

const SUBSCRIBE_ERROR_CODES = ["invalid_message", "unknown_variable", "too_many_variables"];

/** Un `subscribe` rechazado. El servidor conserva la seleccion anterior, asi
 *  que lo que se ve puede no coincidir con lo elegido: hay que decirlo. */
function SubscribeError({ error }: { error: RealtimeError }) {
  const { t } = useTranslation("common");
  const code = SUBSCRIBE_ERROR_CODES.includes(error.code) ? error.code : "generic";
  return (
    <div role="alert" className="card card-pad flex items-start gap-3 text-[13px]">
      <IAlert size={18} className="text-warn shrink-0 mt-0.5" />
      <span>{t(`realtime.subscribeErrors.${code}`)}</span>
    </div>
  );
}

function RealtimeUnavailable() {
  const { t } = useTranslation("common");
  return (
    <StatusCard
      icon={<IAlert size={28} />}
      iconClassName="bg-bad-soft text-bad"
      eyebrow={`${t("sermo.label")} · ${t("sermo.off")}`}
      title={t("realtime.unavailable.title")}
      lead={t("realtime.unavailable.lead")}
    >
      {/* RF04 deja solo los historicos al terminar la operacion. RF06 esta
          fuera del MVP: /historicals es hoy una pagina placeholder. Deuda
          registrada en la tarea 2.8. */}
      <Link to="/historicals" className="btn-dark mt-6">
        {t("realtime.unavailable.goHistoricals")}
      </Link>
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-6 text-left max-w-2xl w-full">
        <Fact
          label={t("realtime.facts.state")}
          value={t("sermo.status.stopped")}
          valueClassName="text-bad"
        />
        <Fact label={t("realtime.facts.sermo")} value="false" mono />
        <Fact label={t("realtime.facts.acquisition")} value={t("realtime.facts.paused")} />
      </div>
    </StatusCard>
  );
}

function RealtimeUnknown({ signalLost }: { signalLost: boolean }) {
  const { t } = useTranslation("common");
  return (
    <StatusCard
      icon={<IAlert size={28} />}
      iconClassName="bg-warn-soft text-warn"
      eyebrow={`${t("sermo.label")} · ${t("sermo.unknown")}`}
      title={t("realtime.unknown.title")}
      lead={t(signalLost ? "realtime.unknown.signalLost" : "realtime.unknown.serverLost")}
    />
  );
}

function RealtimeLoading() {
  const { t } = useTranslation("common");
  return (
    <div className="card card-pad !py-16 text-center text-[14px] text-muted">
      {t("realtime.loading")}
    </div>
  );
}

interface StatusCardProps {
  icon: ReactNode;
  iconClassName: string;
  eyebrow: string;
  title: string;
  lead: string;
  children?: ReactNode;
}

// Estado vacio del prototipo (Realtime.jsx, "OFF state"), reutilizado por
// las pantallas habilitado, no disponible y sin conexion. `!py-16`:
// .card-pad se declara despues de las utilidades y les gana (ver globals.css).
function StatusCard({ icon, iconClassName, eyebrow, title, lead, children }: StatusCardProps) {
  return (
    <div className="card card-pad !py-16 flex flex-col items-center text-center">
      <div
        className={"w-16 h-16 rounded-full flex items-center justify-center mb-4 " + iconClassName}
      >
        {icon}
      </div>
      <div className="font-mono text-[11px] uppercase tracking-widest text-muted mb-2">
        {eyebrow}
      </div>
      <h2 className="text-[22px] font-semibold mb-2">{title}</h2>
      <p className="text-[14px] text-muted max-w-md">{lead}</p>
      {children}
    </div>
  );
}

// Puerto de KV (Realtime.jsx), con una clase en vez de un color inline.
function Fact({
  label,
  value,
  mono = false,
  valueClassName = "",
}: {
  label: string;
  value: string;
  mono?: boolean;
  valueClassName?: string;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted font-mono">{label}</div>
      <div
        className={
          "mt-1 text-[15px] font-semibold " + (mono ? "font-mono " : "") + valueClassName
        }
      >
        {value}
      </div>
    </div>
  );
}

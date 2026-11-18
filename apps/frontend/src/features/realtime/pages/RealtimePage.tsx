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
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { IActivity, IAlert } from "@/components/icons";
import type { ReactorView } from "@/store/reactorStateStore";
import { useReactorState } from "../hooks/useReactorState";

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

export function RealtimePage() {
  const { t } = useTranslation("common");
  const { view, connection } = useReactorState();
  const screen = realtimeScreen(view);

  return (
    <div className="space-y-5">
      <div className="banner">{t("realtime.title")}</div>
      {screen === "available" && <RealtimeAvailable />}
      {screen === "unavailable" && <RealtimeUnavailable />}
      {/* Con el WebSocket abierto, lo que falta es la senal del reactor
          (source_connected: false); si no, es el servidor. */}
      {screen === "unknown" && <RealtimeUnknown signalLost={connection === "open"} />}
      {screen === "loading" && <RealtimeLoading />}
    </div>
  );
}

// TODO(Milestone 3): esta tarjeta es un marcador. La reemplazan el selector
// de variables (3.4), el grafico (3.5, 3.6) y el panel de valor instantaneo
// y metadatos de la operacion (3.7), alimentados por useRealtimeSocket (3.3).
function RealtimeAvailable() {
  const { t } = useTranslation("common");
  return (
    <StatusCard
      icon={<IActivity size={28} />}
      iconClassName="bg-green-header text-white"
      eyebrow={`${t("sermo.label")} · ${t("sermo.on")}`}
      title={t("realtime.available.title")}
      lead={t("realtime.available.lead")}
    />
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

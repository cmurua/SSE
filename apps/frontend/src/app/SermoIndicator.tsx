// Indicador permanente del estado del reactor en el header. Puerto de
// SermoIndicator de docs/design/frontend-prototype/src/Shell.jsx, con dos
// diferencias:
//   - Ya no es un boton: el prototipo alternaba SERMO a mano para la demo.
//     Ahora lo decide useReactorState y el indicador solo lo muestra.
//   - Suma "sin conexion", que el prototipo no tenia: perder el servidor o la
//     senal del reactor NO es "detenido" (ver store/reactorStateStore.ts).
import { useTranslation } from "react-i18next";
import { useReactorState } from "@/features/realtime/hooks/useReactorState";
import type { ReactorStateSnapshot } from "@/store/reactorStateStore";

export type SermoTone = "on" | "off" | "lost" | "pending";

export interface SermoIndicatorModel {
  tone: SermoTone;
  /** Lo que va despues de "SERMO ·". */
  signalKey: string;
  statusKey: string;
  /** Tooltip: en "sin conexion", la causa. */
  hintKey: string;
  /** Pulsa solo con senal en vivo: un punto quieto dice "no hay datos". */
  pulse: boolean;
}

/** Que mostrar para cada estado. Separado del componente para poder
 *  probarlo sin renderizar. */
export function describeSermo(
  snapshot: Pick<ReactorStateSnapshot, "view" | "connection">,
): SermoIndicatorModel {
  switch (snapshot.view) {
    case "operating":
      return {
        tone: "on",
        signalKey: "sermo.on",
        statusKey: "sermo.status.operating",
        hintKey: "sermo.hint.operating",
        pulse: true,
      };
    case "stopped":
      return {
        tone: "off",
        signalKey: "sermo.off",
        statusKey: "sermo.status.stopped",
        hintKey: "sermo.hint.stopped",
        pulse: true,
      };
    case "disconnected":
      return {
        tone: "lost",
        signalKey: "sermo.unknown",
        statusKey: "sermo.status.disconnected",
        // Con el WebSocket abierto, lo que falta es la senal MQTT del reactor
        // (source_connected: false); si no, es el servidor el que no responde.
        hintKey:
          snapshot.connection === "open" ? "sermo.hint.signalLost" : "sermo.hint.serverLost",
        pulse: false,
      };
    case "loading":
      return {
        tone: "pending",
        signalKey: "sermo.unknown",
        statusKey: "sermo.status.connecting",
        hintKey: "sermo.hint.connecting",
        pulse: false,
      };
  }
}

// "off" y "pending" con blancos translucidos, como el "off" del prototipo;
// "on" y "lost" con los tokens --sermo-* (styles/tokens.css).
const TONE_CLASSES: Record<SermoTone, { halo: string; dot: string; status: string }> = {
  on: { halo: "bg-sermo-on-halo", dot: "bg-sermo-on", status: "text-sermo-on" },
  off: { halo: "bg-white/15", dot: "bg-white/40", status: "text-white/55" },
  lost: { halo: "bg-sermo-lost-halo", dot: "bg-sermo-lost", status: "text-sermo-lost" },
  pending: { halo: "bg-white/10", dot: "bg-white/25", status: "text-white/45" },
};

export function SermoIndicator() {
  const { t } = useTranslation("common");
  const model = describeSermo(useReactorState());
  const classes = TONE_CLASSES[model.tone];

  return (
    // role="status": un lector de pantalla anuncia el cambio sin mover el foco.
    <div
      role="status"
      title={t(model.hintKey)}
      className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full border border-white/20 whitespace-nowrap"
    >
      <span className="relative flex items-center justify-center w-5 h-5" aria-hidden="true">
        <span
          className={
            "absolute inset-0 rounded-full " + classes.halo + (model.pulse ? " pulse-dot" : "")
          }
        />
        <span className={"relative w-2.5 h-2.5 rounded-full " + classes.dot} />
      </span>
      {/* En pantallas chicas queda el punto y el estado, que es lo que
          distingue los tres casos. */}
      <span className="hidden sm:inline text-[11px] font-mono uppercase tracking-wider text-white/85">
        {t("sermo.label")} · {t(model.signalKey)}
      </span>
      <span className={"text-[11px] font-semibold " + classes.status}>{t(model.statusKey)}</span>
    </div>
  );
}

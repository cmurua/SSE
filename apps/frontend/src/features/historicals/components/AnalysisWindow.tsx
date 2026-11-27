// Ventana de analisis y reproduccion (tarea 5.7), debajo del grafico del
// detalle. Puerto del bloque "Ventana de analisis" de HistoryDetail
// (Histories.jsx): Inicio y Fin en minutos, el rango con dos manijas y sus
// marcas, y abajo Play / Pausa, Reiniciar, la velocidad y la barra del
// cursor.
//
// No guarda estado propio salvo lo que se esta escribiendo en Inicio y Fin:
// la ventana y el cursor son de la pagina, que los comparte con el grafico,
// el panel del nucleo y los valores instantaneos.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { IFilter, IPause, IPlay } from "@/components/icons";
import { formatDuration } from "@/features/operation-viewer/services/instantValues";
import { DualRange } from "./DualRange";
import {
  formatMinutes,
  minutesFieldValue,
  parseMinutesField,
  PLAYBACK_SPEEDS,
  rangeTicks,
  sliderStep,
  windowSampleCount,
  type AnalysisWindow as WindowBounds,
  type PlaybackSpeed,
} from "../services/playback";

export interface AnalysisWindowProps {
  /** Segundos que dura la operacion. */
  durationSeconds: number;
  /** Muestras de toda la operacion, para estimar las de la ventana. */
  sampleCount: number;
  win: WindowBounds;
  /** Valores pedidos; la pagina los recorta a la operacion. */
  onStartChange: (seconds: number) => void;
  onEndChange: (seconds: number) => void;
  cursor: number;
  playing: boolean;
  speed: PlaybackSpeed;
  onTogglePlay: () => void;
  onRestart: () => void;
  onSeek: (seconds: number) => void;
  onSpeedChange: (speed: PlaybackSpeed) => void;
}

/** Segundos desde el inicio, como reloj: "00:12:30". */
const clock = (seconds: number) => formatDuration(seconds * 1000);

export function AnalysisWindow({
  durationSeconds,
  sampleCount,
  win,
  onStartChange,
  onEndChange,
  cursor,
  playing,
  speed,
  onTogglePlay,
  onRestart,
  onSeek,
  onSpeedChange,
}: AnalysisWindowProps) {
  const { t, i18n } = useTranslation("common");
  const step = sliderStep(durationSeconds);
  const minutes = (seconds: number) => formatMinutes(seconds, i18n.language);

  return (
    <div className="card card-pad" data-testid="analysis-window">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mb-3">
        <IFilter size={14} className="text-muted self-center" />
        <div className="font-semibold text-[13px]">{t("historicals.detail.window.title")}</div>
        <div className="text-[11px] text-muted">{t("historicals.detail.window.hint")}</div>
        <div className="ml-auto font-mono text-[11px] text-muted" data-testid="window-summary">
          {t("historicals.detail.window.summary", {
            from: minutes(win.start),
            to: minutes(win.end),
            width: minutes(win.end - win.start),
            samples: windowSampleCount(win, durationSeconds, sampleCount).toLocaleString(
              i18n.language === "en" ? "en-US" : "es-AR",
            ),
          })}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4 items-end">
        <MinutesField
          className="col-span-6 md:col-span-2"
          label={t("historicals.detail.window.start")}
          seconds={win.start}
          maxSeconds={win.end}
          onCommit={onStartChange}
        />
        <MinutesField
          className="col-span-6 md:col-span-2"
          label={t("historicals.detail.window.end")}
          seconds={win.end}
          maxSeconds={durationSeconds}
          onCommit={onEndChange}
        />
        <div className="col-span-12 md:col-span-8">
          <div className="label-text">
            {t("historicals.detail.window.range")}
          </div>
          <DualRange
            min={0}
            max={durationSeconds}
            start={win.start}
            end={win.end}
            step={step}
            cursor={cursor}
            onStartChange={onStartChange}
            onEndChange={onEndChange}
            startLabel={t("historicals.detail.window.startHandle")}
            endLabel={t("historicals.detail.window.endHandle")}
            valueText={clock}
          />
          <div className="flex justify-between mt-1 text-[10px] text-muted font-mono" aria-hidden="true">
            {rangeTicks(durationSeconds).map((tick) => (
              <span key={tick}>{clock(tick)}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-line flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onTogglePlay}
          aria-label={t(playing ? "historicals.detail.playback.pause" : "historicals.detail.playback.play")}
          title={t(playing ? "historicals.detail.playback.pause" : "historicals.detail.playback.play")}
          data-playing={playing}
          className="w-8 h-8 rounded-full bg-[var(--ink)] text-white flex items-center justify-center shrink-0"
        >
          {playing ? <IPause size={12} /> : <IPlay size={11} />}
        </button>
        <button type="button" onClick={onRestart} className="btn-ghost !py-1 !px-2.5 !text-[11px]">
          {t("historicals.detail.playback.restart")}
        </button>
        <div
          role="group"
          aria-label={t("historicals.detail.playback.speed")}
          className="flex items-center gap-1 bg-app rounded-full p-1"
        >
          {PLAYBACK_SPEEDS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onSpeedChange(option)}
              aria-pressed={speed === option}
              title={option === 1 ? t("historicals.detail.playback.realTime") : undefined}
              className={
                "px-2.5 py-0.5 text-[11px] font-mono rounded-full font-medium " +
                (speed === option ? "bg-surface shadow-sm" : "text-muted")
              }
            >
              {t("historicals.detail.playback.speedOption", { speed: option })}
            </button>
          ))}
        </div>
        <input
          type="range"
          className="flex-1 min-w-[160px]"
          aria-label={t("historicals.detail.playback.cursor")}
          aria-valuetext={clock(cursor)}
          min={win.start}
          max={win.end}
          step="any"
          value={cursor}
          onChange={(event) => onSeek(Number(event.target.value))}
          onKeyDown={(event) => {
            // Con step="any" las flechas del navegador mueven de a 1/100 del
            // rango: se usa el mismo paso que las manijas.
            const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown"];
            if (!keys.includes(event.key)) return;
            event.preventDefault();
            const sign = ["ArrowRight", "ArrowUp", "PageUp"].includes(event.key) ? 1 : -1;
            const size = event.key.startsWith("Page") ? step * 10 : step;
            onSeek(cursor + sign * size);
          }}
        />
        <div className="font-mono text-[11px] text-muted whitespace-nowrap" data-testid="cursor-label">
          {t("historicals.detail.playback.cursorAt")}{" "}
          <span className="text-[var(--ink)]">{clock(cursor)}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Campo en minutos (con decimales: hay operaciones de segundos). Lo escrito se
 * aplica al salir del campo o con Enter, no en cada tecla: "1." todavia no es
 * un numero y cada cambio vuelve a pedir las series. Escape descarta.
 */
function MinutesField({
  label,
  seconds,
  maxSeconds,
  onCommit,
  className,
}: {
  label: string;
  seconds: number;
  maxSeconds: number;
  onCommit: (seconds: number) => void;
  className: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    onCommit(parseMinutesField(draft));
    setDraft(null);
  };

  return (
    <label className={className}>
      <span className="label-text">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step="any"
        min={0}
        max={minutesFieldValue(maxSeconds)}
        value={draft ?? minutesFieldValue(seconds)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
          if (event.key === "Escape") setDraft(null);
        }}
        className="field !py-2 font-mono text-[13px]"
      />
    </label>
  );
}

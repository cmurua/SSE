// Franja de metadatos de la operacion en curso (tarea 3.7), arriba del
// grafico: si los datos estan al dia, ID, hora de inicio, duracion y hora de
// la ultima muestra. Puerto del "status strip" de Realtime.jsx.
//
// Se re-renderiza cada segundo (useNow) para que la duracion y el "hace N s"
// avancen aunque no lleguen muestras.
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { WsStatus } from "@/services/websocket/wsClient";
import { useNow } from "../hooks/useNow";
import { parseTimestamp } from "../services/realtimeBuffer";
import {
  dataFreshness,
  formatDuration,
  formatTime,
  type DataFreshness,
} from "../services/instantValues";

export interface OperationStripProps {
  operationId: string | null;
  /** Inicio de la operacion (ISO 8601). */
  startedAt: string | null;
  connection: WsStatus;
  hasSelection: boolean;
  lastSampleAt: number | null;
  receivedAt: number | null;
}

const FRESHNESS_TONE: Record<DataFreshness, { dot: string; text: string; pulse: boolean }> = {
  live: { dot: "bg-good", text: "text-good", pulse: true },
  stale: { dot: "bg-warn", text: "text-warn", pulse: false },
  connecting: { dot: "bg-warn", text: "text-warn", pulse: true },
  waiting: { dot: "bg-band", text: "text-muted", pulse: true },
  idle: { dot: "bg-band", text: "text-muted", pulse: false },
};

export function OperationStrip({
  operationId,
  startedAt,
  connection,
  hasSelection,
  lastSampleAt,
  receivedAt,
}: OperationStripProps) {
  const { t } = useTranslation("common");
  const now = useNow();
  const freshness = dataFreshness({ connection, hasSelection, receivedAt, now });
  const tone = FRESHNESS_TONE[freshness];
  const started = startedAt === null ? null : parseTimestamp(startedAt);
  const startedOk = started !== null && !Number.isNaN(started);

  // El "hace N s" va en una segunda linea: en la celda no entra junto al
  // estado.
  const staleFor =
    freshness === "stale" && receivedAt !== null
      ? t("realtime.operation.freshness.staleFor", { seconds: Math.floor((now - receivedAt) / 1000) })
      : null;

  return (
    // Celdas separadas por el fondo (gap-px sobre --line) y no con bordes:
    // asi la grilla queda bien en 2 columnas (celular) y en 5. La primera es
    // mas ancha porque "Desactualizados" no entra en un quinto.
    <div className="card grid grid-cols-2 md:grid-cols-[1.4fr_repeat(4,1fr)] gap-px bg-line overflow-hidden">
      <Tile label={t("realtime.operation.data")} wide>
        <span className="flex items-center gap-2">
          <span className={"w-2 h-2 rounded-full shrink-0 " + tone.dot + (tone.pulse ? " pulse-dot" : "")} />
          <span className={tone.text} role="status">
            {t(`realtime.operation.freshness.${freshness}`)}
            {staleFor && <span className="sr-only"> ({staleFor})</span>}
          </span>
        </span>
        {staleFor && (
          <span aria-hidden="true" className="block mt-0.5 text-[11px] font-normal text-muted">
            {staleFor}
          </span>
        )}
      </Tile>
      <Tile label={t("realtime.operation.id")} mono>
        {operationId ?? "—"}
      </Tile>
      <Tile label={t("realtime.operation.start")} mono>
        {startedOk ? formatTime(started) : "—"}
      </Tile>
      <Tile label={t("realtime.operation.duration")} mono>
        {startedOk ? formatDuration(now - started) : "—"}
      </Tile>
      <Tile label={t("realtime.operation.lastUpdate")} mono>
        {lastSampleAt === null ? "—" : formatTime(lastSampleAt)}
      </Tile>
    </div>
  );
}

function Tile({
  label,
  mono = false,
  wide = false,
  children,
}: {
  label: string;
  mono?: boolean;
  /** Ocupa las dos columnas en celular, para que las otras 4 queden pares. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={"bg-surface px-5 py-3.5 min-w-0" + (wide ? " col-span-2 md:col-span-1" : "")}>
      <div className="text-[10px] uppercase tracking-widest text-muted font-mono">{label}</div>
      <div className={"mt-1.5 text-[15px] font-semibold truncate " + (mono ? "font-mono" : "")}>
        {children}
      </div>
    </div>
  );
}

// Franja de la operacion en curso (tarea 3.7), arriba del grafico: si los
// datos estan al dia, ID, hora de inicio, duracion y hora de la ultima
// muestra. Arma los casilleros y los dibuja con el OperationStrip compartido
// (tarea 5.3); lo que depende del WebSocket queda aca.
//
// Se re-renderiza cada segundo (useNow) para que la duracion y el "hace N s"
// avancen aunque no lleguen muestras.
import { useTranslation } from "react-i18next";
import type { WsStatus } from "@/services/websocket/wsClient";
import { OperationStrip } from "@/features/operation-viewer/components/OperationStrip";
import { formatDuration, formatTime } from "@/features/operation-viewer/services/instantValues";
import { useNow } from "../hooks/useNow";
import { dataFreshness, type DataFreshness } from "../services/dataFreshness";
import { parseTimestamp } from "../services/realtimeBuffer";

export interface LiveOperationStripProps {
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

export function LiveOperationStrip({
  operationId,
  startedAt,
  connection,
  hasSelection,
  lastSampleAt,
  receivedAt,
}: LiveOperationStripProps) {
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
    <OperationStrip
      tiles={[
        {
          key: "data",
          label: t("realtime.operation.data"),
          // Mas ancho porque "Desactualizados" no entra en un quinto.
          wide: true,
          value: (
            <>
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
            </>
          ),
        },
        { key: "id", label: t("realtime.operation.id"), mono: true, value: operationId ?? "—" },
        {
          key: "start",
          label: t("realtime.operation.start"),
          mono: true,
          value: startedOk ? formatTime(started) : "—",
        },
        {
          key: "duration",
          label: t("realtime.operation.duration"),
          mono: true,
          value: startedOk ? formatDuration(now - started) : "—",
        },
        {
          key: "lastUpdate",
          label: t("realtime.operation.lastUpdate"),
          mono: true,
          value: lastSampleAt === null ? "—" : formatTime(lastSampleAt),
        },
      ]}
    />
  );
}

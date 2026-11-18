// Medidor de latencia de la pantalla de tiempo real (tarea 3.8, RNF01).
// Se activa abriendo /realtime?latencia; sin el parametro no hace nada.
//
// Mide `hora actual - timestamp de la muestra` en el frame siguiente al
// render que la dibujo. El timestamp se fija en el backend al leer la
// muestra, antes de guardarla, asi que la cifra cubre todo el camino: lectura,
// INSERT, reparto, red, React y pintado. Supone el reloj del navegador y el
// del servidor sincronizados (en desarrollo son la misma maquina).
//
// Con la pestana oculta el navegador deja de dibujar (o lo espacia cada vez
// mas), y la medicion pasa a medir eso y no la transmision. Esas mediciones
// se cuentan aparte (`hidden`) y no entran en el resumen.
//
// Cada REPORT_EVERY mediciones escribe el resumen en la consola. Ademas deja
// `window.__sseLatency` para consultarlo a mano:
//   summary()     resumen de las mediciones validas
//   slow(ms)      mediciones por encima de `ms`, con los segundos desde que
//                 se abrio la pagina y si la pestana estuvo oculta
//   reset()       empieza de cero
// Metodo y resultados: docs/architecture/overview.md.
import { useEffect } from "react";
import {
  latencyProbeEnabled,
  measuredWhileHidden,
  summarizeLatencies,
  type LatencySummary,
} from "../services/latencyStats";

const REPORT_EVERY = 60;
/** Tope de mediciones guardadas: una hora a 1 Hz. */
const MAX_SAMPLES = 3_600;

interface LatencyEntry {
  /** Numero de medicion desde el ultimo reset. */
  index: number;
  ms: number;
  /** Segundos desde que se abrio la pagina. */
  sinceLoad: number;
  hidden: boolean;
}

interface LatencyProbeHandle {
  /** Mediciones validas (pestana visible), en ms. */
  samples: number[];
  /** Todas las mediciones, para diagnosticar las lentas. */
  log: LatencyEntry[];
  /** Mediciones desde el ultimo reset; no baja al descartar las viejas. */
  count: number;
  /** Mediciones descartadas porque la pestana estuvo oculta. */
  hidden: number;
  summary: () => (LatencySummary & { hidden: number }) | null;
  slow: (thresholdMs?: number) => LatencyEntry[];
  reset: () => void;
}

declare global {
  interface Window {
    __sseLatency?: LatencyProbeHandle;
  }
}

/** Ultima vez que la pestana paso a estar visible (epoch ms). */
let shownAt = 0;

function probe(): LatencyProbeHandle {
  if (window.__sseLatency === undefined) {
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) shownAt = Date.now();
    });
    const handle: LatencyProbeHandle = {
      samples: [],
      log: [],
      count: 0,
      hidden: 0,
      summary: () => {
        const summary = summarizeLatencies(handle.samples);
        return summary && { ...summary, hidden: handle.hidden };
      },
      slow: (thresholdMs = 300) => handle.log.filter((entry) => entry.ms > thresholdMs),
      reset: () => {
        handle.samples.length = 0;
        handle.log.length = 0;
        handle.count = 0;
        handle.hidden = 0;
      },
    };
    window.__sseLatency = handle;
  }
  return window.__sseLatency;
}

/** `lastSampleAt`: timestamp (epoch ms) de la ultima muestra dibujada. */
export function useLatencyProbe(lastSampleAt: number | null): void {
  useEffect(() => {
    if (lastSampleAt === null || !latencyProbeEnabled(window.location.search)) return;
    // Se crea al activarse, para escuchar la visibilidad desde el principio.
    const handle = probe();

    // El efecto corre despues del commit; el frame siguiente ya incluye el
    // pintado de esta muestra.
    const id = requestAnimationFrame(() => {
      const ms = Date.now() - lastSampleAt;
      const hidden = measuredWhileHidden({ hiddenNow: document.hidden, shownAt, sampleAt: lastSampleAt });
      handle.count += 1;
      handle.log.push({
        index: handle.count - 1,
        ms,
        sinceLoad: Math.round(performance.now() / 100) / 10,
        hidden,
      });
      if (hidden) {
        handle.hidden += 1;
      } else {
        handle.samples.push(ms);
      }
      if (handle.samples.length > MAX_SAMPLES) handle.samples.shift();
      if (handle.log.length > MAX_SAMPLES) handle.log.shift();
      if (handle.count % REPORT_EVERY === 0) {
        console.info("[latencia] muestra -> pantalla (ms)", handle.summary());
      }
    });
    return () => cancelAnimationFrame(id);
  }, [lastSampleAt]);
}

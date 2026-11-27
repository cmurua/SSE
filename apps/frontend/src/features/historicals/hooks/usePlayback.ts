// Reproduccion de una operacion historica (tarea 5.7): el cursor avanza con
// el reloj, a la velocidad elegida, desde donde esta hasta el fin de la
// ventana. La cuenta (limites y avance) esta en services/playback.ts; aca
// solo el estado y el bucle de cuadros.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  advanceCursor,
  clampCursor,
  DEFAULT_PLAYBACK_SPEED,
  playFrom,
  type AnalysisWindow,
  type PlaybackSpeed,
} from "../services/playback";

/** Tope del avance de un cuadro: si el navegador frena los cuadros (pestana
 *  en segundo plano), el cursor no salta de golpe al volver. */
const MAX_FRAME_MS = 250;

export interface Playback {
  /** Segundos desde el inicio de la operacion, siempre dentro de la ventana. */
  cursor: number;
  playing: boolean;
  speed: PlaybackSpeed;
  /** Play o pausa. Play con el cursor al final arranca desde el inicio. */
  toggle: () => void;
  /** Cursor al inicio de la ventana, en pausa. */
  restart: () => void;
  /** Mover el cursor (barra del cursor). No pausa. */
  seek: (seconds: number) => void;
  setSpeed: (speed: PlaybackSpeed) => void;
}

/** Arranca en pausa con el cursor al final de la ventana: al entrar se ve la
 *  operacion entera, como antes de la reproduccion. */
export function usePlayback(win: AnalysisWindow): Playback {
  const [rawCursor, setRawCursor] = useState(win.end);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<PlaybackSpeed>(DEFAULT_PLAYBACK_SPEED);
  // Al achicar la ventana el cursor queda adentro sin un render de mas.
  const cursor = clampCursor(rawCursor, win);

  // El bucle lee lo ultimo sin reiniciarse en cada cuadro.
  const latest = useRef({ cursor, win, speed });
  latest.current = { cursor, win, speed };

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const elapsed = Math.min(MAX_FRAME_MS, now - last);
      last = now;
      const { cursor: from, win: current, speed: rate } = latest.current;
      const next = advanceCursor(from, elapsed, rate, current);
      latest.current.cursor = next.cursor;
      setRawCursor(next.cursor);
      if (next.ended) {
        setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const toggle = useCallback(() => {
    if (playing) {
      setPlaying(false);
      return;
    }
    const { cursor: from, win: current } = latest.current;
    setRawCursor(playFrom(from, current));
    setPlaying(true);
  }, [playing]);

  const restart = useCallback(() => {
    setPlaying(false);
    setRawCursor(latest.current.win.start);
  }, []);

  const seek = useCallback((seconds: number) => {
    if (Number.isFinite(seconds)) setRawCursor(clampCursor(seconds, latest.current.win));
  }, []);

  return { cursor, playing, speed, toggle, restart, seek, setSpeed };
}

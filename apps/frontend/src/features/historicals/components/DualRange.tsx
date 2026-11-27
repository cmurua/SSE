// Rango con dos manijas sobre un mismo riel (inicio y fin de la ventana de
// analisis, tarea 5.7). Puerto de DualRange en Histories.jsx, con teclado:
// cada manija es un role="slider" y responde como un input type="range"
// (flechas, Re Pag / Av Pag, Inicio y Fin). Con el mouse o el dedo se arrastra
// una manija, o se toca el riel y se mueve la mas cercana.
//
// No decide los limites: avisa el valor pedido y la pagina lo recorta con
// withWindowStart / withWindowEnd (services/playback.ts).
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { percentOf, sliderKeyValue, valueAtFraction } from "../services/playback";

type Thumb = "start" | "end";

export interface DualRangeProps {
  min: number;
  max: number;
  start: number;
  end: number;
  step: number;
  /** Marca del cursor de la reproduccion, si hay. */
  cursor?: number;
  onStartChange: (value: number) => void;
  onEndChange: (value: number) => void;
  startLabel: string;
  endLabel: string;
  /** Texto que lee el lector de pantalla para un valor ("00:12:30"). */
  valueText: (value: number) => string;
}

export function DualRange({
  min,
  max,
  start,
  end,
  step,
  cursor,
  onStartChange,
  onEndChange,
  startLabel,
  endLabel,
  valueText,
}: DualRangeProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRefs = { start: useRef<HTMLDivElement>(null), end: useRef<HTMLDivElement>(null) };
  const [dragging, setDragging] = useState<Thumb | null>(null);

  const change = (thumb: Thumb, value: number) =>
    thumb === "start" ? onStartChange(value) : onEndChange(value);

  const valueAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    return valueAtFraction((clientX - rect.left) / rect.width, min, max, step);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const value = valueAt(event.clientX);
    if (value === null) return;
    // La manija tocada, o la mas cercana al punto del riel. Afuera de la
    // banda, la de ese lado: asi se puede agrandar aunque esten juntas.
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-thumb]")?.dataset.thumb;
    let thumb: Thumb;
    if (target === "start" || target === "end") thumb = target;
    else if (value <= start) thumb = "start";
    else if (value >= end) thumb = "end";
    else thumb = value - start < end - value ? "start" : "end";
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    thumbRefs[thumb].current?.focus();
    setDragging(thumb);
    if (target === undefined) change(thumb, value);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragging === null) return;
    const value = valueAt(event.clientX);
    if (value !== null) change(dragging, value);
  };

  const stopDragging = () => setDragging(null);

  const onKeyDown = (thumb: Thumb) => (event: KeyboardEvent<HTMLDivElement>) => {
    const value = thumb === "start" ? start : end;
    const next = sliderKeyValue(event.key, value, { min, max, step });
    if (next === null) return;
    event.preventDefault();
    change(thumb, next);
  };

  const pctStart = percentOf(start, min, max);
  const pctEnd = percentOf(end, min, max);

  const thumb = (which: Thumb, value: number, pct: number, label: string) => (
    <div
      ref={thumbRefs[which]}
      data-thumb={which}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      aria-valuetext={valueText(value)}
      onKeyDown={onKeyDown(which)}
      className={"dual-range-thumb" + (dragging === which ? " is-dragging" : "")}
      style={{ left: `${pct}%` }}
    />
  );

  return (
    <div
      ref={trackRef}
      className="dual-range"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
    >
      <div className="dual-range-track" />
      <div className="dual-range-band" style={{ left: `${pctStart}%`, right: `${100 - pctEnd}%` }} />
      {cursor !== undefined && (
        <div
          className="dual-range-cursor"
          aria-hidden="true"
          data-testid="range-cursor"
          style={{ left: `${percentOf(cursor, min, max)}%` }}
        />
      )}
      {thumb("start", start, pctStart, startLabel)}
      {thumb("end", end, pctEnd, endLabel)}
    </div>
  );
}

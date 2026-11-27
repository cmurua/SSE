// Contrato vendor-neutral: cualquier libreria de graficos que se elija
// despues debe poder implementarse detras de esta interfaz sin tocar
// las paginas que la consumen (Realtime, OperationDetail).
//
// Son dos partes: las props (que dibujar) y el handle (que se le puede pedir
// al grafico ya dibujado, via `ref`). Un adapter implementa las dos.
import type { ForwardRefExoticComponent, PropsWithoutRef, RefAttributes } from "react";

export interface ChartVariable {
  id: string;
  name: string;
  unit: string;
}

export interface ChartPoint {
  t: number;
  v: number;
}

export type ChartMode = "time" | "xy";

export interface ChartRendererProps {
  /** Hasta 2 (RF05), en orden: Variable A, Variable B. */
  variables: ChartVariable[];
  /** Puntos por ID de variable, ordenados por `t` (epoch ms). */
  data: Record<string, ChartPoint[]>;
  mode: ChartMode;
  title?: string;
  /** Alto del area de dibujo en px. El ancho se adapta al contenedor. */
  height?: number;
  /** Modo "time": ancho fijo del eje X en ms, con el borde derecho en la
   *  ultima muestra (tiempo real: la ventana avanza sola). Sin el, el eje se
   *  ajusta a los datos (historicos). */
  timeWindowMs?: number;
  /** Modo "time": eje X fijo en [desde, hasta] (epoch ms), aunque los datos
   *  cubran solo una parte (historico: la ventana de analisis mientras se
   *  reproduce, para que el grafico avance sin reescalar). Tiene prioridad
   *  sobre `timeWindowMs`. Sin puntos se dibujan los ejes vacios. */
  timeDomain?: [number, number];
}

/** Lo que va arriba del grafico en la imagen exportada. La leyenda (cada
 *  variable con su color y unidad) la agrega el adapter. */
export interface ChartImageOptions {
  /** Primera linea, destacada: la operacion. */
  title: string;
  /** Segunda linea: variables, ventana, instante. */
  subtitle?: string;
}

/** Lo que se le puede pedir a un grafico ya dibujado (via `ref`). */
export interface ChartHandle {
  /** PNG del grafico tal como se ve, con titulo y leyenda. Se genera en el
   *  navegador. Rechaza con ChartImageUnavailableError si en lugar del
   *  grafico hay un mensaje (sin variables, esperando datos). */
  toImage(options: ChartImageOptions): Promise<Blob>;
}

/** Forma de un adapter: un componente con las props del contrato que expone
 *  el handle por `ref`. */
export type ChartAdapter = ForwardRefExoticComponent<
  PropsWithoutRef<ChartRendererProps> & RefAttributes<ChartHandle>
>;

/** No hay grafico dibujado del cual sacar una imagen. */
export class ChartImageUnavailableError extends Error {
  constructor() {
    super("No hay grafico dibujado para exportar");
    this.name = "ChartImageUnavailableError";
  }
}

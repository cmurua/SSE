// Contrato vendor-neutral: cualquier libreria de graficos que se elija
// despues debe poder implementarse detras de esta interfaz sin tocar
// las paginas que la consumen (Realtime, OperationDetail).
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

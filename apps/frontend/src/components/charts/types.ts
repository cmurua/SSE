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
  variables: ChartVariable[];
  data: Record<string, ChartPoint[]>;
  mode: ChartMode;
  title?: string;
  height?: number;
}

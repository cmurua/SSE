// Puerto de Realtime.jsx. Depende de useReactorState (gating por SERMO,
// RF04) y useRealtimeSocket (stream de muestras). El grafico se renderiza
// SIEMPRE via components/charts/ChartRenderer, nunca importando una
// libreria de graficos directamente (ver ADR 0002).
export function RealtimePage() {
  return <div>{/* TODO: portar Realtime.jsx + ControlBarsPanel + ChartRenderer */}</div>;
}

// Se renderiza a HTML con react-dom/server: el proyecto no tiene jsdom, y
// para ver que dibuja el adapter alcanza con el markup (los efectos, como el
// ResizeObserver, no corren y se usa el ancho por defecto).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import "@/i18n";
import type { ChartPoint, ChartRendererProps } from "../../types";
import { PlaceholderChartAdapter } from "./PlaceholderChartAdapter";

const POT = { id: "POTM4", name: "Potencia", unit: "W" };
const REA = { id: "REACTM4", name: "Reactividad", unit: "pcm" };
const points = (values: number[]): ChartPoint[] =>
  values.map((v, i) => ({ t: 1_763_474_400_000 + i * 1000, v }));

function render(props: Partial<ChartRendererProps>) {
  return renderToStaticMarkup(
    <PlaceholderChartAdapter variables={[]} data={{}} mode="time" {...props} />,
  );
}

describe("PlaceholderChartAdapter", () => {
  it("sin variables muestra el estado vacio", () => {
    const html = render({});
    expect(html).toContain("Seleccione una variable");
    expect(html).not.toContain("<svg");
  });

  it("con variables pero sin muestras espera los datos", () => {
    const html = render({ variables: [POT] });
    expect(html).toContain("Esperando datos");
    expect(html).toContain("Potencia");
  });

  it("con una variable dibuja la linea y el area bajo la curva", () => {
    const html = render({ variables: [POT], data: { POTM4: points([5, 5.1, 5.2]) } });
    expect(html).toContain('role="img"');
    expect(html.match(/class="series-stroke"/g)).toHaveLength(1);
    expect(html.match(/class="series-area"/g)).toHaveLength(1);
  });

  it("con dos variables dibuja solo las lineas, con el color de A y de B", () => {
    const html = render({
      variables: [POT, REA],
      data: { POTM4: points([5, 5.1, 5.2]), REACTM4: points([0, 10, 20]) },
      timeWindowMs: 300_000,
    });
    expect(html.match(/class="series-stroke"/g)).toHaveLength(2);
    expect(html).not.toContain('class="series-area"');
    expect(html).toContain('class="series-a"');
    expect(html).toContain('class="series-b"');
    // Doble eje: la leyenda dice cual es cual.
    expect(html).toContain("eje izq.");
    expect(html).toContain("eje der.");
  });

  it("dibuja como mucho 2 variables (RF05)", () => {
    const html = render({
      variables: [POT, REA, { id: "X", name: "Otra", unit: "V" }],
      data: { POTM4: points([1, 2]), REACTM4: points([1, 2]), X: points([1, 2]) },
    });
    expect(html.match(/class="series-stroke"/g)).toHaveLength(2);
    expect(html).not.toContain("Otra");
  });

  it("muestra el titulo", () => {
    expect(render({ title: "Variable vs. tiempo", variables: [POT] })).toContain(
      "Variable vs. tiempo",
    );
  });

  it("modo X·Y: dibuja la trayectoria y resalta el par actual, con A en X y B en Y", () => {
    const html = render({
      variables: [POT, REA],
      data: { POTM4: points([5, 5.1, 5.2]), REACTM4: points([0, 10, 20]) },
      mode: "xy",
    });
    expect(html).toContain('aria-label="Grafico de Reactividad en funcion de Potencia"');
    expect(html.match(/class="chart-trajectory"/g)).toHaveLength(1);
    expect(html.match(/class="chart-current"/g)).toHaveLength(1);
    expect(html).toContain("Potencia [W]");
    expect(html).toContain("Reactividad [pcm]");
    expect(html).toContain("eje X");
    expect(html).toContain("eje Y");
    expect(html).not.toContain("series-stroke");
  });

  it("modo X·Y con una sola variable explica que hacen falta 2", () => {
    const html = render({ variables: [POT], data: { POTM4: points([5]) }, mode: "xy" });
    expect(html).toContain("Elija 2 variables");
    expect(html).not.toContain("<svg");
  });

  it("modo X·Y sin pares todavia espera los datos", () => {
    const html = render({ variables: [POT, REA], data: { POTM4: points([5]) }, mode: "xy" });
    expect(html).toContain("Esperando datos");
  });
});

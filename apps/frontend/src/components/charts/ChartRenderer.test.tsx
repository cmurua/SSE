import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ChartRendererProps } from "./types";

// Un adapter falso en lugar del activo: si ChartRenderer delega, lo que se
// renderiza es lo que devuelve este.
vi.mock("./activeAdapter", () => ({
  activeChartAdapter: (props: ChartRendererProps) => (
    <div data-adapter="fake">
      {props.mode}:{props.variables.map((v) => v.id).join(",")}:{props.timeWindowMs}
    </div>
  ),
}));

const { ChartRenderer } = await import("./ChartRenderer");

describe("ChartRenderer", () => {
  it("delega en el adapter activo y le pasa todas las props", () => {
    const html = renderToStaticMarkup(
      <ChartRenderer
        variables={[{ id: "POTM4", name: "Potencia", unit: "W" }]}
        data={{}}
        mode="time"
        timeWindowMs={300000}
      />,
    );
    expect(html).toBe('<div data-adapter="fake">time:POTM4:300000</div>');
  });
});

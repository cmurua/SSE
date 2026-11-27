import { describe, expect, it } from "vitest";
import { displayedChartMode } from "./chartMode";

describe("displayedChartMode", () => {
  it("muestra el modo X·Y solo con 2 variables, sin olvidar que se eligio", () => {
    expect(displayedChartMode("time", 2)).toBe("time");
    expect(displayedChartMode("xy", 2)).toBe("xy");
    // Con una sola variable no hay X·Y...
    expect(displayedChartMode("xy", 1)).toBe("time");
    expect(displayedChartMode("xy", 0)).toBe("time");
    // ...pero el modo elegido sigue siendo "xy": al volver a 2, vuelve solo.
  });
});

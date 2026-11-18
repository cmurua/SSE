import { describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { displayedChartMode, realtimeScreen, streamOperationId } from "./RealtimePage";

describe("realtimeScreen", () => {
  it("habilita el modulo solo con el reactor operando (RF04)", () => {
    expect(realtimeScreen("operating")).toBe("available");
    expect(realtimeScreen("stopped")).toBe("unavailable");
  });

  it("sin conexion no habilita el modulo ni lo muestra como reactor detenido", () => {
    expect(realtimeScreen("disconnected")).toBe("unknown");
  });

  it("mientras llega el primer estado no decide nada", () => {
    expect(realtimeScreen("loading")).toBe("loading");
  });

  it("conecta el stream solo con el reactor operando, y no lo corta por un corte de reactor.state", () => {
    expect(streamOperationId(null)).toBeNull();
    expect(streamOperationId({ sermo: false, operation_id: null })).toBeNull();
    // `state` es el ultimo valor recibido: sigue ahi aunque la conexion de
    // reactor.state se haya cortado, asi que el stream no se cierra.
    expect(streamOperationId({ sermo: true, operation_id: "OP-1" })).toBe("OP-1");
  });

  it("muestra el modo X·Y solo con 2 variables, sin olvidar que se eligio", () => {
    expect(displayedChartMode("time", 2)).toBe("time");
    expect(displayedChartMode("xy", 2)).toBe("xy");
    // Con una sola variable no hay X·Y...
    expect(displayedChartMode("xy", 1)).toBe("time");
    expect(displayedChartMode("xy", 0)).toBe("time");
    // ...pero el modo elegido sigue siendo "xy": al volver a 2, vuelve solo.
  });

  // Claves que usa la pagina. Si se agrega una, sumarla aca.
  const KEYS = [
    "realtime.title",
    "realtime.unavailable.title",
    "realtime.unavailable.lead",
    "realtime.unavailable.goHistoricals",
    "realtime.unknown.title",
    "realtime.unknown.serverLost",
    "realtime.unknown.signalLost",
    "realtime.loading",
    "realtime.variables.title",
    "realtime.variables.hint",
    "realtime.variables.selected",
    "realtime.variables.none",
    "realtime.variables.remove",
    "realtime.variables.search",
    "realtime.variables.loading",
    "realtime.variables.loadError",
    "realtime.variables.retry",
    "realtime.variables.noResults",
    "realtime.variables.setpoint",
    "realtime.variables.limitReached",
    "realtime.subscribeErrors.invalid_message",
    "realtime.subscribeErrors.unknown_variable",
    "realtime.subscribeErrors.too_many_variables",
    "realtime.subscribeErrors.generic",
    "realtime.mode.label",
    "realtime.mode.time",
    "realtime.mode.xy",
    "realtime.mode.xyNeedsTwo",
    "chart.empty.title",
    "chart.empty.lead",
    "chart.waiting",
    "chart.xyNeedsTwo",
    "chart.axisX",
    "chart.axisY",
    "chart.ariaXY",
    "chart.timeAxis",
    "chart.axisLeft",
    "chart.axisRight",
    "chart.ariaTime",
    "realtime.facts.state",
    "realtime.facts.sermo",
    "realtime.facts.acquisition",
    "realtime.facts.paused",
    "sermo.label",
    "sermo.on",
    "sermo.off",
    "sermo.unknown",
    "sermo.status.stopped",
  ];

  it.each(["es", "en"])("todas las claves tienen traduccion en %s", (lng) => {
    for (const key of KEYS) {
      expect(i18n.exists(key, { lng, ns: "common", fallbackLng: false }), key).toBe(true);
    }
  });
});

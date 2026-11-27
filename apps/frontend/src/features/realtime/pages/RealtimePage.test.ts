import { describe, expect, it } from "vitest";
import i18n from "@/i18n";
import {
  liveExportWindow,
  operationStartedAt,
  realtimeScreen,
  streamOperationId,
} from "./RealtimePage";

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

  it("la hora de inicio es updated_at solo con el reactor operando", () => {
    expect(operationStartedAt(null)).toBeNull();
    expect(operationStartedAt({ sermo: false, updated_at: "2026-11-18T14:00:00Z" })).toBeNull();
    expect(operationStartedAt({ sermo: true, updated_at: "2026-11-18T14:00:00Z" })).toBe(
      "2026-11-18T14:00:00Z",
    );
  });

  // Claves que usa la pagina. Si se agrega una, sumarla aca. Las de los
  // componentes compartidos (viewer.*) se prueban en operation-viewer.
  const KEYS = [
    "realtime.title",
    "realtime.unavailable.title",
    "realtime.unavailable.lead",
    "realtime.unavailable.goHistoricals",
    "realtime.unknown.title",
    "realtime.unknown.serverLost",
    "realtime.unknown.signalLost",
    "realtime.loading",
    "realtime.subscribeErrors.invalid_message",
    "realtime.subscribeErrors.unknown_variable",
    "realtime.subscribeErrors.too_many_variables",
    "realtime.subscribeErrors.generic",
    "realtime.operation.data",
    "realtime.operation.id",
    "realtime.operation.start",
    "realtime.operation.duration",
    "realtime.operation.lastUpdate",
    "realtime.operation.freshness.live",
    "realtime.operation.freshness.stale",
    "realtime.operation.freshness.staleFor",
    "realtime.operation.freshness.connecting",
    "realtime.operation.freshness.waiting",
    "realtime.operation.freshness.idle",
    "realtime.statsWindow",
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

describe("liveExportWindow (nombre del PNG en vivo)", () => {
  const STARTED = "2026-11-27T12:00:00.000Z";
  const at = (seconds: number) => Date.parse(STARTED) + seconds * 1000;

  it("los ultimos 5 min hasta la ultima muestra, desde el inicio de la operacion", () => {
    expect(liveExportWindow(STARTED, at(3600), 300_000)).toEqual({ start: 3300, end: 3600 });
  });

  it("no empieza antes de la operacion", () => {
    expect(liveExportWindow(STARTED, at(120), 300_000)).toEqual({ start: 0, end: 120 });
  });

  it("acepta los timestamps del backend con microsegundos", () => {
    expect(liveExportWindow("2026-11-27T12:00:00.123456+00:00", at(60), 300_000)?.end).toBeCloseTo(
      59.877,
    );
  });

  it("sin inicio o sin muestras no hay ventana", () => {
    expect(liveExportWindow(null, at(60), 300_000)).toBeNull();
    expect(liveExportWindow(STARTED, null, 300_000)).toBeNull();
    expect(liveExportWindow("no es una fecha", at(60), 300_000)).toBeNull();
  });
});

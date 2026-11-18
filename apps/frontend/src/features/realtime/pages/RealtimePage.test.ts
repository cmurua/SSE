import { describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { realtimeScreen } from "./RealtimePage";

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

  // Claves que usa la pagina. Si se agrega una, sumarla aca.
  const KEYS = [
    "realtime.title",
    "realtime.available.title",
    "realtime.available.lead",
    "realtime.unavailable.title",
    "realtime.unavailable.lead",
    "realtime.unavailable.goHistoricals",
    "realtime.unknown.title",
    "realtime.unknown.serverLost",
    "realtime.unknown.signalLost",
    "realtime.loading",
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

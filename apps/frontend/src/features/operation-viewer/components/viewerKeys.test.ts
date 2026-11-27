import { describe, expect, it } from "vitest";
import i18n from "@/i18n";

// Claves que usan los componentes del visor. Si se agrega una, sumarla aca.
const KEYS = [
  "viewer.variables.title",
  "viewer.variables.hint",
  "viewer.variables.selected",
  "viewer.variables.none",
  "viewer.variables.remove",
  "viewer.variables.search",
  "viewer.variables.loading",
  "viewer.variables.loadError",
  "viewer.variables.retry",
  "viewer.variables.noResults",
  "viewer.variables.setpoint",
  "viewer.variables.limitReached",
  "viewer.mode.label",
  "viewer.mode.time",
  "viewer.mode.xy",
  "viewer.mode.xyNeedsTwo",
  "viewer.instant.value",
  "viewer.instant.noData",
  "viewer.instant.min",
  "viewer.instant.mean",
  "viewer.instant.max",
];

describe("traducciones del visor de operacion", () => {
  it.each(["es", "en"])("todas las claves tienen traduccion en %s", (lng) => {
    for (const key of KEYS) {
      expect(i18n.exists(key, { lng, ns: "common", fallbackLng: false }), key).toBe(true);
    }
  });
});

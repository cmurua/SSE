import { describe, expect, it } from "vitest";
import i18n from "@/i18n";
import type { ReactorView } from "@/store/reactorStateStore";
import { describeSermo } from "./SermoIndicator";

const VIEWS: ReactorView[] = ["operating", "stopped", "disconnected", "loading"];

describe("describeSermo", () => {
  it("operando: SERMO ON, verde y pulsando", () => {
    expect(describeSermo({ view: "operating", connection: "open" })).toMatchObject({
      tone: "on",
      signalKey: "sermo.on",
      statusKey: "sermo.status.operating",
      pulse: true,
    });
  });

  it("detenido: SERMO OFF", () => {
    expect(describeSermo({ view: "stopped", connection: "open" })).toMatchObject({
      tone: "off",
      signalKey: "sermo.off",
      statusKey: "sermo.status.stopped",
    });
  });

  it("sin conexion no se muestra como detenido: ni OFF ni DETENIDO, y sin pulso", () => {
    const model = describeSermo({ view: "disconnected", connection: "reconnecting" });
    expect(model).toMatchObject({
      tone: "lost",
      signalKey: "sermo.unknown",
      statusKey: "sermo.status.disconnected",
      pulse: false,
    });
  });

  it("los cuatro estados se distinguen por color y por texto", () => {
    const models = VIEWS.map((view) => describeSermo({ view, connection: "open" }));
    expect(new Set(models.map((m) => m.tone)).size).toBe(VIEWS.length);
    expect(new Set(models.map((m) => m.statusKey)).size).toBe(VIEWS.length);
  });

  it("explica la causa de la desconexion en el tooltip", () => {
    expect(describeSermo({ view: "disconnected", connection: "reconnecting" }).hintKey).toBe(
      "sermo.hint.serverLost",
    );
    expect(describeSermo({ view: "disconnected", connection: "closed" }).hintKey).toBe(
      "sermo.hint.serverLost",
    );
    // WebSocket abierto pero sin senal MQTT (source_connected: false).
    expect(describeSermo({ view: "disconnected", connection: "open" }).hintKey).toBe(
      "sermo.hint.signalLost",
    );
  });

  it.each(["es", "en"])("todas las claves tienen traduccion en %s", (lng) => {
    const connections = ["open", "reconnecting"] as const;
    const keys = new Set(["sermo.label"]);
    for (const view of VIEWS) {
      for (const connection of connections) {
        const model = describeSermo({ view, connection });
        keys.add(model.signalKey).add(model.statusKey).add(model.hintKey);
      }
    }
    for (const key of keys) {
      expect(i18n.exists(key, { lng, ns: "common", fallbackLng: false }), key).toBe(true);
    }
  });
});

import { describe, expect, it } from "vitest";
import { dataFreshness, STALE_AFTER_MS } from "./dataFreshness";

describe("dataFreshness", () => {
  const base = { connection: "open" as const, hasSelection: true, receivedAt: 10_000, now: 10_000 };

  it("al dia mientras llegan muestras", () => {
    expect(dataFreshness(base)).toBe("live");
    expect(dataFreshness({ ...base, now: 10_000 + STALE_AFTER_MS })).toBe("live");
  });

  it("desactualizado pasados 5 s sin muestras", () => {
    expect(STALE_AFTER_MS).toBe(5_000);
    expect(dataFreshness({ ...base, now: 10_001 + STALE_AFTER_MS })).toBe("stale");
  });

  it("sin conexion no se puede decir que este al dia", () => {
    expect(dataFreshness({ ...base, connection: "reconnecting" })).toBe("connecting");
    expect(dataFreshness({ ...base, connection: "connecting" })).toBe("connecting");
  });

  it("sin variables no llegan muestras: no hay nada que marcar", () => {
    expect(dataFreshness({ ...base, hasSelection: false, now: 99_999 })).toBe("idle");
  });

  it("con variables y sin ninguna muestra todavia, espera", () => {
    expect(dataFreshness({ ...base, receivedAt: null })).toBe("waiting");
  });
});

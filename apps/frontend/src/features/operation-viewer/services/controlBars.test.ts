import { describe, expect, it } from "vitest";
import type { ReactorVariable } from "@/types/reactor";
import {
  barPercent,
  barTone,
  controlBarVariables,
  CONTROL_BARS_GROUP,
  latestSnapshot,
  MODERATOR_LEVEL_ID,
  moderatorLevelVariable,
  moderatorStatus,
  panelVariableIds,
} from "./controlBars";

function variable(id: string, group: string, extra: Partial<ReactorVariable> = {}): ReactorVariable {
  return {
    id,
    name: `Senal ${id}`,
    unit: "%",
    group,
    group_name: group,
    min: 0,
    max: 100,
    nominal: 50,
    kind: "medida",
    ...extra,
  };
}

const CATALOG = [
  variable("LOGA1", "SA1"),
  variable("POSBC1", "SBC"),
  variable("NN1", "SCM"),
  variable("POSBC2", "SBC"),
  variable("POSBC3", "SBC"),
  variable("POSBC4", "SBC"),
  variable("POTM4", "SSO"),
];

describe("controlBarVariables", () => {
  it("son las variables del grupo SBC, en el orden del catalogo", () => {
    expect(CONTROL_BARS_GROUP).toBe("SBC");
    expect(controlBarVariables(CATALOG).map((v) => v.id)).toEqual([
      "POSBC1",
      "POSBC2",
      "POSBC3",
      "POSBC4",
    ]);
  });

  it("una barra nueva en el catalogo aparece sin cambiar codigo", () => {
    const withSafetyRod = [...CATALOG, variable("POSBS", "SBC")];
    expect(controlBarVariables(withSafetyRod).map((v) => v.id)).toContain("POSBS");
  });

  it("sin catalogo (cargando) no hay barras", () => {
    expect(controlBarVariables(undefined)).toEqual([]);
  });
});

describe("nivel de moderador", () => {
  it("es NN1 del catalogo (el NIV_MOD del prototipo)", () => {
    expect(MODERATOR_LEVEL_ID).toBe("NN1");
    expect(moderatorLevelVariable(CATALOG)?.id).toBe("NN1");
  });

  it("si el catalogo no lo trae, no hay tanque", () => {
    expect(moderatorLevelVariable(CATALOG.filter((v) => v.id !== "NN1"))).toBeUndefined();
    expect(moderatorLevelVariable(undefined)).toBeUndefined();
  });

  it("el panel lee las barras y el nivel de moderador", () => {
    expect(panelVariableIds(CATALOG)).toEqual(["POSBC1", "POSBC2", "POSBC3", "POSBC4", "NN1"]);
    expect(panelVariableIds(CATALOG.filter((v) => v.id !== "NN1"))).toEqual([
      "POSBC1",
      "POSBC2",
      "POSBC3",
      "POSBC4",
    ]);
  });

  it("usa los umbrales del prototipo", () => {
    expect(moderatorStatus(100)).toBe("nominal");
    expect(moderatorStatus(95)).toBe("nominal");
    expect(moderatorStatus(94.9)).toBe("low");
    expect(moderatorStatus(80)).toBe("low");
    expect(moderatorStatus(79.9)).toBe("critical");
    expect(moderatorStatus(0)).toBe("critical");
    expect(moderatorStatus(null)).toBe("none");
  });
});

describe("barPercent", () => {
  const bar = variable("POSBC1", "SBC");

  it("ubica el valor en la escala del catalogo", () => {
    expect(barPercent(bar, 58.2)).toBeCloseTo(58.2);
    expect(barPercent(variable("X", "SBC", { min: 0, max: 50 }), 25)).toBe(50);
  });

  it("recorta los valores fuera de escala", () => {
    expect(barPercent(bar, -3)).toBe(0);
    expect(barPercent(bar, 120)).toBe(100);
  });

  it("sin dato devuelve null", () => {
    expect(barPercent(bar, undefined)).toBeNull();
    expect(barPercent(bar, null)).toBeNull();
    expect(barPercent(bar, Number.NaN)).toBeNull();
  });
});

describe("barTone", () => {
  it("usa los rangos del prototipo", () => {
    expect(barTone(100)).toBe("high");
    expect(barTone(80.1)).toBe("high");
    expect(barTone(80)).toBe("mid");
    expect(barTone(50.1)).toBe("mid");
    expect(barTone(50)).toBe("low");
    expect(barTone(0.1)).toBe("low");
  });

  it("en 0 o sin dato va en gris", () => {
    expect(barTone(0)).toBe("none");
    expect(barTone(null)).toBe("none");
  });
});

describe("latestSnapshot", () => {
  const T = 1_763_474_400_000;

  it("toma el ultimo punto de cada barra", () => {
    const series = {
      POSBC1: [
        { t: T, v: 10 },
        { t: T + 1000, v: 11 },
      ],
      POSBC2: [{ t: T + 1000, v: 20 }],
    };
    expect(latestSnapshot(["POSBC1", "POSBC2"], series, T + 1000)).toEqual({
      POSBC1: 11,
      POSBC2: 20,
    });
  });

  it("una barra sin datos, o sin dato en la ultima muestra, queda sin dato", () => {
    const series = { POSBC1: [{ t: T, v: 10 }] };
    expect(latestSnapshot(["POSBC1", "POSBC2"], series, T + 1000)).toEqual({
      POSBC1: null,
      POSBC2: null,
    });
  });
});

// Mock reactor variables and operations.
const VARIABLES = [
  { id: "POT_NUC",  name: "Potencia neutrónica",     unit: "W",     min: 0,    max: 10,    nominal: 5.2,   group: "Núcleo" },
  { id: "FLU_NEU",  name: "Flujo de neutrones",      unit: "n/cm²s",min: 0,    max: 1e10,  nominal: 6.3e9, group: "Núcleo" },
  { id: "TEM_NUC",  name: "Temperatura del núcleo",  unit: "°C",    min: 18,   max: 65,    nominal: 32.4,  group: "Núcleo" },
  { id: "TEM_PIL",  name: "Temperatura de pileta",   unit: "°C",    min: 18,   max: 45,    nominal: 27.1,  group: "Refrigeración" },
  { id: "PRE_PRI",  name: "Presión primario",        unit: "kPa",   min: 95,   max: 115,   nominal: 101.4, group: "Refrigeración" },
  { id: "CAU_REF",  name: "Caudal refrigerante",     unit: "L/min", min: 0,    max: 500,   nominal: 312,   group: "Refrigeración" },
  { id: "NIV_PIL",  name: "Nivel de pileta",         unit: "m",     min: 0,    max: 6,     nominal: 5.42,  group: "Refrigeración" },
  { id: "POS_BR1",  name: "Inserción barra control 1", unit: "%",  min: 0,   max: 100,  nominal: 58.2,  group: "Control" },
  { id: "POS_BR2",  name: "Inserción barra control 2", unit: "%",  min: 0,   max: 100,  nominal: 54.7,  group: "Control" },
  { id: "POS_BR3",  name: "Inserción barra control 3", unit: "%",  min: 0,   max: 100,  nominal: 49.4,  group: "Control" },
  { id: "POS_BR4",  name: "Inserción barra control 4", unit: "%",  min: 0,   max: 100,  nominal: 46.8,  group: "Control" },
  { id: "POS_BRS",  name: "Inserción barra de seguridad", unit: "%", min: 0, max: 100,  nominal: 100,   group: "Control" },
  { id: "NIV_MOD",  name: "Nivel moderador en núcleo", unit: "%",  min: 0,   max: 100,  nominal: 98.6,  group: "Núcleo" },
  { id: "PER_REA",  name: "Período del reactor",     unit: "s",     min: -100, max: 1000,  nominal: 240,   group: "Cinética" },
  { id: "REA_NEU",  name: "Reactividad",             unit: "pcm",   min: -300, max: 300,   nominal: 12,    group: "Cinética" },
  { id: "DOS_SAL",  name: "Tasa de dosis · sala",    unit: "µSv/h", min: 0,    max: 50,    nominal: 1.8,   group: "Radiación" },
  { id: "DOS_PIL",  name: "Tasa de dosis · pileta",  unit: "µSv/h", min: 0,    max: 100,   nominal: 4.6,   group: "Radiación" },
  { id: "DOS_VEN",  name: "Dosis aire ventilación",  unit: "Bq/m³", min: 0,    max: 1000,  nominal: 25,    group: "Radiación" },
  { id: "TEM_AMB",  name: "Temperatura sala",        unit: "°C",    min: 15,   max: 30,    nominal: 22.1,  group: "Sala" },
  { id: "HUM_AMB",  name: "Humedad relativa",        unit: "%",     min: 20,   max: 80,    nominal: 48,    group: "Sala" },
  { id: "PRE_ATM",  name: "Presión atmosférica",     unit: "hPa",   min: 980,  max: 1030,  nominal: 1013,  group: "Sala" },
  { id: "VOL_DET1", name: "Voltaje detector CIC-1",  unit: "V",     min: 0,    max: 10,    nominal: 7.2,   group: "Instrumentación" },
  { id: "VOL_DET2", name: "Voltaje detector CIC-2",  unit: "V",     min: 0,    max: 10,    nominal: 7.4,   group: "Instrumentación" },
  { id: "FRE_DET",  name: "Frecuencia conteo BF3",   unit: "cps",   min: 0,    max: 1e6,   nominal: 4.2e5, group: "Instrumentación" },
  { id: "RUI_DET",  name: "Ruido de fondo",          unit: "cps",   min: 0,    max: 200,   nominal: 28,    group: "Instrumentación" },
  { id: "TEN_RED",  name: "Tensión red 380V",        unit: "V",     min: 360,  max: 400,   nominal: 381,   group: "Eléctrico" },
  { id: "COR_BOM",  name: "Corriente bomba primaria",unit: "A",     min: 0,    max: 30,    nominal: 18.4,  group: "Eléctrico" },
  { id: "EST_BOM",  name: "Estado bomba primaria",   unit: "0/1",   min: 0,    max: 1,     nominal: 1,     group: "Eléctrico" },
  { id: "CAU_VEN",  name: "Caudal de ventilación",   unit: "m³/h",  min: 0,    max: 5000,  nominal: 3200,  group: "Ventilación" },
  { id: "PRE_VEN",  name: "Presión sala (depresión)",unit: "Pa",    min: -50,  max: 0,     nominal: -22,   group: "Ventilación" },
  { id: "CON_PH",   name: "pH agua pileta",          unit: "—",     min: 5,    max: 8,     nominal: 6.4,   group: "Química" },
  { id: "CON_O2",   name: "Oxígeno disuelto",        unit: "ppm",   min: 0,    max: 10,    nominal: 4.2,   group: "Química" },
  { id: "CON_CON",  name: "Conductividad",           unit: "µS/cm", min: 0,    max: 50,    nominal: 1.8,   group: "Química" },
];

const OPERATIONS = [
  { id: "OP-2026-041", name: "Calibración detectores BF3",   date: "2026-04-22", durationMin: 142, operator: "Ing. M. Álvarez",  samples: 8520,  notes: "Calibración rutinaria de la cadena BF3. Sin observaciones." },
  { id: "OP-2026-040", name: "Práctica curso Reactores I",   date: "2026-04-18", durationMin:  95, operator: "Dr. R. Pérez",     samples: 5700,  notes: "Sesión práctica con estudiantes de grado." },
  { id: "OP-2026-039", name: "Medición flujo posición C-3",  date: "2026-04-11", durationMin: 188, operator: "Dr. R. Pérez",     samples: 11280, notes: "Mapa de flujo en posición experimental C-3." },
  { id: "OP-2026-038", name: "Curva de calibración potencia",date: "2026-04-04", durationMin: 210, operator: "Ing. M. Álvarez",  samples: 12600, notes: "Calibración de potencia con activación de Au-198." },
  { id: "OP-2026-037", name: "Práctica curso Física Nuclear",date: "2026-03-28", durationMin:  78, operator: "Lic. S. Quiroga",  samples: 4680,  notes: "Curso de posgrado, medición de período." },
  { id: "OP-2026-036", name: "Verificación barra de seguridad", date: "2026-03-21", durationMin: 64, operator: "Ing. M. Álvarez", samples: 3840, notes: "Test de tiempo de caída de barras." },
  { id: "OP-2026-035", name: "Sesión demostrativa visitantes", date: "2026-03-14", durationMin: 45, operator: "Dr. R. Pérez",    samples: 2700,  notes: "Demostración para alumnos secundarios." },
  { id: "OP-2026-034", name: "Práctica curso Reactores II",  date: "2026-03-07", durationMin: 132, operator: "Dr. R. Pérez",     samples: 7920,  notes: "Operación a baja potencia." },
];

// Deterministic pseudo-data generator: smooth curves per variable.
function generateSeries(varDef, points = 120, t0 = 0) {
  const data = [];
  const span = varDef.max - varDef.min;
  const center = varDef.nominal;
  const seed = varDef.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  for (let i = 0; i < points; i++) {
    const t = t0 + i;
    const noise = Math.sin((t + seed) * 0.21) * 0.012 * span
                + Math.sin((t + seed) * 0.07) * 0.025 * span
                + Math.sin((t + seed) * 0.45) * 0.005 * span;
    const drift = Math.sin(t * 0.013 + seed * 0.1) * 0.04 * span;
    const v = center + noise + drift;
    data.push({ t, v: Math.max(varDef.min, Math.min(varDef.max, v)) });
  }
  return data;
}

const USER = {
  name: "Ignacio Borgatello",
  email: "iborgatello@mi.unc.edu.ar",
  role: "Estudiante",
};

window.VARIABLES = VARIABLES;
window.OPERATIONS = OPERATIONS;
window.USER = USER;
window.generateSeries = generateSeries;

// Muestra del catalogo real (app/domains/reactor_data/variable_catalog.py).
// Uso exclusivo en desarrollo local sin backend y en tests unitarios; nunca
// importar desde codigo de produccion.
import type { ReactorVariable } from "@/types/reactor";

export const MOCK_VARIABLES: ReactorVariable[] = [
  {
    id: "LOGA1",
    name: "Logaritmico de Arranque 1",
    unit: "c/s",
    group: "SA1",
    group_name: "Canal de Arranque 1",
    min: 1,
    max: 1e5,
    nominal: 1e3,
    kind: "medida",
  },
  {
    id: "MASC",
    name: "Monitor de Area Sala de Control",
    unit: "uSv/h",
    group: "SMA",
    group_name: "Monitores de Area",
    min: 0,
    max: 50,
    nominal: 1.5,
    kind: "medida",
  },
  {
    id: "NDSC",
    name: "Nivel de Disparo Monitor Sala de Control",
    unit: "uSv/h",
    group: "SMA",
    group_name: "Monitores de Area",
    min: 0,
    max: 50,
    nominal: 25,
    kind: "consigna",
  },
  {
    id: "REACTM4",
    name: "Reactividad",
    unit: "pcm",
    group: "SSO",
    group_name: "Supervision de Operacion",
    min: -300,
    max: 300,
    nominal: 0,
    kind: "medida",
  },
  {
    id: "POTM4",
    name: "Potencia",
    unit: "W",
    group: "SSO",
    group_name: "Supervision de Operacion",
    min: 0,
    max: 10,
    nominal: 5,
    kind: "medida",
  },
];

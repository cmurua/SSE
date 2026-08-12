// Portado de mockData.jsx (prototipo). Uso exclusivo en desarrollo local
// sin backend y en tests unitarios; nunca importar desde codigo de produccion.
import type { ReactorVariable } from "@/types/reactor";

export const MOCK_VARIABLES: ReactorVariable[] = [
  { id: "POT_NUC", name: "Potencia neutronica", unit: "W", group: "Nucleo" },
  { id: "REA_NEU", name: "Reactividad", unit: "pcm", group: "Cinetica" },
];

// Catalogo de senales del reactor (GET /reactor-data/variables). Lo usan
// Tiempo Real y el historico, asi que no vive en ninguno de los dos features.
import { ENDPOINTS } from "./endpoints";
import { httpClient, type RequestOptions } from "./httpClient";
import type { ReactorVariable } from "@/types/reactor";

export const reactorDataApi = {
  getVariables: (options?: RequestOptions) =>
    httpClient.get<ReactorVariable[]>(ENDPOINTS.reactorVariables, options),
};

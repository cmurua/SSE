import { ENDPOINTS } from "@/services/api/endpoints";
import { httpClient, type RequestOptions } from "@/services/api/httpClient";
import type { ReactorState } from "@/types/reactor";

export const realtimeApi = {
  getStatus: () => httpClient.get("/realtime/status"),
  getReactorState: (options?: RequestOptions) =>
    httpClient.get<ReactorState>(ENDPOINTS.reactorState, options),
};

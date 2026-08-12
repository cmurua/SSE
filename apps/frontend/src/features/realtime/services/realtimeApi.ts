import { httpClient } from "@/services/api/httpClient";

export const realtimeApi = {
  getStatus: () => httpClient.get("/realtime/status"),
};

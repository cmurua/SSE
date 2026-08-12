import { httpClient } from "@/services/api/httpClient";

export const historicalsApi = {
  listOperations: (params: { from?: string; to?: string; operationId?: string }) =>
    httpClient.get("/historicals/operations", { params }),
  getOperation: (operationId: string) => httpClient.get(`/historicals/operations/${operationId}`),
};

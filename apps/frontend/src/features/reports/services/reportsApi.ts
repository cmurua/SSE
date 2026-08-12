import { httpClient } from "@/services/api/httpClient";

export const reportsApi = {
  create: (payload: { reportType: string; subject: string; message: string }) =>
    httpClient.post("/reports", payload),
};

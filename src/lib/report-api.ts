import { apiRequest } from "@/lib/api";
import type { Report, ReportQuery } from "@/types/report";

export const reportApi = {
  get: (query: ReportQuery) => {
    const params = new URLSearchParams(
      Object.entries(query).filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== "")
    );
    return apiRequest<Report>(`/reports?${params}`);
  },
};

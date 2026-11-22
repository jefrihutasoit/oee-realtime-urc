import { apiRequest } from "@/lib/api";
import type { Report, ReportQuery } from "@/types/report";
import type { TraceDowntimeReport } from "@/types/trace";

export const reportApi = {
  get: (query: ReportQuery) => {
    const params = new URLSearchParams(
      Object.entries(query).filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== "")
    );
    return apiRequest<Report>(`/reports?${params}`);
  },
  /** OEE with the uploaded downtime of the chosen categories as downtime; `types` undefined = every category. */
  traceDowntime: (q: {
    from: string;
    to: string;
    category: string;
    machines: string[];
    source: "upload" | "signal";
    types?: string[];
  }) => {
    const params = new URLSearchParams({ from: q.from, to: q.to, category: q.category, source: q.source });
    if (q.machines.length) params.set("machines", q.machines.join(","));
    if (q.types) params.set("types", q.types.join(","));
    return apiRequest<TraceDowntimeReport>(`/reports/trace-downtime?${params}`);
  },
};

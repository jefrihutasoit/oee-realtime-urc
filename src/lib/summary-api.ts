import { apiRequest } from "@/lib/api";
import type { MachineCategory } from "@/types/machine";
import type { DailySummary } from "@/types/summary";

export const summaryApi = {
  /** Production dates `from` to `to` (YYYY-MM-DD), inclusive, of one machine category. */
  range: (from: string, to: string, category: MachineCategory = "BAGGER") =>
    apiRequest<DailySummary>(
      `/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&category=${category}`
    ),
};

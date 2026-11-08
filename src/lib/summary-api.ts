import { apiRequest } from "@/lib/api";
import type { DailySummary } from "@/types/summary";

export const summaryApi = {
  /** Production dates `from` to `to` (YYYY-MM-DD), inclusive. */
  range: (from: string, to: string) =>
    apiRequest<DailySummary>(`/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
};

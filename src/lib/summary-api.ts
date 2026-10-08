import { apiRequest } from "@/lib/api";
import type { DailySummary } from "@/types/summary";

export const summaryApi = {
  daily: (date: string) => apiRequest<DailySummary>(`/summary?date=${encodeURIComponent(date)}`),
};

import { apiRequest } from "@/lib/api";
import type { HistoricalData, HourlyDetail } from "@/types/historical";

const query = (params: Record<string, string>) =>
  new URLSearchParams(Object.entries(params).filter(([, v]) => v !== "")).toString();

export interface HistoricalFilter {
  from: string;
  to: string;
  machines: string;
  skus: string;
  shift: string;
}

export const historicalApi = {
  range: (f: HistoricalFilter) => apiRequest<HistoricalData>(`/historical?${query({ ...f })}`),
  hourly: (machine: string, date: string, f: Pick<HistoricalFilter, "skus" | "shift">) =>
    apiRequest<HourlyDetail>(`/historical/hourly?${query({ machine, date, ...f })}`),
};

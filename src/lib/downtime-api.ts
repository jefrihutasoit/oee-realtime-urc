import { apiRequest } from "@/lib/api";
import type {
  DowntimeRecord,
  DowntimeUploadInput,
  DowntimeUploadResult,
  DowntimeValidation,
} from "@/types/downtime";

const json = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

export const downtimeApi = {
  list: (date: string) => apiRequest<DowntimeRecord[]>(`/downtime?date=${encodeURIComponent(date)}`),
  validate: (input: DowntimeUploadInput) => apiRequest<DowntimeValidation>("/downtime/validate", json(input)),
  upload: (input: DowntimeUploadInput) => apiRequest<DowntimeUploadResult>("/downtime/upload", json(input)),
  remove: (id: string) => apiRequest<{ ok: true }>(`/downtime/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

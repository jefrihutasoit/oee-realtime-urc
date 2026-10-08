import { apiRequest } from "@/lib/api";
import type {
  ManualRejectInput,
  RejectRecord,
  RejectType,
  RejectTypeInput,
  RejectUploadInput,
  RejectUploadResult,
  RejectValidation,
  RunningSkus,
} from "@/types/reject";

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const rejectApi = {
  types: () => apiRequest<RejectType[]>("/rejects/types"),
  createType: (input: RejectTypeInput) => apiRequest<RejectType>("/rejects/types", json("POST", input)),
  updateType: (id: string, input: Partial<RejectTypeInput>) =>
    apiRequest<RejectType>(`/rejects/types/${encodeURIComponent(id)}`, json("PATCH", input)),
  removeType: (id: string) =>
    apiRequest<{ ok: true }>(`/rejects/types/${encodeURIComponent(id)}`, { method: "DELETE" }),

  list: (date: string, shiftId?: string) =>
    apiRequest<RejectRecord[]>(
      `/rejects?date=${encodeURIComponent(date)}${shiftId ? `&shiftId=${encodeURIComponent(shiftId)}` : ""}`
    ),
  remove: (id: string) => apiRequest<{ ok: true }>(`/rejects/${encodeURIComponent(id)}`, { method: "DELETE" }),

  validate: (input: RejectUploadInput) => apiRequest<RejectValidation>("/rejects/validate", json("POST", input)),
  upload: (input: RejectUploadInput) => apiRequest<RejectUploadResult>("/rejects/upload", json("POST", input)),

  manualDates: () => apiRequest<string[]>("/rejects/manual/dates"),
  runningSkus: (machineId: string, date: string, shiftId: string) =>
    apiRequest<RunningSkus>(
      `/rejects/manual/skus?machineId=${encodeURIComponent(machineId)}&date=${encodeURIComponent(date)}&shiftId=${encodeURIComponent(shiftId)}`
    ),
  saveManual: (input: ManualRejectInput) => apiRequest<RejectRecord>("/rejects/manual", json("POST", input)),
};

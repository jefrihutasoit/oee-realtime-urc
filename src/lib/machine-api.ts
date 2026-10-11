import { apiRequest } from "@/lib/api";
import type { GatewayTag, MachineInput, MachineRegistration, RealtimeMode } from "@/types/machine";
import type { MachineHistory, MachineMonitoring, MachineOee, MachineTimeline } from "@/types/oee";

/** Settings applied to many machines at once; only the fields given are changed. */
export interface MachineBulkInput {
  machineIds: string[] | "all";
  outputUnit?: string;
  rejectUnit?: string;
  realtimeMode?: RealtimeMode;
  adaptiveTtlMinutes?: number;
}

export const machineApi = {
  list: () => apiRequest<MachineRegistration[]>("/machines"),
  get: (id: string) => apiRequest<MachineRegistration>(`/machines/${encodeURIComponent(id)}`),
  history: (id: string, limit = 30) =>
    apiRequest<MachineHistory>(`/machines/${encodeURIComponent(id)}/history?limit=${limit}`),
  timeline: (id: string) => apiRequest<MachineTimeline>(`/machines/${encodeURIComponent(id)}/timeline`),
  oee: () => apiRequest<MachineOee[]>("/oee"),
  monitoring: (id: string) => apiRequest<MachineMonitoring>(`/oee/${encodeURIComponent(id)}/monitoring`),
  create: (input: MachineInput) =>
    apiRequest<MachineRegistration>("/machines", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, input: Partial<MachineInput>) =>
    apiRequest<MachineRegistration>(`/machines/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  /** Sets units, realtime mode or adaptive expiry on all machines or the given ones. */
  bulkUpdate: (input: MachineBulkInput) =>
    apiRequest<{ updated: number }>("/machines/bulk", { method: "POST", body: JSON.stringify(input) }),
  remove: (id: string) =>
    apiRequest<{ ok: true }>(`/machines/${encodeURIComponent(id)}`, { method: "DELETE" }),
  gatewayTags: () => apiRequest<GatewayTag[]>("/gateway/tags"),
};

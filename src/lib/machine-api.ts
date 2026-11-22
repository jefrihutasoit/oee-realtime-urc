import type { SkuRun } from "@/types/summary";
import { apiRequest } from "@/lib/api";
import type { GatewayTag, MachineInput, MachineRegistration, RealtimeMode, ScaleConfig, ScaleStatus, ScaleTestResult } from "@/types/machine";
import type { MachineHistory, MachineMonitoring, MachineOee, MachineTimeline } from "@/types/oee";
import type { ScaleMonitor } from "@/types/scale";
import type { MachineTrend } from "@/types/trend";

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
  /** SKUs the machine ran in the shift running now, each with its own figures. */
  shiftSkus: (id: string) =>
    apiRequest<ShiftSkus>(`/machines/${encodeURIComponent(id)}/shift-skus`),
  /** Signals and status from `from` to `to` (epoch ms). */
  /**
   * One weight signal with its low / high limit tags and the SKUs run (Scale Monitoring). Empty keys use the
   * defaults (the scale's average weight and limit fields); "none" turns a limit off.
   */
  scaleMonitor: (id: string, from: number, to: number, keys: { signal?: string; low?: string; high?: string } = {}) => {
    const q = new URLSearchParams({ from: new Date(from).toISOString(), to: new Date(to).toISOString() });
    for (const [k, v] of Object.entries(keys)) if (v) q.set(k, v);
    return apiRequest<ScaleMonitor>(`/machines/${encodeURIComponent(id)}/scale-monitor?${q}`);
  },
  trend: (id: string, from: number, to: number) =>
    apiRequest<MachineTrend>(
      `/machines/${encodeURIComponent(id)}/trend?from=${new Date(from).toISOString()}&to=${new Date(to).toISOString()}`
    ),
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
  /** Connection state of the Yamato scales the backend polls. */
  scaleStatus: () => apiRequest<ScaleStatus[]>("/machines/scales/status"),
  /** Reads DS from a scale once (connection test). */
  scaleTest: (input: Pick<ScaleConfig, "host" | "port" | "mcSide">) =>
    apiRequest<ScaleTestResult>("/machines/scales/test", { method: "POST", body: JSON.stringify(input) }),
  gatewayTags: () => apiRequest<GatewayTag[]>("/gateway/tags"),
};

/** GET /machines/:id/shift-skus. */
export interface ShiftSkus {
  shiftName: string;
  start: string;
  end: string;
  skus: SkuRun[];
}

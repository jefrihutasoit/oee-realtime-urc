import { apiRequest } from "@/lib/api";
import type { Shift, ShiftInput, ShiftPeriod } from "@/types/shift";

export const shiftApi = {
  list: () => apiRequest<Shift[]>("/shifts"),
  current: () => apiRequest<ShiftPeriod>("/shifts/current"),
  create: (input: ShiftInput) => apiRequest<Shift>("/shifts", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, input: Partial<ShiftInput>) =>
    apiRequest<Shift>(`/shifts/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) }),
  remove: (id: string) => apiRequest<{ ok: true }>(`/shifts/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

/** "HH:mm" → minutes after midnight. */
export const toMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

/** 450 → "7h 30m". */
export function formatMinutes(total: number) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

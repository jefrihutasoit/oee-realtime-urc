import type { MachineStatus, OeeWaitReason } from "@/types/oee";

export const OEE_TARGET = 85;

/** Short text for why OEE is not counting (see OeeWaitReason). */
export const oeeWaitLabels: Record<OeeWaitReason, string> = {
  NO_SKU: "Waiting for SKU",
  UNREGISTERED_SKU: "SKU not registered",
  MACHINE_OFF: "Paused – machine Off",
};

export const statusStyles: Record<MachineStatus, { label: string; pill: string; dot: string }> = {
  RUN: { label: "Run", pill: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  STOP: { label: "Stop", pill: "bg-amber-50 text-amber-700", dot: "bg-amber-400" },
  OFF: { label: "Off", pill: "bg-slate-100 text-slate-600", dot: "bg-slate-500" },
};

export function oeeBarColor(oee: number) {
  if (oee >= 70) return "bg-emerald-500";
  if (oee >= 55) return "bg-amber-400";
  return "bg-red-500";
}

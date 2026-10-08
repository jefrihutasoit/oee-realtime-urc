import type { LiveStatus, MachineOee, OeeWaitReason } from "@/types/oee";

export const OEE_TARGET = 85;

/** Short text for why OEE is not counting (see OeeWaitReason). */
export const oeeWaitLabels: Record<OeeWaitReason, string> = {
  NO_SKU: "Waiting for SKU",
  UNREGISTERED_SKU: "SKU not registered",
  MACHINE_OFF: "Paused – machine Off",
  RUN_FINISHED: "Run finished – waiting for next run",
};

/**
 * Why OEE is not counting, for display; null when there is nothing to say. A missing or unknown SKU
 * only matters while the machine runs or stops, so it is not shown while the machine is Off.
 */
export function oeeWaitLabel(live: Pick<MachineOee, "waitingFor" | "status"> | null | undefined) {
  if (!live?.waitingFor) return null;
  const skuReason = live.waitingFor === "NO_SKU" || live.waitingFor === "UNREGISTERED_SKU";
  if (skuReason && live.status !== "RUN" && live.status !== "STOP") return null;
  return oeeWaitLabels[live.waitingFor];
}

export const statusStyles: Record<LiveStatus, { label: string; pill: string; dot: string }> = {
  RUN: { label: "Run", pill: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  STOP: { label: "Stop", pill: "bg-amber-50 text-amber-700", dot: "bg-amber-400" },
  OFF: { label: "Off", pill: "bg-slate-100 text-slate-600", dot: "bg-slate-500" },
  BREAKDOWN: { label: "Breakdown", pill: "bg-red-50 text-red-700", dot: "bg-red-500" },
};

export function oeeBarColor(oee: number) {
  if (oee >= 70) return "bg-emerald-500";
  if (oee >= 55) return "bg-amber-400";
  return "bg-red-500";
}

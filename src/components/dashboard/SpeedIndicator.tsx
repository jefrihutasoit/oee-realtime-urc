import { Gauge } from "lucide-react";
import type { MachineSpeed } from "@/types/oee";

// Machine speed against the running SKU's output per minute: green at or above the spec, yellow below it,
// grey while the machine is not running, or without a reading or a registered SKU.

export const SPEED_STYLES: Record<MachineSpeed["state"], { label: string; pill: string; text: string; bar: string }> = {
  ok: { label: "On spec", pill: "bg-emerald-50 text-emerald-700", text: "text-emerald-600", bar: "bg-emerald-500" },
  low: { label: "Below spec", pill: "bg-amber-50 text-amber-700", text: "text-amber-600", bar: "bg-amber-400" },
  idle: { label: "Not running", pill: "bg-slate-100 text-slate-500", text: "text-slate-500", bar: "bg-slate-300" },
  unknown: { label: "No spec", pill: "bg-slate-100 text-slate-500", text: "text-slate-500", bar: "bg-slate-300" },
};

const num = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
export const speedText = (v: number | null) => (v === null ? "—" : num.format(v));

/** "/min" after the output unit, e.g. "pcs/min". */
export const speedUnit = (outputUnit: string) => (outputUnit ? `${outputUnit}/min` : "/min");

function tip(speed: MachineSpeed, unit: string) {
  const reason =
    speed.state === "idle"
      ? "Machine not running, not compared"
      : speed.value === null
        ? "No speed reading"
        : speed.spec === null
          ? "No registered SKU to compare with"
          : SPEED_STYLES[speed.state].label;
  return `Speed ${speedText(speed.value)} ${unit} · SKU spec ${speedText(speed.spec)} ${unit} · ${reason}`;
}

/** Compact pill: speed / spec. */
export function SpeedBadge({ speed, outputUnit, className = "" }: { speed: MachineSpeed; outputUnit: string; className?: string }) {
  const s = SPEED_STYLES[speed.state];
  const unit = speedUnit(outputUnit);
  return (
    <span
      title={tip(speed, unit)}
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums ${s.pill} ${className}`}
    >
      <Gauge size={12} className="shrink-0" aria-hidden />
      {speedText(speed.value)}
      <span className="font-normal opacity-70">/ {speedText(speed.spec)}</span>
    </span>
  );
}

/** Speed with its spec and a bar (full at the spec). */
export function SpeedMeter({ speed, outputUnit, className = "" }: { speed: MachineSpeed; outputUnit: string; className?: string }) {
  const s = SPEED_STYLES[speed.state];
  const unit = speedUnit(outputUnit);
  const share = speed.value !== null && speed.spec ? Math.min((speed.value / speed.spec) * 100, 100) : 0;
  return (
    <div title={tip(speed, unit)} className={className}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
          <Gauge size={13} aria-hidden /> Speed
        </span>
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${s.pill}`}>{s.label}</span>
      </div>
      <p className="mt-0.5 tabular-nums">
        <span className={`text-lg font-semibold ${s.text}`}>{speedText(speed.value)}</span>
        <span className="ml-1 text-xs text-slate-500">
          / {speedText(speed.spec)} {unit}
        </span>
      </p>
      <div className="mt-1 h-1.5 rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${s.bar}`} style={{ width: `${share}%` }} />
      </div>
    </div>
  );
}

import { statusStyles } from "@/config/oee";
import type { MachineStatus, MachineTimeline } from "@/types/oee";

const SEGMENT_COLOR: Record<MachineStatus, string> = {
  RUN: "bg-emerald-500",
  STOP: "bg-amber-400",
  OFF: "bg-slate-400",
};

const hourFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

const HOUR = 3_600_000;

export function duration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

/** Run / Stop / Off bar across the current shift; the part after "now" is left empty. */
export default function OperationTimeline({ data }: { data: MachineTimeline | null }) {
  if (!data) {
    return <div className="h-14 animate-pulse rounded-md bg-slate-100" />;
  }

  const start = Date.parse(data.shiftStart);
  const end = Date.parse(data.shiftEnd);
  const now = Date.parse(data.now);
  const span = end - start;
  const pos = (t: number) => `${Math.min(Math.max(((t - start) / span) * 100, 0), 100)}%`;
  const elapsed = Math.max(Math.round((now - start) / 1000), 1);

  const ticks: number[] = [];
  for (let t = start; t <= end; t += HOUR) ticks.push(t);

  return (
    <div className="space-y-2">
      <div className="relative h-8 overflow-hidden rounded-md bg-[repeating-linear-gradient(135deg,#F1F5F9_0_6px,#E2E8F0_6px_12px)]">
        {data.segments.map((s) => {
          const from = Date.parse(s.start);
          const to = Date.parse(s.end);
          const seconds = Math.round((to - from) / 1000);
          return (
            <div
              key={s.start}
              title={`${statusStyles[s.status].label} · ${timeFmt.format(from)}–${timeFmt.format(to)} (${duration(seconds)})`}
              className={`absolute inset-y-0 ${SEGMENT_COLOR[s.status]}`}
              style={{ left: pos(from), width: `calc(${pos(to)} - ${pos(from)})` }}
            />
          );
        })}
        <div className="absolute inset-y-0 w-0.5 bg-[#1E3A5F]" style={{ left: pos(now) }} title={`Now ${timeFmt.format(now)}`} />
      </div>

      <div className="relative h-4 text-[11px] text-slate-400 tabular-nums">
        {ticks.map((t, i) => (
          <span
            key={t}
            className={`absolute ${i === 0 ? "" : i === ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2"}`}
            style={{ left: pos(t) }}
          >
            {hourFmt.format(t)}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
        {(["RUN", "STOP", "OFF"] as const).map((st) => (
          <span key={st} className="inline-flex items-center gap-1.5 text-slate-600">
            <span className={`size-2.5 rounded-sm ${SEGMENT_COLOR[st]}`} />
            {statusStyles[st].label}
            <span className="font-mono font-medium text-slate-900">{duration(data.totals[st])}</span>
            <span className="text-slate-400">({Math.round((data.totals[st] / elapsed) * 100)}%)</span>
          </span>
        ))}
      </div>
    </div>
  );
}

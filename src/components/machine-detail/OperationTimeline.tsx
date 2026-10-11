"use client";

import { useState } from "react";
import { statusStyles } from "@/config/oee";
import type { MachineTimeline, TimelineStatus } from "@/types/oee";

const SEGMENT: Record<TimelineStatus, { color: string; label: string }> = {
  RUN: { color: "bg-emerald-500", label: statusStyles.RUN.label },
  STOP: { color: "bg-amber-400", label: statusStyles.STOP.label },
  OFF: { color: "bg-slate-400", label: statusStyles.OFF.label },
  // Hatched, so "no reading" is not mistaken for the empty part after now.
  NO_DATA: {
    color: "bg-[repeating-linear-gradient(135deg,var(--color-slate-200)_0_5px,var(--color-slate-300)_5px_10px)]",
    label: "No data",
  },
};

const hourFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** "30m" / "1h" show the last half hour / hour up to now (with a little room after it), "shift" the whole shift. */
type Zoom = "30m" | "1h" | "shift";
const ZOOMS: { value: Zoom; label: string }[] = [
  { value: "30m", label: "Last 30 min" },
  { value: "1h", label: "Last 1 h" },
  { value: "shift", label: "Shift" },
];

export function duration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

/** The visible window and its tick marks. */
function windowOf(zoom: Zoom, start: number, end: number, now: number) {
  if (zoom === "shift") {
    const ticks: number[] = [];
    for (let t = start; t <= end; t += HOUR) ticks.push(t);
    return { from: start, to: end, ticks };
  }
  const span = zoom === "30m" ? 30 * MINUTE : HOUR;
  const step = zoom === "30m" ? 5 * MINUTE : 10 * MINUTE;
  // About 5% of the window is left after now, so the "now" marker stays in view.
  const from = Math.max(start, now - span * 0.95);
  const to = Math.min(end, from + span);
  const ticks: number[] = [];
  for (let t = Math.ceil(from / step) * step; t <= to; t += step) ticks.push(t);
  return { from, to, ticks };
}

/** Run / Stop / Off bar of the current shift, zoomable to the last hour; the part after "now" is left empty. */
export default function OperationTimeline({ data }: { data: MachineTimeline | null }) {
  const [zoom, setZoom] = useState<Zoom>("1h");

  if (!data) {
    return <div className="h-14 animate-pulse rounded-md bg-slate-100" />;
  }

  const start = Date.parse(data.shiftStart);
  const end = Date.parse(data.shiftEnd);
  const now = Date.parse(data.now);
  const view = windowOf(zoom, start, end, now);
  const span = view.to - view.from;
  const pct = (t: number) => Math.min(Math.max(((t - view.from) / span) * 100, 0), 100);
  const elapsed = Math.max(Math.round((now - start) / 1000), 1);
  const legend = (["RUN", "STOP", "OFF", "NO_DATA"] as const).filter((st) => st !== "NO_DATA" || data.totals.NO_DATA > 0);

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-xs" role="group" aria-label="Timeline range">
          {ZOOMS.map((z) => (
            <button
              key={z.value}
              type="button"
              onClick={() => setZoom(z.value)}
              aria-pressed={zoom === z.value}
              className={`rounded-md px-2.5 py-1 font-medium ${
                zoom === z.value ? "bg-(--brand) text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {z.label}
            </button>
          ))}
        </div>
      </div>

      {/* The empty track is the time still to come; recorded time is drawn over it. */}
      <div className="relative h-8 overflow-hidden rounded-md border border-dashed border-slate-300 bg-slate-50">
        {data.segments.map((s) => {
          const from = Date.parse(s.start);
          const to = Date.parse(s.end);
          if (to <= view.from || from >= view.to) return null;
          const seconds = Math.round((to - from) / 1000);
          return (
            <div
              key={s.start}
              title={`${SEGMENT[s.status].label} · ${timeFmt.format(from)}–${timeFmt.format(to)} (${duration(seconds)})`}
              className={`absolute inset-y-0 ${SEGMENT[s.status].color}`}
              // Short stops stay visible at the shift zoom.
              style={{ left: `${pct(from)}%`, width: `${pct(to) - pct(from)}%`, minWidth: 2 }}
            />
          );
        })}
        <div
          className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-(--brand) shadow-[0_0_0_1px_var(--color-surface)]"
          style={{ left: `${pct(now)}%` }}
          title={`Now ${timeFmt.format(now)}`}
        />
      </div>

      <div className="relative h-4 text-[11px] text-slate-400 tabular-nums">
        {/* "Now" under the marker; hour ticks close to it give way. */}
        {now >= view.from && now <= view.to && (
          <span
            className={`absolute font-semibold text-(--brand) ${pct(now) >= 95 ? "-translate-x-full" : "-translate-x-1/2"}`}
            style={{ left: `${pct(now)}%` }}
          >
            Now {hourFmt.format(now)}
          </span>
        )}
        {view.ticks.map((t) => {
          const p = pct(t);
          if (Math.abs(p - pct(now)) < 6) return null;
          return (
            <span
              key={t}
              className={`absolute ${p <= 0 ? "" : p >= 100 ? "-translate-x-full" : "-translate-x-1/2"}`}
              style={{ left: `${p}%` }}
            >
              {hourFmt.format(t)}
            </span>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
        <span className="text-slate-400">Shift so far:</span>
        {legend.map((st) => (
          <span key={st} className="inline-flex items-center gap-1.5 text-slate-600">
            <span className={`size-2.5 rounded-sm ${SEGMENT[st].color}`} />
            {SEGMENT[st].label}
            <span className="font-mono font-medium text-slate-900">{duration(data.totals[st])}</span>
            <span className="text-slate-400">({Math.round((data.totals[st] / elapsed) * 100)}%)</span>
          </span>
        ))}
      </div>
    </div>
  );
}

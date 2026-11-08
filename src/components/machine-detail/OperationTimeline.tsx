"use client";

import { useEffect, useState } from "react";
import { statusStyles } from "@/config/oee";
import { SpeedMeter, speedText } from "@/components/dashboard/SpeedIndicator";
import { machineApi } from "@/lib/machine-api";
import type { MachineSpeed, MachineTimeline, TimelineSegment, TimelineStatus } from "@/types/oee";
import type { MachineTrend } from "@/types/trend";

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
const DAY = 24 * HOUR;

/**
 * "30m" / "1h" show the last half hour / hour up to now (with a little room after it), "shift" the whole
 * shift, "24h" the last 24 hours across shifts.
 */
type Zoom = "30m" | "1h" | "shift" | "24h";
const ZOOMS: { value: Zoom; label: string }[] = [
  { value: "30m", label: "Last 30 min" },
  { value: "1h", label: "Last 1 h" },
  { value: "shift", label: "Shift" },
  { value: "24h", label: "Last 24 h" },
];

/** How often the trend (speed, and status before the shift for 24 h) is reloaded. */
const TREND_REFRESH_MS: Record<Zoom, number> = { "30m": 10_000, "1h": 10_000, shift: 30_000, "24h": 60_000 };

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
  if (zoom === "24h") {
    // Not bounded by the shift; a little room after now, ticks on local hours divisible by 3.
    const from = now - DAY;
    const to = now + DAY * 0.05;
    const ticks: number[] = [];
    for (let t = Math.ceil(from / HOUR) * HOUR; t <= to; t += HOUR) if (new Date(t).getHours() % 3 === 0) ticks.push(t);
    return { from, to, ticks };
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

/** Start of the trend range loaded for a zoom (it always ends at now). */
function trendFrom(zoom: Zoom, shiftStart: number, now: number) {
  if (zoom === "24h") return now - DAY;
  if (zoom === "shift") return shiftStart;
  return Math.max(shiftStart, now - (zoom === "30m" ? 30 : 60) * MINUTE);
}

/** Seconds per status of `segments` between `from` and `to`. */
function totalsOf(segments: TimelineSegment[], from: number, to: number) {
  const totals: Record<TimelineStatus, number> = { RUN: 0, STOP: 0, OFF: 0, NO_DATA: 0 };
  for (const s of segments) {
    const ms = Math.min(Date.parse(s.end), to) - Math.max(Date.parse(s.start), from);
    if (ms > 0) totals[s.status] += Math.round(ms / 1000);
  }
  return totals;
}

function statusAt(segments: TimelineSegment[], t: number): TimelineStatus {
  return segments.find((s) => Date.parse(s.start) <= t && t < Date.parse(s.end))?.status ?? "NO_DATA";
}

interface SpeedStep {
  from: number;
  to: number;
  value: number;
  state: MachineSpeed["state"];
}

/** The speed signal as steps (a value holds until the next reading), each judged against the SKU spec. */
function speedSteps(trend: MachineTrend, segments: TimelineSegment[], spec: number | null): SpeedStep[] | null {
  const signal = trend.signals.find((s) => s.key === "speed");
  if (!signal) return null;
  const rangeFrom = Date.parse(trend.from);
  const rangeTo = Date.parse(trend.to);
  const readings: [number, number][] = [];
  if (signal.start !== null) readings.push([rangeFrom, signal.start]);
  for (const [t, last] of signal.points) readings.push([t, last]);
  return readings.map(([from, value], i) => {
    const to = readings[i + 1]?.[0] ?? rangeTo;
    const running = statusAt(segments, (from + to) / 2) === "RUN";
    const state = !running || value <= 0 ? "idle" : spec === null ? "unknown" : value >= spec ? "ok" : "low";
    return { from, to, value, state };
  });
}

interface Props {
  data: MachineTimeline | null;
  machineId: string;
  outputUnit: string;
  /** Live speed; its spec (the running SKU's output per minute) is the line the speed is judged against. */
  speed: MachineSpeed | null;
}

/** Run / Stop / Off bar with the machine speed under it; zoomable from the last 30 min to the last 24 h. */
export default function OperationTimeline({ data, machineId, outputUnit, speed }: Props) {
  const [zoom, setZoom] = useState<Zoom>("1h");
  const [trend, setTrend] = useState<{ zoom: Zoom; data: MachineTrend } | null>(null);
  // Reloaded when a new shift starts, as the shift's range moves with it.
  const shiftStart = data ? Date.parse(data.shiftStart) : null;

  useEffect(() => {
    if (shiftStart === null) return;
    let cancelled = false;
    const load = () => {
      const now = Date.now();
      machineApi
        .trend(machineId, trendFrom(zoom, shiftStart, now), now)
        .then((t) => !cancelled && setTrend({ zoom, data: t }))
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, TREND_REFRESH_MS[zoom]);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [machineId, zoom, shiftStart]);

  if (!data) {
    return <div className="h-14 animate-pulse rounded-md bg-slate-100" />;
  }

  const start = Date.parse(data.shiftStart);
  const end = Date.parse(data.shiftEnd);
  const now = Date.parse(data.now);
  const view = windowOf(zoom, start, end, now);
  const span = view.to - view.from;
  const pct = (t: number) => Math.min(Math.max(((t - view.from) / span) * 100, 0), 100);
  const current = trend?.zoom === zoom ? trend.data : null;

  // 24 h: the trend's status before this shift, then the live shift timeline.
  const segments =
    zoom === "24h" && current
      ? [
          ...current.status
            .filter((s) => Date.parse(s.start) < start)
            .map((s) => ({ ...s, end: new Date(Math.min(Date.parse(s.end), start)).toISOString() })),
          ...data.segments,
        ]
      : data.segments;
  const loading24h = zoom === "24h" && !current;

  const totalsFrom = zoom === "24h" ? view.from : start;
  const totals = zoom === "24h" ? totalsOf(segments, totalsFrom, now) : data.totals;
  const elapsed = Math.max(Math.round((now - totalsFrom) / 1000), 1);
  const legend = (["RUN", "STOP", "OFF", "NO_DATA"] as const).filter((st) => st !== "NO_DATA" || totals[st] > 0);

  const spec = speed?.spec ?? null;
  const steps = current ? speedSteps(current, segments, spec) : null;

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
      <div
        className={`relative h-8 overflow-hidden rounded-md border border-dashed border-slate-300 bg-slate-50 ${
          loading24h ? "animate-pulse" : ""
        }`}
      >
        {segments.map((s) => {
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
        {zoom === "24h" && start > view.from && (
          // Where the current shift begins.
          <div
            className="absolute inset-y-0 border-l border-dashed border-white/80"
            style={{ left: `${pct(start)}%` }}
            title={`Shift start ${hourFmt.format(start)}`}
          />
        )}
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
        <span className="text-slate-400">{zoom === "24h" ? "Last 24 h:" : "Shift so far:"}</span>
        {legend.map((st) => (
          <span key={st} className="inline-flex items-center gap-1.5 text-slate-600">
            <span className={`size-2.5 rounded-sm ${SEGMENT[st].color}`} />
            {SEGMENT[st].label}
            <span className="font-mono font-medium text-slate-900">{duration(totals[st])}</span>
            <span className="text-slate-400">({Math.round((totals[st] / elapsed) * 100)}%)</span>
          </span>
        ))}
      </div>

      {speed && (
        <SpeedSummary speed={speed} outputUnit={outputUnit} steps={steps?.filter((st) => st.to > view.from) ?? null} />
      )}
    </div>
  );
}

/** The live speed meter (as on the dashboard cards) with the speed over the selected range beside it. */
function SpeedSummary({ speed, outputUnit, steps }: { speed: MachineSpeed; outputUnit: string; steps: SpeedStep[] | null }) {
  // Time-weighted average while running, and the share of running time on spec.
  let runMs = 0;
  let sum = 0;
  let okMs = 0;
  for (const s of steps ?? []) {
    if (s.state === "idle") continue;
    const ms = s.to - s.from;
    runMs += ms;
    sum += s.value * ms;
    if (s.state === "ok") okMs += ms;
  }
  const avg = runMs ? sum / runMs : null;
  const onSpec = speed.spec !== null && runMs > 0 ? Math.round((okMs / runMs) * 100) : null;

  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-2 border-t border-slate-100 pt-2">
      <SpeedMeter speed={speed} outputUnit={outputUnit} className="w-full max-w-64" />
      <div className="flex gap-6 text-xs text-slate-500">
        <div>
          <p>Avg while running</p>
          <p className="font-mono text-sm font-semibold text-slate-900">{speedText(avg)}</p>
        </div>
        {onSpec !== null && (
          <div>
            <p>Running on spec</p>
            <p className="font-mono text-sm font-semibold text-slate-900">{onSpec}%</p>
          </div>
        )}
      </div>
    </div>
  );
}

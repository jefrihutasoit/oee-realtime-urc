"use client";

import { useEffect, useId, useRef, useState } from "react";
import { statusStyles } from "@/config/oee";
import type { TimelineSegment, TimelineStatus } from "@/types/oee";
import type { TrendSignal } from "@/types/trend";

// Line chart of trend signals over time: a step line per signal (a value holds until the next reading),
// a faint min–max band where a bucket held more than one value, one Y axis per unit (or, normalized, every
// signal scaled to its own range on one 0–100% axis), and the machine status as a band under the plot. The hovered time is shared between charts (crosshair); dragging
// across the plot zooms into that part.

export interface ChartSeries {
  signal: TrendSignal;
  color: string;
  /** Index into `axes`; ignored when the chart is normalized. */
  axis: number;
  /** Dash pattern, for series that reuse a color. */
  dash?: string;
}

export interface ChartAxis {
  /** Shown above the axis, e.g. the unit. */
  label: string;
}

export const STATUS_FILL: Record<TimelineStatus, string> = {
  RUN: "var(--color-emerald-500)",
  STOP: "var(--color-amber-400)",
  OFF: "var(--color-slate-400)",
  NO_DATA: "",
};
export const statusLabel = (s: TimelineStatus) => (s === "NO_DATA" ? "No data" : statusStyles[s].label);

const AXIS_W = 46;
const TOP = 26;
const STATUS_H = 8;
/** Plot bottom to the bottom edge: status band, then time labels. */
const BOTTOM = 36;
const MIN_ZOOM_PX = 6;

const num2 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const secFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" });
const dayTimeFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export const formatValue = (v: number | null, unit = "") =>
  v === null ? "—" : `${num2.format(v)}${unit ? ` ${unit}` : ""}`;
/** Time of a reading, with seconds on short ranges and the date on ranges over a day. */
export const formatTime = (t: number, span: number) =>
  (span > 86_400_000 ? dayTimeFmt : span <= 3_600_000 ? secFmt : timeFmt).format(new Date(t));

const MIN = 60_000;
const HOUR = 60 * MIN;
const TICK_STEPS = [MIN, 2 * MIN, 5 * MIN, 10 * MIN, 15 * MIN, 30 * MIN, HOUR, 2 * HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, 24 * HOUR, 48 * HOUR, 168 * HOUR];

/** Time ticks on local clock boundaries, about one per 110px. */
function timeTicks(from: number, to: number, width: number) {
  const want = Math.max(2, Math.floor(width / 110));
  const step = TICK_STEPS.find((s) => (to - from) / s <= want) ?? TICK_STEPS.at(-1)!;
  const offset = new Date(from).getTimezoneOffset() * MIN;
  const ticks: number[] = [];
  for (let t = Math.ceil((from - offset) / step) * step + offset; t <= to; t += step) ticks.push(t);
  const label = (t: number) =>
    step >= 24 * HOUR ? dayFmt.format(new Date(t)) : to - from > 24 * HOUR ? dayTimeFmt.format(new Date(t)) : timeFmt.format(new Date(t));
  return { ticks, label };
}

/** Rounded axis range with about 4 steps; a flat signal gets some room around its value, not crossing zero. */
function niceScale(lo: number, hi: number) {
  if (lo === hi) {
    const pad = Math.abs(lo) * 0.1 || 1;
    hi += pad;
    lo = lo >= 0 && lo - pad < 0 ? 0 : lo - pad;
  }
  const raw = (hi - lo) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag);
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = min; v <= max + step / 2; v += step) ticks.push(Number(v.toPrecision(12)));
  return { min, max, ticks };
}

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const tickLabel = (v: number) => (Math.abs(v) >= 10_000 ? compact.format(v) : num2.format(v));

/** The point of `signal` in effect at time `t` (the last bucket starting at or before it). */
export function pointAt(signal: TrendSignal, t: number) {
  const pts = signal.points;
  let lo = 0;
  let hi = pts.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (pts[mid][0] <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found >= 0 ? pts[found] : null;
}

/** Value of `signal` at time `t`, with the bucket's min / max when `t` is inside a bucket that varied. */
export function valueAt(signal: TrendSignal, t: number, bucketMs: number) {
  const p = pointAt(signal, t);
  if (!p) return { value: signal.start, range: null };
  const inside = t < p[0] + bucketMs && p[2] !== p[3];
  return { value: p[1], range: inside ? ([p[2], p[3]] as const) : null };
}

export const statusAt = (status: TimelineSegment[], t: number) =>
  status.find((s) => Date.parse(s.start) <= t && t < Date.parse(s.end))?.status ?? null;

/** Width of an element, following resizes. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export default function TrendChart({
  series,
  axes,
  from,
  to,
  bucketMs,
  status,
  height,
  hoverT,
  onHover,
  onZoom,
  tooltip,
  label,
  normalized = false,
}: {
  series: ChartSeries[];
  axes: ChartAxis[];
  from: number;
  to: number;
  bucketMs: number;
  status: TimelineSegment[];
  height: number;
  hoverT: number | null;
  onHover: (t: number | null) => void;
  onZoom: (from: number, to: number) => void;
  /** Lines of the tooltip at a time; nothing is shown when omitted. */
  tooltip?: (t: number) => { color?: string; value: string; label: string }[];
  /** Accessible name of the chart. */
  label: string;
  /** Scale every series to its own lowest–highest value on one 0–100% axis; `axes` is not used. */
  normalized?: boolean;
}) {
  const [ref, width] = useWidth();
  const uid = useId().replace(/:/g, "");
  const [drag, setDrag] = useState<{ x0: number; x1: number } | null>(null);
  const [inside, setInside] = useState(false);

  const shownAxes = normalized ? [{ label: "% of range" }] : axes;
  const leftAxes = shownAxes.map((_, i) => i).filter((i) => i % 2 === 0);
  const rightAxes = shownAxes.map((_, i) => i).filter((i) => i % 2 === 1);
  const left = Math.max(1, leftAxes.length) * AXIS_W;
  const right = rightAxes.length ? rightAxes.length * AXIS_W : 14;
  const plotW = Math.max(width - left - right, 10);
  const plotH = height - TOP - BOTTOM;
  const span = Math.max(to - from, 1);
  const x = (t: number) => left + ((Math.min(Math.max(t, from), to) - from) / span) * plotW;
  const tAt = (px: number) => from + ((Math.min(Math.max(px, left), left + plotW) - left) / plotW) * span;

  // Each axis (or, normalized, each series) covers every value its signals reach in the range, including
  // the value held from before it.
  const extent = (list: ChartSeries[]) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of list) {
      if (s.signal.start !== null) {
        lo = Math.min(lo, s.signal.start);
        hi = Math.max(hi, s.signal.start);
      }
      for (const p of s.signal.points) {
        lo = Math.min(lo, p[2]);
        hi = Math.max(hi, p[3]);
      }
    }
    return Number.isFinite(lo) ? { lo, hi } : null;
  };
  const scales = normalized
    ? [{ min: 0, max: 100, ticks: [0, 25, 50, 75, 100] }]
    : axes.map((_, a) => {
        const e = extent(series.filter((s) => s.axis === a));
        return e ? niceScale(e.lo, e.hi) : niceScale(0, 1);
      });
  const y = (a: number, v: number) => {
    const sc = scales[a];
    return TOP + plotH - ((v - sc.min) / (sc.max - sc.min || 1)) * plotH;
  };
  /** Normalized: a series' lowest value sits at 0%, its highest at 100%; a flat one at 50%. */
  const ranges = new Map(series.map((s) => [s.signal.key, normalized ? extent([s]) : null]));
  const ys = (s: ChartSeries, v: number) => {
    if (!normalized) return y(s.axis, v);
    const e = ranges.get(s.signal.key);
    return y(0, !e || e.hi === e.lo ? 50 : ((v - e.lo) / (e.hi - e.lo)) * 100);
  };

  const { ticks, label: tickText } = timeTicks(from, to, plotW);
  const statusY = TOP + plotH + 5;

  const path = (s: ChartSeries) => {
    let d = "";
    let held = s.signal.start;
    if (held !== null) d = `M${x(from)},${ys(s, held)}`;
    for (const [t, last] of s.signal.points) {
      d += held !== null ? `H${x(t)}V${ys(s, last)}` : `M${x(t)},${ys(s, last)}`;
      held = last;
    }
    if (held !== null) d += `H${x(to)}`;
    return d;
  };

  const pointerT = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    return e.clientX - box.left;
  };

  const lines = hoverT !== null && inside && tooltip ? tooltip(hoverT) : null;
  const hoverX = hoverT !== null && hoverT >= from && hoverT <= to ? x(hoverT) : null;

  return (
    <div ref={ref} className="relative select-none">
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label} className="block">
          <defs>
            <clipPath id={`clip-${uid}`}>
              <rect x={left} y={TOP - 2} width={plotW} height={plotH + 4} />
            </clipPath>
            <pattern id={`nodata-${uid}`} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width={6} height={6} style={{ fill: "var(--color-slate-200)" }} />
              <rect width={3} height={6} style={{ fill: "var(--color-slate-300)" }} />
            </pattern>
          </defs>

          {/* Grid of the first axis, and every axis' ticks on its own side. */}
          {scales[0]?.ticks.map((v) => (
            <line key={v} x1={left} x2={left + plotW} y1={y(0, v)} y2={y(0, v)} style={{ stroke: "var(--color-slate-200)" }} />
          ))}
          {shownAxes.map((ax, a) => {
            const onLeft = a % 2 === 0;
            const slot = Math.floor(a / 2);
            const edge = onLeft ? left - slot * AXIS_W : left + plotW + slot * AXIS_W;
            return (
              <g key={a} className="text-[10px]">
                {slot > 0 && (
                  <line x1={edge} x2={edge} y1={TOP} y2={TOP + plotH} style={{ stroke: "var(--color-slate-200)" }} />
                )}
                <text
                  x={onLeft ? edge - 6 : edge + 6}
                  y={TOP - 12}
                  textAnchor={onLeft ? "end" : "start"}
                  className="fill-slate-500 font-medium"
                >
                  {ax.label}
                </text>
                {scales[a].ticks.map((v) => (
                  <text
                    key={v}
                    x={onLeft ? edge - 6 : edge + 6}
                    y={y(a, v) + 3}
                    textAnchor={onLeft ? "end" : "start"}
                    className="fill-slate-400 tabular-nums"
                  >
                    {tickLabel(v)}
                  </text>
                ))}
              </g>
            );
          })}

          <g clipPath={`url(#clip-${uid})`}>
            {series.map((s) =>
              s.signal.points
                .filter((p) => p[2] !== p[3])
                .map((p) => (
                  <rect
                    key={`${s.signal.key}-${p[0]}`}
                    x={x(p[0])}
                    width={Math.max(x(p[0] + bucketMs) - x(p[0]), 1)}
                    y={ys(s, p[3])}
                    height={Math.max(ys(s, p[2]) - ys(s, p[3]), 1)}
                    fill={s.color}
                    opacity={0.16}
                  />
                ))
            )}
            {series.map((s) => (
              <path
                key={s.signal.key}
                d={path(s)}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray={s.dash}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
          </g>

          {/* Status band */}
          {status.map((seg) => (
            <rect
              key={seg.start}
              x={x(Date.parse(seg.start))}
              width={Math.max(x(Date.parse(seg.end)) - x(Date.parse(seg.start)), 0.5)}
              y={statusY}
              height={STATUS_H}
              style={{ fill: seg.status === "NO_DATA" ? `url(#nodata-${uid})` : STATUS_FILL[seg.status] }}
            >
              <title>{statusLabel(seg.status)}</title>
            </rect>
          ))}

          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={TOP + plotH} y2={TOP + plotH + 3} style={{ stroke: "var(--color-slate-300)" }} />
              <text x={x(t)} y={height - 6} textAnchor="middle" className="fill-slate-400 text-[10px]">
                {tickText(t)}
              </text>
            </g>
          ))}
          <line x1={left} x2={left + plotW} y1={TOP + plotH} y2={TOP + plotH} style={{ stroke: "var(--color-slate-300)" }} />

          {hoverX !== null && (
            <>
              <line x1={hoverX} x2={hoverX} y1={TOP} y2={statusY + STATUS_H} style={{ stroke: "var(--color-slate-400)" }} strokeDasharray="3 3" />
              {series.map((s) => {
                const v = valueAt(s.signal, hoverT!, bucketMs).value;
                return v === null ? null : (
                  <circle
                    key={s.signal.key}
                    cx={hoverX}
                    cy={ys(s, v)}
                    r={4}
                    fill={s.color}
                    style={{ stroke: "var(--color-surface)" }}
                    strokeWidth={2}
                  />
                );
              })}
            </>
          )}
          {drag && (
            <rect
              x={Math.min(drag.x0, drag.x1)}
              width={Math.abs(drag.x1 - drag.x0)}
              y={TOP}
              height={plotH}
              style={{ fill: "var(--brand)" }}
              opacity={0.12}
            />
          )}

          <rect
            x={left}
            y={TOP}
            width={plotW}
            height={plotH + 5 + STATUS_H}
            fill="transparent"
            className="cursor-crosshair"
            onPointerEnter={() => setInside(true)}
            onPointerMove={(e) => {
              const px = pointerT(e);
              onHover(tAt(px));
              if (drag) setDrag({ ...drag, x1: Math.min(Math.max(px, left), left + plotW) });
            }}
            onPointerLeave={() => {
              setInside(false);
              onHover(null);
            }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              const px = pointerT(e);
              setDrag({ x0: px, x1: px });
            }}
            onPointerUp={() => {
              if (drag && Math.abs(drag.x1 - drag.x0) >= MIN_ZOOM_PX) {
                const a = tAt(Math.min(drag.x0, drag.x1));
                const b = tAt(Math.max(drag.x0, drag.x1));
                if (b - a >= 1000) onZoom(a, b);
              }
              setDrag(null);
            }}
            onPointerCancel={() => setDrag(null)}
          />
        </svg>
      )}
      {lines && hoverX !== null && (
        <div
          className={`pointer-events-none absolute top-2 z-10 theme-fixed rounded-md bg-slate-900 px-2.5 py-1.5 text-[11px] whitespace-nowrap text-white shadow ${
            hoverX > width / 2 ? "-translate-x-full" : ""
          }`}
          style={{ left: hoverX > width / 2 ? hoverX - 10 : hoverX + 10 }}
        >
          {lines.map((l, i) => (
            <div key={i} className="flex items-center gap-1.5">
              {l.color && <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: l.color }} />}
              <span className="font-semibold tabular-nums">{l.value}</span>
              <span className="text-slate-300">{l.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

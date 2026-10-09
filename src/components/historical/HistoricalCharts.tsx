"use client";

import { useState } from "react";

/** Categorical slots in fixed order (validated light palette); a series keeps its slot by position. */
export const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];

const W = 720;
const H = 240;
const PAD = { top: 12, right: 16, bottom: 26, left: 40 };
const plotW = W - PAD.left - PAD.right;
const plotH = H - PAD.top - PAD.bottom;

const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" });
const longFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
const dateOf = (ymd: string) => new Date(`${ymd}T00:00:00`);

export interface TrendSeries {
  key: string;
  label: string;
  color: string;
  /** One value per date; null leaves a gap. */
  values: (number | null)[];
}

/** Daily percentages, one 2px line per series, with a crosshair tooltip listing every series. */
export function TrendChart({ dates, series, metric }: { dates: string[]; series: TrendSeries[]; metric: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const top = Math.max(100, ...series.flatMap((s) => s.values.map((v) => v ?? 0)));
  const max = Math.ceil(top / 20) * 20;
  const n = dates.length;
  const x = (i: number) => PAD.left + (n <= 1 ? plotW / 2 : (plotW * i) / (n - 1));
  const y = (v: number) => PAD.top + plotH - (plotH * v) / max;
  const step = Math.max(1, Math.ceil(n / 10));
  const ticks = Array.from({ length: max / 20 + 1 }, (_, i) => i * 20);

  const segmentsOf = (values: (number | null)[]) => {
    const out: { i: number; v: number }[][] = [];
    values.forEach((v, i) => {
      if (v === null) return;
      const last = out.at(-1);
      if (last && last.at(-1)!.i === i - 1) last.push({ i, v });
      else out.push([{ i, v }]);
    });
    return out;
  };

  const pick = (clientX: number, rect: DOMRect) => {
    const px = ((clientX - rect.left) / rect.width) * W;
    const i = n <= 1 ? 0 : Math.round(((px - PAD.left) / plotW) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  };

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none"
        role="img"
        aria-label={`${metric} per day`}
        onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setHover(null)}
      >
        <g className="text-[10px]">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth={1} />
              <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end" className="fill-slate-400">
                {t}%
              </text>
            </g>
          ))}
          {dates.map((d, i) =>
            i % step === 0 || i === n - 1 ? (
              <text key={d} x={x(i)} y={H - 8} textAnchor="middle" className="fill-slate-400">
                {dayFmt.format(dateOf(d))}
              </text>
            ) : null
          )}
        </g>
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke="#94a3b8" strokeDasharray="3 3" />
        )}
        {series.map((s) =>
          segmentsOf(s.values).map((seg) => (
            <g key={`${s.key}-${seg[0].i}`}>
              <polyline
                points={seg.map((p) => `${x(p.i)},${y(p.v)}`).join(" ")}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {seg.length === 1 && <circle cx={x(seg[0].i)} cy={y(seg[0].v)} r={4} fill={s.color} />}
            </g>
          ))
        )}
        {hover !== null &&
          series.map((s) =>
            s.values[hover] === null ? null : (
              <circle key={s.key} cx={x(hover)} cy={y(s.values[hover]!)} r={4.5} fill={s.color} stroke="#fff" strokeWidth={2} />
            )
          )}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-md bg-slate-900 px-2.5 py-1.5 text-[11px] whitespace-nowrap text-white shadow"
          style={
            x(hover) > W / 2
              ? { right: `${100 - (x(hover) / W) * 100 + 1.5}%` }
              : { left: `${(x(hover) / W) * 100 + 1.5}%` }
          }
        >
          <div className="mb-1 text-slate-300">{longFmt.format(dateOf(dates[hover]))}</div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-2">
              <span className="h-0.5 w-3 rounded" style={{ background: s.color }} />
              <span className="font-semibold tabular-nums">
                {s.values[hover] === null ? "—" : `${s.values[hover]!.toFixed(1)}%`}
              </span>
              <span className="text-slate-300">{s.label}</span>
            </div>
          ))}
        </div>
      )}
      {series.length > 1 && (
        <div className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-slate-600">
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Single-value ring (0–100%); the value is printed beside it. */
export function Ring({ value, color }: { value: number | null; color: string }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const share = Math.min(Math.max(value ?? 0, 0), 100) / 100;
  return (
    <svg viewBox="0 0 56 56" className="size-14 shrink-0" aria-hidden>
      <circle cx={28} cy={28} r={r} fill="none" stroke="#e2e8f0" strokeWidth={7} />
      {share > 0 && (
        <circle
          cx={28}
          cy={28}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={7}
          strokeDasharray={`${c * share} ${c}`}
          transform="rotate(-90 28 28)"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

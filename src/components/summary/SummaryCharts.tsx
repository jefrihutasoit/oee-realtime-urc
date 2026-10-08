"use client";

import { useState } from "react";

const hourFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const fmt = new Intl.NumberFormat("en-US");

const W = 640;
const H = 220;
const PAD = { top: 12, right: 12, bottom: 26, left: 44 };
const plotW = W - PAD.left - PAD.right;
const plotH = H - PAD.top - PAD.bottom;

/** Round axis maximum and 4 tick steps. */
function niceMax(value: number) {
  if (value <= 0) return 4;
  const step = 10 ** Math.floor(Math.log10(value / 4));
  const unit = [1, 2, 2.5, 5, 10].map((m) => m * step).find((u) => u * 4 >= value) ?? step * 10;
  return unit * 4;
}

function Axes({ max, hours, format }: { max: number; hours: string[]; format: (v: number) => string }) {
  const slot = plotW / hours.length;
  return (
    <g className="text-[10px]" fill="currentColor">
      {[0, 1, 2, 3, 4].map((i) => {
        const y = PAD.top + plotH - (plotH * i) / 4;
        return (
          <g key={i}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="#e2e8f0" strokeWidth={1} />
            <text x={PAD.left - 6} y={y + 3} textAnchor="end" className="fill-slate-400">
              {format((max * i) / 4)}
            </text>
          </g>
        );
      })}
      {hours.map((h, i) =>
        i % 2 === 0 ? (
          <text key={h} x={PAD.left + slot * i + slot / 2} y={H - 8} textAnchor="middle" className="fill-slate-400">
            {hourFmt.format(new Date(h))}
          </text>
        ) : null
      )}
    </g>
  );
}

function Tooltip({ x, lines }: { x: number; lines: string[] }) {
  return (
    <div
      className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-md bg-slate-900 px-2 py-1 text-[11px] whitespace-nowrap text-white shadow"
      style={{ left: `${(x / W) * 100}%` }}
    >
      {lines.map((l) => (
        <div key={l}>{l}</div>
      ))}
    </div>
  );
}

/** Hourly OEE line with area; hours without counted time leave a gap. */
export function OeeTrendChart({ data, color = "#22A447" }: { data: { hour: string; oee: number | null }[]; color?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const slot = plotW / data.length;
  const x = (i: number) => PAD.left + slot * i + slot / 2;
  const y = (v: number) => PAD.top + plotH - (plotH * Math.min(v, 100)) / 100;

  // Consecutive hours with data form one segment.
  const segments: { i: number; v: number }[][] = [];
  data.forEach((d, i) => {
    if (d.oee === null) return;
    const last = segments.at(-1);
    if (last && last.at(-1)!.i === i - 1) last.push({ i, v: d.oee });
    else segments.push([{ i, v: d.oee }]);
  });
  const h = hover !== null ? data[hover] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="OEE per hour">
        <Axes max={100} hours={data.map((d) => d.hour)} format={(v) => `${v}%`} />
        {segments.map((seg) => {
          const line = seg.map((p) => `${x(p.i)},${y(p.v)}`).join(" ");
          const area = `${x(seg[0].i)},${y(0)} ${line} ${x(seg.at(-1)!.i)},${y(0)}`;
          return (
            <g key={seg[0].i}>
              <polygon points={area} fill={color} opacity={0.12} />
              <polyline points={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
              {seg.length === 1 && <circle cx={x(seg[0].i)} cy={y(seg[0].v)} r={4} fill={color} />}
            </g>
          );
        })}
        {h && h.oee !== null && hover !== null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke="#94a3b8" strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(h.oee)} r={5} fill={color} stroke="#fff" strokeWidth={2} />
          </>
        )}
        {data.map((d, i) => (
          <rect
            key={d.hour}
            x={PAD.left + slot * i}
            y={PAD.top}
            width={slot}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>
      {h && hover !== null && (
        <Tooltip x={x(hover)} lines={[hourFmt.format(new Date(h.hour)), h.oee === null ? "No data" : `OEE ${h.oee.toFixed(1)}%`]} />
      )}
    </div>
  );
}

const OUTPUT_COLOR = "#1E6FD9";
const REJECT_COLOR = "#E5484D";

/** Output and reject per hour as paired bars on one axis (pcs). */
export function OutputRejectChart({ data }: { data: { hour: string; output: number; reject: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(...data.map((d) => Math.max(d.output, d.reject))));
  const slot = plotW / data.length;
  const barW = Math.max(3, Math.min(10, slot / 2 - 3));
  const y = (v: number) => PAD.top + plotH - (plotH * v) / max;
  const h = hover !== null ? data[hover] : null;

  /** Bar with a 2px rounded top, anchored to the baseline. */
  const bar = (x: number, v: number, color: string) => {
    if (v <= 0) return null;
    const top = Math.min(y(v), PAD.top + plotH - 1);
    const height = PAD.top + plotH - top;
    return <rect x={x} y={top} width={barW} height={height} rx={Math.min(2, height / 2)} fill={color} />;
  };

  return (
    <div className="relative">
      <div className="mb-1 flex gap-4 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: OUTPUT_COLOR }} /> Output
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: REJECT_COLOR }} /> Reject
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Output and reject per hour">
        <Axes max={max} hours={data.map((d) => d.hour)} format={(v) => fmt.format(Math.round(v))} />
        {data.map((d, i) => {
          const center = PAD.left + slot * i + slot / 2;
          return (
            <g key={d.hour}>
              {hover === i && <rect x={PAD.left + slot * i} y={PAD.top} width={slot} height={plotH} fill="#f1f5f9" />}
              {bar(center - barW - 1, d.output, OUTPUT_COLOR)}
              {bar(center + 1, d.reject, REJECT_COLOR)}
              <rect
                x={PAD.left + slot * i}
                y={PAD.top}
                width={slot}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        })}
      </svg>
      {h && hover !== null && (
        <Tooltip
          x={PAD.left + slot * hover + slot / 2}
          lines={[hourFmt.format(new Date(h.hour)), `Output ${fmt.format(h.output)} pcs`, `Reject ${fmt.format(h.reject)} pcs`]}
        />
      )}
    </div>
  );
}

/** Donut with a centre label; slices separated by a 2px surface gap. */
export function Donut({
  slices,
  center,
  sub,
}: {
  slices: { label: string; value: number; color: string }[];
  center: string;
  sub: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = 52;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg viewBox="0 0 140 140" className="size-36 shrink-0" role="img" aria-label={`${center} ${sub}`}>
      <circle cx={70} cy={70} r={r} fill="none" stroke="#f1f5f9" strokeWidth={22} />
      {total > 0 &&
        slices.map((s, i) => {
          const len = (s.value / total) * c;
          const gap = slices.filter((x) => x.value > 0).length > 1 ? 2 : 0;
          const el = (
            <circle
              key={s.label}
              cx={70}
              cy={70}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={hover === i ? 26 : 22}
              strokeDasharray={`${Math.max(len - gap, 0)} ${c}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 70 70)"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <title>{`${s.label}: ${Math.round((s.value / total) * 100)}%`}</title>
            </circle>
          );
          offset += len;
          return s.value > 0 ? el : null;
        })}
      <text x={70} y={68} textAnchor="middle" className="fill-slate-900 text-[22px] font-semibold">
        {center}
      </text>
      <text x={70} y={86} textAnchor="middle" className="fill-slate-500 text-[10px]">
        {sub}
      </text>
    </svg>
  );
}

"use client";

import { useState } from "react";
import { YAMATO_GROUPS } from "@/config/yamato";
import type { ScaleTestResult as Result } from "@/types/machine";

const LINE = 54;
const num = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });

/** Value as read: numbers formatted, text as sent, unreadable as "—". */
const show = (v: string | null) => (v === null ? "—" : Number.isFinite(Number(v)) ? num.format(Number(v)) : v);

/**
 * Every field of one DS read (ticking one adds it to the scale's data), then the raw 324-character
 * payload with offsets. Hovering a field marks its characters in the raw payload.
 */
export default function ScaleTestResult({
  result,
  chosen,
  onTick,
}: {
  result: Result;
  chosen: Set<string>;
  onTick: (key: string, on: boolean) => void;
}) {
  const [hover, setHover] = useState<{ offset: number; length: number } | null>(null);
  const lines = Array.from({ length: Math.ceil(result.payload.length / LINE) }, (_, i) => i * LINE);
  const marked = (i: number) => hover !== null && i >= hover.offset && i < hover.offset + hover.length;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <p className="text-sm font-medium text-slate-700">
          All data <span className="font-normal text-slate-500">· tick to add to the realtime tags</span>
        </p>
        {YAMATO_GROUPS.map((group) => (
          <div key={group}>
            <p className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">{group}</p>
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
              {result.fields
                .filter((f) => f.group === group)
                .map((f) => (
                  <label
                    key={f.key}
                    onMouseEnter={() => setHover(f)}
                    onMouseLeave={() => setHover(null)}
                    title={`Offset ${f.offset}, ${f.length} chars, raw "${f.raw}"`}
                    className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={chosen.has(f.key)}
                      onChange={(e) => onTick(f.key, e.target.checked)}
                      className="size-4 accent-(--brand)"
                    />
                    <span className="min-w-0 flex-1 truncate text-slate-600">{f.label}</span>
                    <span className="font-mono font-semibold text-slate-900 tabular-nums">{show(f.value)}</span>
                    {f.unit && <span className="w-12 text-xs text-slate-400">{f.unit}</span>}
                  </label>
                ))}
            </div>
          </div>
        ))}
      </div>

      <div>
        <p className="mb-1 text-sm font-medium text-slate-700">
          Raw DS payload <span className="font-normal text-slate-500">· {result.payload.length} chars, spaces shown as ·, control bytes as ¤</span>
        </p>
        <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 font-mono text-[12px] leading-5 text-slate-200 theme-fixed">
          {lines.map((start) => (
            <div key={start}>
              <span className="mr-3 text-slate-500 select-none">{String(start).padStart(3, "0")}</span>
              {[...result.payload.slice(start, start + LINE)].map((ch, j) => {
                const i = start + j;
                return (
                  <span
                    key={i}
                    className={marked(i) ? "rounded-sm bg-amber-400 text-slate-900" : ch === " " ? "text-slate-600" : undefined}
                  >
                    {ch === " " ? "·" : ch < " " || ch > "~" ? "¤" : ch}
                  </span>
                );
              })}
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}

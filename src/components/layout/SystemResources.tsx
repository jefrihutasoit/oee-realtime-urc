"use client";

import { useEffect, useState } from "react";
import { Cpu, HardDrive, MemoryStick } from "lucide-react";
import { apiRequest } from "@/lib/api";
import type { SystemResources as Resources } from "@/types/system";

const REFRESH_MS = 5000;

const gb = (bytes: number) => {
  const g = bytes / 1024 ** 3;
  return g >= 100 ? g.toFixed(0) : g.toFixed(1);
};

/** Green below 70%, amber to 90%, red above. */
const tone = (p: number | null) =>
  p === null ? "bg-slate-500" : p >= 90 ? "bg-red-500" : p >= 70 ? "bg-amber-400" : "bg-emerald-500";
const textTone = (p: number | null) =>
  p === null ? "text-slate-400" : p >= 90 ? "text-red-400" : p >= 70 ? "text-amber-300" : "text-slate-200";

/**
 * Server CPU, memory and storage at the bottom of the sidebar: percentages only while it is collapsed, with the
 * used / total figures when it is expanded. Refreshed every few seconds.
 */
export default function SystemResources({ collapsed }: { collapsed: boolean }) {
  const [data, setData] = useState<Resources | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      apiRequest<Resources>("/system/resources")
        .then((r) => alive && setData(r))
        .catch(() => {});
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const rows = [
    {
      key: "cpu",
      label: "CPU",
      icon: Cpu,
      percent: data?.cpu.percent ?? null,
      detail: data ? `${data.cpu.cores} cores` : "",
    },
    {
      key: "mem",
      label: "Memory",
      icon: MemoryStick,
      percent: data?.memory.percent ?? null,
      detail: data ? `${gb(data.memory.usedBytes)} / ${gb(data.memory.totalBytes)} GB` : "",
    },
    {
      key: "disk",
      label: "Storage",
      icon: HardDrive,
      percent: data?.disk?.percent ?? null,
      detail: data?.disk ? `${gb(data.disk.usedBytes)} / ${gb(data.disk.totalBytes)} GB` : "—",
    },
  ];
  const pctText = (p: number | null) => (p === null ? "—" : `${Math.round(p)}%`);

  if (collapsed) {
    return (
      <div className="space-y-1.5 border-t border-white/10 px-2 py-3" aria-label="Server resources">
        {rows.map((r) => (
          <div key={r.key} title={`${r.label} ${pctText(r.percent)}${r.detail ? ` · ${r.detail}` : ""}`}>
            <div className="flex items-center justify-between text-[10px]">
              <r.icon size={11} className="text-slate-400" />
              <span className={`font-semibold tabular-nums ${textTone(r.percent)}`}>{pctText(r.percent)}</span>
            </div>
            <div className="mt-0.5 h-1 rounded-full bg-white/10">
              <div className={`h-full rounded-full ${tone(r.percent)}`} style={{ width: `${Math.min(r.percent ?? 0, 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2.5 border-t border-white/10 px-4 py-3" aria-label="Server resources">
      <p className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">Server</p>
      {rows.map((r) => (
        <div key={r.key}>
          <div className="flex items-center gap-2 text-xs">
            <r.icon size={13} className="shrink-0 text-slate-400" />
            <span className="text-slate-300">{r.label}</span>
            <span className="ml-auto truncate text-[11px] text-slate-500 tabular-nums">{r.detail}</span>
            <span className={`w-9 text-right font-semibold tabular-nums ${textTone(r.percent)}`}>{pctText(r.percent)}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-white/10">
            <div className={`h-full rounded-full ${tone(r.percent)}`} style={{ width: `${Math.min(r.percent ?? 0, 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

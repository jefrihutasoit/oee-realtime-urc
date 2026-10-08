import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { OEE_TARGET, oeeWaitLabel } from "@/config/oee";
import type { LiveMachine } from "@/hooks/useLiveMachines";
import { useMachineLabel } from "@/lib/machine-label";
import type { LiveStatus } from "@/types/oee";
import SkuImage from "./SkuImage";

export type PinState = LiveStatus | "NO_DATA" | "INACTIVE";

/** Lamp colours per state; hex because they also drive the 3D materials. */
export const PIN_STYLES: Record<PinState, { label: string; color: string }> = {
  RUN: { label: "Run", color: "#22c55e" },
  STOP: { label: "Stop", color: "#f59e0b" },
  OFF: { label: "Off", color: "#64748b" },
  BREAKDOWN: { label: "Breakdown", color: "#ef4444" },
  NO_DATA: { label: "No data", color: "#94a3b8" },
  INACTIVE: { label: "Inactive", color: "#cbd5e1" },
};

export const pinStateOf = (m: LiveMachine): PinState => (!m.isActive ? "INACTIVE" : (m.status ?? "NO_DATA"));

const fmt = new Intl.NumberFormat("en-US");

function duration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

/** Live details of one machine, shown on hover in the 3D layout and on the dashboard. */
export default function MachineInfoCard({ machine }: { machine: LiveMachine }) {
  const state = pinStateOf(machine);
  const { color, label } = PIN_STYLES[state];
  const live = machine.live;
  const sku = live && live.sku.code !== "-" ? live.sku : null;
  const waitLabel = oeeWaitLabel(live);
  const name = useMachineLabel();

  return (
    <div className="w-64 overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-xl">
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
        <span className="size-2.5 rounded-full" style={{ background: color }} />
        <span className="font-semibold text-slate-900">{machine.machineNo}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-slate-500">{machine.machineName}</span>
        <span className="rounded px-1.5 py-0.5 text-[11px] font-medium" style={{ background: `${color}22`, color }}>
          {label}
        </span>
      </div>

      {!machine.isActive ? (
        <p className="px-3 py-3 text-xs text-slate-500">{name.one} is inactive.</p>
      ) : !machine.oeeEnabled ? (
        <p className="px-3 py-3 text-xs text-slate-500">Status only – OEE is disabled for this {name.one.toLowerCase()}.</p>
      ) : !live ? (
        <p className="px-3 py-3 text-xs text-slate-500">Waiting for the first OEE calculation…</p>
      ) : (
        <div className="space-y-2.5 px-3 py-2.5">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[11px] text-slate-500">OEE</p>
              <p
                className={`text-2xl leading-none font-semibold tabular-nums ${
                  live.oee >= OEE_TARGET ? "text-emerald-600" : live.oee >= 60 ? "text-amber-600" : "text-red-600"
                }`}
              >
                {live.oee.toFixed(1)}%
              </p>
            </div>
            <dl className="grid grid-cols-3 gap-2 text-center text-[11px]">
              {(
                [
                  ["A", live.availability],
                  ["P", live.performance],
                  ["Q", live.quality],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-slate-400">{k}</dt>
                  <dd className="font-semibold text-slate-800 tabular-nums">{v.toFixed(0)}%</dd>
                </div>
              ))}
            </dl>
          </div>

          {waitLabel && (
            <p className="rounded bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">{waitLabel}</p>
          )}

          <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-2">
            <SkuImage sku={sku} className="size-9" />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-slate-800">{sku?.name ?? "No active SKU"}</p>
              <p className="font-mono text-[11px] text-slate-500">{sku?.code ?? "—"}</p>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <dt className="text-slate-500">Output</dt>
            <dd className="text-right font-medium text-slate-900 tabular-nums">
              {fmt.format(live.output)} / {fmt.format(live.idealOutput)}
            </dd>
            <dt className="text-slate-500">Reject</dt>
            <dd className="text-right font-medium text-red-600 tabular-nums">{fmt.format(live.reject)}</dd>
            <dt className="text-slate-500">Uptime</dt>
            <dd className="text-right font-medium text-emerald-700 tabular-nums">{duration(live.uptimeSeconds)}</dd>
            <dt className="text-slate-500">Stop / Breakdown</dt>
            <dd className="text-right font-medium text-amber-600 tabular-nums">
              {duration(live.stopSeconds)} · {live.stopCount}×
            </dd>
          </dl>
        </div>
      )}

      {machine.isActive && (
        <Link
          href={`/dashboard/machine/${encodeURIComponent(machine.id)}`}
          className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-xs font-medium text-[#1E6FD9] hover:bg-slate-50"
        >
          Open {name.one.toLowerCase()} details
          <ChevronRight size={14} />
        </Link>
      )}
    </div>
  );
}

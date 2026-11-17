"use client";

import { useState } from "react";
import { MousePointerClick } from "lucide-react";
import MachineInfoCard, { PIN_STYLES, pinStateOf } from "@/components/dashboard/MachineInfoCard";
import type { LiveMachine } from "@/hooks/useLiveMachines";
import { useMachineLabel } from "@/lib/machine-label";
import { MACHINE_CATEGORIES, MACHINE_CATEGORY_LABELS, type MachineCategory } from "@/types/machine";

const fmt = new Intl.NumberFormat("en-US");

function hm(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

/** One unit when every machine shares it, else none. */
const commonUnit = (units: string[]) => (units.length && units.every((u) => u === units[0]) ? units[0] : "");

/** Left panel of the plant layout: plant totals, and the machine clicked last. */
export default function PlantSidePanel({
  machines,
  selected,
}: {
  machines: LiveMachine[];
  selected: LiveMachine | null;
}) {
  const name = useMachineLabel();
  // Machine status: both categories together. OEE, output, reject and downtime: the chosen category.
  const [category, setCategory] = useState<MachineCategory>("BAGGER");
  const allActive = machines.filter((m) => m.isActive && m.oeeEnabled);
  const active = allActive.filter((m) => m.category === category);
  const count = (states: string[]) => allActive.filter((m) => states.includes(pinStateOf(m))).length;
  const counts = [
    { key: "RUN", label: "Run", value: count(["RUN"]), color: PIN_STYLES.RUN.color },
    { key: "STOP", label: "Stop", value: count(["STOP"]), color: PIN_STYLES.STOP.color },
    { key: "OFF", label: "Off", value: count(["OFF", "BREAKDOWN"]), color: PIN_STYLES.OFF.color },
  ];
  const noData = count(["NO_DATA"]);

  // Current OEE runs (since shift start, SKU change or a finish rule).
  const live = active.filter((m) => m.live);
  const downtime = live.reduce((s, m) => s + m.live!.stopSeconds, 0);
  const stops = live.reduce((s, m) => s + m.live!.stopCount, 0);
  const output = live.reduce((s, m) => s + m.live!.output, 0);
  const reject = live.reduce((s, m) => s + m.live!.reject, 0);
  const outputUnit = commonUnit(live.map((m) => m.outputUnit));
  const counted = live.filter((m) => m.live!.countedSeconds > 0);
  const avgOee = counted.length ? counted.reduce((s, m) => s + m.live!.oee, 0) / counted.length : null;

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-slate-200 bg-surface p-4">
        <p className="text-sm font-medium tracking-wide text-slate-500 uppercase">Plant now</p>
        <p className="text-xs text-slate-500">
          {allActive.length} active machines · all categories
          {noData > 0 && ` · ${noData} without data`}
        </p>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {counts.map((c) => (
            <div key={c.key} className="rounded-lg px-2 py-2 text-center" style={{ background: `${c.color}1f` }}>
              <p className="text-3xl leading-none font-bold tabular-nums" style={{ color: c.color }}>
                {c.value}
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-600">{c.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Machine category">
          {MACHINE_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={category === c}
              onClick={() => setCategory(c)}
              className={`flex-1 rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap ${
                category === c ? "bg-surface text-(--brand) shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {MACHINE_CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {active.length} active {MACHINE_CATEGORY_LABELS[category].toLowerCase()}
        </p>

        <dl className="mt-3 space-y-3">
          <div>
            <dt className="text-xs font-medium text-slate-500">Total output</dt>
            <dd className="text-2xl font-bold text-slate-900 tabular-nums">
              {fmt.format(output)}
              {outputUnit && <span className="ml-1.5 text-sm font-medium text-slate-500">{outputUnit}</span>}
            </dd>
            <dd className="text-xs text-slate-500 tabular-nums">Reject {fmt.format(reject)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">Total downtime</dt>
            <dd className="text-2xl font-bold text-amber-600 tabular-nums">{hm(downtime)}</dd>
            <dd className="text-xs text-slate-500 tabular-nums">
              {stops}× Stop / Breakdown · all {MACHINE_CATEGORY_LABELS[category].toLowerCase()}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">Average OEE</dt>
            <dd className="text-2xl font-bold text-slate-900 tabular-nums">{avgOee === null ? "—" : `${avgOee.toFixed(1)}%`}</dd>
            <dd className="text-xs text-slate-500">
              {counted.length} {counted.length === 1 ? "machine" : "machines"} counting
            </dd>
          </div>
        </dl>
        <p className="mt-3 border-t border-slate-100 pt-2 text-[11px] text-slate-400">
          Output and downtime of the current OEE runs (this shift).
        </p>
      </section>

      {selected ? (
        <MachineInfoCard machine={selected} className="w-full" />
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
          <MousePointerClick size={22} className="text-slate-400" />
          Click a {name.one.toLowerCase()} on the layout to see its details here.
        </div>
      )}
    </div>
  );
}

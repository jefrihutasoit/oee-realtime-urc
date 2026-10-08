"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, LayoutGrid, List, Loader2, RefreshCw, Search } from "lucide-react";
import { useCurrentShift } from "@/hooks/useCurrentShift";
import { dashboardStatus, useLiveMachines } from "@/hooks/useLiveMachines";
import { useMachineLabel } from "@/lib/machine-label";
import type { MachineStatus } from "@/types/oee";
import SummaryCards from "./SummaryCards";
import MachineCard, { OeeBar, oeeLabel, StatusPill } from "./MachineCard";
import SkuImage from "./SkuImage";

const fmt = new Intl.NumberFormat("en-US");

const control =
  "h-10 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:border-blue-400 focus:outline-none";

function Select({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className={`${control} w-full appearance-none pr-9 pl-3`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-slate-500" />
    </div>
  );
}

export default function Dashboard() {
  const { machines, error, connected, reload } = useLiveMachines();
  const name = useMachineLabel();
  const shift = useCurrentShift();
  const [query, setQuery] = useState("");
  const [line, setLine] = useState("ALL");
  const [machineId, setMachineId] = useState("ALL");
  const [status, setStatus] = useState<"ALL" | MachineStatus>("ALL");
  const [view, setView] = useState<"grid" | "list">("grid");

  if (!machines) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-sm text-slate-500">
        {error ? (
          <>
            <p className="text-red-600">{error}</p>
            <button type="button" onClick={reload} className="font-medium text-[#1E6FD9] hover:underline">
              Retry
            </button>
          </>
        ) : (
          <>
            <Loader2 size={22} className="animate-spin" />
            Loading {name.many.toLowerCase()}…
          </>
        )}
      </div>
    );
  }

  const lines = [...new Set(machines.map((m) => m.line))].sort();
  const q = query.trim().toLowerCase();
  const filtered = machines.filter((m) => {
    const haystack = [m.machineNo, m.machineName, m.live?.sku.code ?? "", m.live?.sku.name ?? ""];
    if (q && !haystack.some((s) => s.toLowerCase().includes(q))) return false;
    if (line !== "ALL" && m.line !== line) return false;
    if (machineId !== "ALL" && m.id !== machineId) return false;
    if (status !== "ALL" && (!m.isActive || dashboardStatus(m.status) !== status)) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <SummaryCards machines={machines} />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full lg:w-72">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${name.one.toLowerCase()}, SKU, or product...`}
            className={`${control} w-full pr-3 pl-9 placeholder:text-slate-400`}
          />
        </div>
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3 lg:max-w-xl">
          <Select
            label="Line"
            value={line}
            onChange={setLine}
            options={[{ value: "ALL", label: "All Lines" }, ...lines.map((l) => ({ value: l, label: l }))]}
          />
          <Select
            label={name.one}
            value={machineId}
            onChange={setMachineId}
            options={[
              { value: "ALL", label: `All ${name.many}` },
              ...machines.map((m) => ({ value: m.id, label: m.machineNo })),
            ]}
          />
          <Select
            label="Status"
            value={status}
            onChange={(v) => setStatus(v as typeof status)}
            options={[
              { value: "ALL", label: "All Status" },
              { value: "RUN", label: "Run" },
              { value: "STOP", label: "Stop" },
              { value: "OFF", label: "Off" },
            ]}
          />
        </div>
        <button
          type="button"
          onClick={reload}
          className={`${control} ml-auto flex w-10 items-center justify-center text-[#1E6FD9] hover:bg-slate-50`}
          aria-label="Refresh"
          title={`Reload ${name.many.toLowerCase()}`}
        >
          <RefreshCw size={18} />
        </button>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-slate-900">{name.many} ({filtered.length})</h2>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
              connected ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
            }`}
            title={connected ? "Receiving realtime updates" : "Waiting for realtime connection"}
          >
            <span className={`size-1.5 rounded-full ${connected ? "animate-pulse bg-emerald-500" : "bg-slate-400"}`} />
            {connected ? "Live" : "Offline"}
          </span>
          {shift && (
            <span
              className="hidden rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-[#1E6FD9] sm:inline"
              title="Current shift – OEE figures are for this shift"
            >
              {shift.name} · {shift.startLabel}–{shift.endLabel}
            </span>
          )}
        </div>
        <div className="flex gap-1 rounded-lg bg-white p-1 ring-1 ring-slate-200">
          {(
            [
              ["grid", LayoutGrid, "Grid view"],
              ["list", List, "List view"],
            ] as const
          ).map(([v, Icon, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-label={label}
              aria-pressed={view === v}
              className={`rounded-md p-1.5 ${view === v ? "bg-blue-50 text-[#1E6FD9]" : "text-slate-500 hover:bg-slate-100"}`}
            >
              <Icon size={18} />
            </button>
          ))}
        </div>
      </div>

      {machines.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No active {name.many.toLowerCase()} registered yet.{" "}
          <Link href="/settings/machines" className="font-medium text-[#1E6FD9] hover:underline">
            Register a machine
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No machines match the current filters.
        </p>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
          {filtered.map((m) => (
            <MachineCard key={m.id} machine={m} />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">{name.one}</th>
                <th className="px-4 py-2.5 font-medium">Line</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">SKU</th>
                <th className="w-40 px-4 py-2.5 font-medium">OEE</th>
                <th className="px-4 py-2.5 text-right font-medium">A / P / Q</th>
                <th className="px-4 py-2.5 text-right font-medium">Output</th>
                <th className="px-4 py-2.5 text-right font-medium">Reject</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {filtered.map((m) => (
                <tr
                  key={m.id}
                  aria-disabled={!m.isActive || undefined}
                  className={m.isActive ? "hover:bg-slate-50" : "bg-slate-50 opacity-50 grayscale"}
                >
                  <td className="px-4 py-2.5">
                    {m.isActive ? (
                      <Link
                        href={`/dashboard/machine/${encodeURIComponent(m.id)}`}
                        className="font-semibold text-slate-900 hover:text-[#1E6FD9] hover:underline"
                      >
                        {m.machineNo}
                      </Link>
                    ) : (
                      <span className="font-semibold text-slate-500">{m.machineNo}</span>
                    )}
                    <span className="block text-xs text-slate-500">{m.machineName}</span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{m.line}</td>
                  <td className="px-4 py-2.5">
                    <StatusPill status={dashboardStatus(m.status)} inactive={!m.isActive} />
                  </td>
                  <td className="px-4 py-2.5">
                    {m.live ? (
                      <span className="flex items-center gap-2">
                        <SkuImage sku={m.live.sku} className="h-6 w-6" />
                        <span className="text-slate-700">{m.live.sku.name}</span>
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {m.isActive && m.oeeEnabled ? (
                      <span className="flex items-center gap-2">
                        <span className="w-14 shrink-0 font-medium text-slate-900">{oeeLabel(m)}</span>
                        <OeeBar value={m.live?.oee ?? 0} />
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">{m.isActive ? "Status only" : "Disabled"}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-600">
                    {m.live
                      ? `${m.live.availability.toFixed(1)} / ${m.live.performance.toFixed(1)} / ${m.live.quality.toFixed(1)}`
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-700">{m.live ? fmt.format(m.live.output) : "—"}</td>
                  <td className="px-4 py-2.5 text-right text-red-600">{m.live ? fmt.format(m.live.reject) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

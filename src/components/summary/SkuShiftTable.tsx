"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { withUnit, type ProductionUnits } from "@/lib/production-units";
import type { SkuRun } from "@/types/summary";

const fmt = new Intl.NumberFormat("en-US");
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" });
const PAGE = 50;

const pct = (v: number | null) => (v === null ? "—" : v.toFixed(1));
const oeeTone = (v: number | null) =>
  v === null ? "text-slate-400" : v >= 85 ? "text-emerald-600" : v >= 60 ? "text-amber-600" : "text-red-600";

/**
 * Every SKU each machine ran per shift, with that SKU's own OEE (its part of the shift only). "No SKU" rows
 * are time without a SKU (downtime in full-shift counting).
 */
export default function SkuShiftTable({
  rows,
  showDate,
  unitsOf,
}: {
  rows: SkuRun[];
  /** Ranges of more than one day show the production date. */
  showDate: boolean;
  unitsOf: (machineIds: string[]) => ProductionUnits;
}) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? rows.filter((r) => [r.machineNo, r.skuCode, r.productName, r.shiftName].some((s) => s.toLowerCase().includes(q)))
      : rows;
  }, [rows, query]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {fmt.format(shown.length)} {shown.length === 1 ? "record" : "records"} · OEE of each SKU&apos;s own part of the shift
        </p>
        <div className="relative w-full sm:w-64">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
            placeholder="Machine, SKU or shift…"
            aria-label="Search SKU records"
            className="h-8 w-full rounded-lg border border-slate-200 bg-surface pr-3 pl-8 text-sm placeholder:text-slate-400 focus:border-blue-400 focus:outline-none"
          />
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">No SKU records for this {showDate ? "period" : "date"}.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-100">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                {showDate && <th className="px-3 py-2 font-medium">Date</th>}
                <th className="px-3 py-2 font-medium">Shift</th>
                <th className="px-3 py-2 font-medium">Machine</th>
                <th className="px-3 py-2 font-medium">SKU</th>
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 text-right font-medium">Output</th>
                <th className="px-3 py-2 text-right font-medium">Reject</th>
                <th className="px-3 py-2 text-right font-medium" title="Availability / Performance / Quality">
                  A / P / Q
                </th>
                <th className="px-3 py-2 text-right font-medium">OEE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {shown.slice(0, limit).map((r) => {
                const noSku = r.skuCode === "-";
                const units = unitsOf([r.machineId]);
                return (
                  <tr key={`${r.date}|${r.shiftId}|${r.machineId}|${r.skuCode}`} className="hover:bg-slate-50">
                    {showDate && (
                      <td className="px-3 py-2 whitespace-nowrap text-slate-600">{dateFmt.format(new Date(`${r.date}T00:00:00`))}</td>
                    )}
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">{r.shiftName}</td>
                    <td className="px-3 py-2 font-semibold text-slate-900">{r.machineNo}</td>
                    <td className="max-w-56 px-3 py-2">
                      <span className={`font-mono ${noSku ? "text-slate-500" : "text-slate-900"}`}>{noSku ? "No SKU" : r.skuCode}</span>
                      <span className="block truncate text-xs text-slate-500">{noSku ? "Downtime without a SKU" : r.productName}</span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">
                      {r.start && r.end ? `${timeFmt.format(new Date(r.start))}–${timeFmt.format(new Date(r.end))}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-900">{withUnit(fmt.format(r.output), units.output)}</td>
                    <td className="px-3 py-2 text-right text-red-600">{withUnit(fmt.format(r.reject), units.reject)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap text-slate-600">
                      {pct(r.availability)} / {pct(r.performance)} / {pct(r.quality)}
                    </td>
                    <td className={`px-3 py-2 text-right font-semibold ${noSku ? "text-slate-400" : oeeTone(r.oee)}`}>
                      {noSku || r.oee === null ? "—" : `${r.oee.toFixed(1)}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {shown.length > limit && (
        <div className="text-center">
          <button
            type="button"
            onClick={() => setLimit((l) => l + PAGE * 2)}
            className="text-sm font-medium text-(--brand) hover:underline"
          >
            Show more ({fmt.format(shown.length - limit)} left)
          </button>
        </div>
      )}
    </div>
  );
}

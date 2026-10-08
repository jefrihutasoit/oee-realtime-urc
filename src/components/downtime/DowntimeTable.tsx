"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { downtimeTypeColors, downtimeTypeLabel, minutesLabel } from "@/config/downtime";
import { useCan } from "@/lib/auth";
import { downtimeApi } from "@/lib/downtime-api";
import type { DowntimeRecord } from "@/types/downtime";

interface DowntimeTableProps {
  date: string;
  onDateChange: (date: string) => void;
  /** Changes when the data should be loaded again (after an upload). */
  reloadToken: number;
}

/** Uploaded downtime of one production date, with delete per row. */
export default function DowntimeTable({ date, onDateChange, reloadToken }: DowntimeTableProps) {
  const [records, setRecords] = useState<DowntimeRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const canEdit = useCan("downtime.edit");

  useEffect(() => {
    let cancelled = false;
    downtimeApi
      .list(date)
      .then((list) => {
        if (cancelled) return;
        setRecords(list);
        setError(null);
      })
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [date, reloadToken]);

  const colorOf = useMemo(() => downtimeTypeColors(records?.map((r) => r.downtimeType) ?? []), [records]);
  const total = records?.reduce((s, r) => s + (r.durationSeconds ?? 0), 0) ?? 0;

  async function remove(r: DowntimeRecord) {
    setDeleting(r.id);
    try {
      await downtimeApi.remove(r.id);
      setRecords((list) => list?.filter((x) => x.id !== r.id) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-end justify-between gap-3 p-4">
        <div>
          <h3 className="font-semibold text-slate-900">Downtime Data</h3>
          <p className="text-xs text-slate-500">
            {records ? `${records.length} rows · ${minutesLabel(total)} total` : "Uploaded downtime"}
          </p>
        </div>
        <label className="text-xs text-slate-500">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && onDateChange(e.target.value)}
            className="mt-1 block h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-blue-400 focus:outline-none"
          />
        </label>
      </div>
      {error && <p className="px-4 pb-3 text-sm text-red-600">{error}</p>}
      <div className="overflow-x-auto border-t border-slate-100">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Time</th>
              <th className="px-4 py-2 text-right font-medium">Duration</th>
              <th className="px-4 py-2 font-medium">Machine</th>
              <th className="px-4 py-2 font-medium">Bagger</th>
              <th className="px-4 py-2 font-medium">Line</th>
              <th className="px-4 py-2 font-medium">SKU</th>
              <th className="px-4 py-2 font-medium">Detail</th>
              <th className="px-4 py-2 font-medium">Notification</th>
              <th className="px-4 py-2 font-medium">Operator</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!records ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-slate-400">
                  <Loader2 size={18} className="mx-auto animate-spin" />
                </td>
              </tr>
            ) : records.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-slate-400">
                  No downtime uploaded for this date.
                </td>
              </tr>
            ) : (
              records.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 whitespace-nowrap text-slate-700 tabular-nums">
                    {r.start || "—"}–{r.end || "—"}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap text-slate-900 tabular-nums">
                    {r.durationSeconds === null ? "—" : minutesLabel(r.durationSeconds)}
                  </td>
                  <td className="px-4 py-2 font-medium text-slate-900">{r.machines[0] ?? r.machineText}</td>
                  <td className="px-4 py-2 text-slate-700">{r.bagger}</td>
                  <td className="px-4 py-2 text-slate-700">{r.line}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-slate-700">{r.sku}</td>
                  <td className="max-w-sm px-4 py-2 text-slate-700">{r.detail}</td>
                  <td className="px-4 py-2 text-slate-700 tabular-nums">{r.notificationNo}</td>
                  <td className="px-4 py-2 text-slate-700">{r.operator}</td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {r.downtimeType ? (
                      <span className="inline-flex items-center gap-1.5 text-slate-700" title={downtimeTypeLabel(r.downtimeType)}>
                        <span className="size-2 rounded-full" style={{ background: colorOf(r.downtimeType) }} />
                        {r.downtimeType}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {canEdit && (
                    <button
                      type="button"
                      onClick={() => remove(r)}
                      disabled={deleting === r.id}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      aria-label={`Delete downtime ${r.start} ${r.machineText}`}
                    >
                      {deleting === r.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                    </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

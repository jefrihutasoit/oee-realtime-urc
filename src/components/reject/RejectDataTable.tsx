"use client";

import { useEffect, useState } from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { useCan } from "@/lib/auth";
import Modal, { buttonStyles } from "@/components/ui/Modal";
import { rejectApi } from "@/lib/reject-api";
import type { RejectRecord, RejectType } from "@/types/reject";
import type { Shift } from "@/types/shift";

interface RejectDataTableProps {
  shifts: Shift[];
  date: string;
  shiftId: string;
  onFilterChange: (date: string, shiftId: string) => void;
  /** Change it to reload the list, e.g. after an upload or a save. */
  reloadToken?: number;
  /** Shows an edit button per row when given. */
  onEdit?: (record: RejectRecord) => void;
}

const inputClass =
  "h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-blue-400 focus:outline-none";

/** Uploaded and manually entered reject data of one date, optionally one shift. */
export default function RejectDataTable({
  shifts,
  date,
  shiftId,
  onFilterChange,
  reloadToken = 0,
  onEdit,
}: RejectDataTableProps) {
  const [loaded, setLoaded] = useState<{ key: string; records: RejectRecord[]; types: RejectType[]; error?: string }>({
    key: "",
    records: [],
    types: [],
  });
  // Changing or deleting saved reject data needs "reject.edit".
  const canEdit = useCan("reject.edit");
  const [deleteCount, setDeleteCount] = useState(0);
  const [deleting, setDeleting] = useState<RejectRecord | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const key = `${date}|${shiftId}|${reloadToken}|${deleteCount}`;
  const loading = loaded.key !== key;

  useEffect(() => {
    if (!date) return;
    let active = true;
    Promise.all([rejectApi.list(date, shiftId || undefined), rejectApi.types()])
      .then(([records, types]) => active && setLoaded({ key, records, types }))
      .catch((err: Error) => active && setLoaded({ key, records: [], types: [], error: err.message }));
    return () => {
      active = false;
    };
  }, [key, date, shiftId]);

  async function handleDelete() {
    if (!deleting) return;
    setBusyDelete(true);
    setDeleteError(null);
    try {
      await rejectApi.remove(deleting.id);
      setDeleting(null);
      setDeleteCount((n) => n + 1);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyDelete(false);
    }
  }

  const { records, types } = loaded;
  // Only reject types that have data in the list, in master order.
  const shownTypes = types.filter((t) => records.some((r) => r.quantities[t.id]));
  const columns = 7 + shownTypes.length;

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h3 className="font-semibold text-slate-900">Reject Data</h3>
        <div className="flex flex-wrap gap-3">
          <label className="text-xs text-slate-500">
            Date
            <input
              type="date"
              value={date}
              onChange={(e) => onFilterChange(e.target.value, shiftId)}
              className={`${inputClass} mt-1 block`}
            />
          </label>
          <label className="text-xs text-slate-500">
            Shift
            <select
              value={shiftId}
              onChange={(e) => onFilterChange(date, e.target.value)}
              className={`${inputClass} mt-1 block`}
            >
              <option value="">All shifts</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {loaded.error && !loading && <p className="text-sm text-red-600">{loaded.error}</p>}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Shift</th>
              <th className="px-3 py-2 font-medium">MC</th>
              <th className="px-3 py-2 font-medium">Operator</th>
              <th className="px-3 py-2 font-medium">SKU ID</th>
              <th className="px-3 py-2 font-medium">Product</th>
              {shownTypes.map((t) => (
                <th key={t.id} className="px-3 py-2 text-right font-medium whitespace-nowrap">
                  {t.name}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium">Total</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={columns} className="px-3 py-8 text-center text-slate-500">
                  <Loader2 size={18} className="mx-auto animate-spin" />
                </td>
              </tr>
            ) : records.length === 0 ? (
              <tr>
                <td colSpan={columns} className="px-3 py-8 text-center text-slate-500">
                  No reject data for this date{shiftId ? " and shift" : ""}.
                </td>
              </tr>
            ) : (
              records.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 text-slate-700">{r.shiftName}</td>
                  <td className="px-3 py-2 font-medium text-slate-900">{r.machineNo}</td>
                  <td className="px-3 py-2 text-slate-700">{r.operator}</td>
                  <td className="px-3 py-2 text-slate-700">{r.skuId}</td>
                  <td className="px-3 py-2 text-slate-700">
                    {r.productName} <span className="text-slate-400">· {r.sku}</span>
                  </td>
                  {shownTypes.map((t) => (
                    <td key={t.id} className="px-3 py-2 text-right text-slate-700 tabular-nums">
                      {r.quantities[t.id] ?? 0}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-semibold text-slate-900 tabular-nums">{r.total}</td>
                  <td className="px-3 py-1.5">
                    <div className="flex justify-end gap-1">
                      {onEdit && canEdit && (
                        <button
                          type="button"
                          onClick={() => onEdit(r)}
                          className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-[#1E6FD9]"
                          aria-label={`Edit reject of ${r.machineNo}`}
                        >
                          <Pencil size={16} />
                        </button>
                      )}
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteError(null);
                            setDeleting(r);
                          }}
                          className="rounded-md p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"
                          aria-label={`Delete reject of ${r.machineNo}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {deleting && (
        <Modal
          size="sm"
          title="Delete Reject Data"
          onClose={() => !busyDelete && setDeleting(null)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setDeleting(null)}
                disabled={busyDelete}
                className={buttonStyles.secondary}
              >
                Cancel
              </button>
              <button type="button" onClick={handleDelete} disabled={busyDelete} className={buttonStyles.danger}>
                {busyDelete && <Loader2 size={16} className="animate-spin" />}
                Delete
              </button>
            </>
          }
        >
          {deleteError && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{deleteError}</p>}
          <p className="text-sm text-slate-600">
            Delete the reject data of machine <strong className="text-slate-900">{deleting.machineNo}</strong>,{" "}
            {deleting.shiftName}, {deleting.productionDate} ({deleting.skuId}, total {deleting.total})? This cannot be
            undone.
          </p>
        </Modal>
      )}
    </section>
  );
}

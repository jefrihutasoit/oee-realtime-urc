"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { buttonStyles } from "@/components/ui/Modal";
import { machineApi } from "@/lib/machine-api";
import { rejectApi } from "@/lib/reject-api";
import type { MachineRegistration } from "@/types/machine";
import { MANUAL_INPUT_DAYS, type RejectRecord, type RejectType, type RunningSkus } from "@/types/reject";
import type { Shift } from "@/types/shift";

interface ManualRejectFormProps {
  shifts: Shift[];
  /** Record being edited; the form starts empty when omitted. */
  initial?: RejectRecord;
  onSaved: (record: RejectRecord) => void;
  onCancel?: () => void;
}

interface Line {
  key: number;
  rejectTypeId: string;
  quantity: string;
}

const fieldCls =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400";
const labelCls = "block text-sm font-medium text-slate-700";

const DAY_NAMES = ["Today", "Yesterday"];
const dateLabel = (ymd: string, index: number) => {
  const text = new Date(`${ymd}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return DAY_NAMES[index] ? `${text} (${DAY_NAMES[index]})` : text;
};
const timeLabel = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

let nextLineKey = 1;
const newLine = (rejectTypeId = "", quantity = ""): Line => ({ key: nextLineKey++, rejectTypeId, quantity });

/** Lines of an existing record, in reject type order. */
function linesOf(record: RejectRecord, types: RejectType[]) {
  const order = new Map(types.map((t, i) => [t.id, i]));
  return Object.entries(record.quantities)
    .sort(([a], [b]) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
    .map(([id, q]) => newLine(id, String(q)));
}

export default function ManualRejectForm({ shifts, initial, onSaved, onCancel }: ManualRejectFormProps) {
  const [dates, setDates] = useState<string[]>([]);
  const [machines, setMachines] = useState<MachineRegistration[]>([]);
  const [types, setTypes] = useState<RejectType[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [date, setDate] = useState(initial?.productionDate ?? "");
  const [shiftId, setShiftId] = useState(initial?.shiftId ?? "");
  const [machineId, setMachineId] = useState(initial?.machineId ?? "");
  const [skuMasterId, setSkuMasterId] = useState(initial?.skuMasterId ?? "");
  const [operator, setOperator] = useState(initial?.operator ?? "");
  const [lines, setLines] = useState<Line[]>(() => (initial ? [] : [newLine()]));
  /** Saved record for the current selection; saving replaces it. */
  const [existing, setExisting] = useState<RejectRecord | null>(initial ?? null);

  const [running, setRunning] = useState<{ key: string; data?: RunningSkus; error?: string }>({ key: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lookupSeq = useRef(0);

  useEffect(() => {
    Promise.all([rejectApi.manualDates(), machineApi.list(), rejectApi.types()])
      .then(([d, m, t]) => {
        setDates(d);
        setMachines(
          m.filter((x) => x.isActive).sort((a, b) => a.machineNo.localeCompare(b.machineNo, undefined, { numeric: true }))
        );
        setTypes(t);
        if (!initial) setDate((current) => current || d[0] || "");
        else setLines(linesOf(initial, t));
      })
      .catch((err: Error) => {
        setTypes([]);
        setLoadError(err.message);
      });
  }, [initial]);

  // SKUs that ran on the machine in the selected shift.
  const selectionKey = machineId && date && shiftId ? `${machineId}|${date}|${shiftId}` : "";
  const loadingSkus = !!selectionKey && running.key !== selectionKey;
  useEffect(() => {
    if (!selectionKey) return;
    const [m, d, s] = selectionKey.split("|");
    let active = true;
    rejectApi
      .runningSkus(m, d, s)
      .then((data) => active && setRunning({ key: selectionKey, data }))
      .catch((err: Error) => active && setRunning({ key: selectionKey, error: err.message }));
    return () => {
      active = false;
    };
  }, [selectionKey]);

  /** Clears the SKU (and what was loaded for it) when the machine, date or shift changes. */
  function changeSelection(next: { date?: string; shiftId?: string; machineId?: string }) {
    if (next.date !== undefined) setDate(next.date);
    if (next.shiftId !== undefined) setShiftId(next.shiftId);
    if (next.machineId !== undefined) setMachineId(next.machineId);
    setSkuMasterId("");
    setExisting(null);
    setError(null);
    lookupSeq.current++;
  }

  /** Loads the saved record of the selected machine, shift and SKU, if any, into the form. */
  async function changeSku(id: string) {
    setSkuMasterId(id);
    setExisting(null);
    setError(null);
    const seq = ++lookupSeq.current;
    if (!id) return;
    try {
      const found = (await rejectApi.list(date, shiftId)).find((r) => r.machineId === machineId && r.skuMasterId === id);
      if (seq !== lookupSeq.current || !found) return;
      setExisting(found);
      setOperator(found.operator);
      setLines(linesOf(found, types ?? []));
    } catch {
      // Only a convenience; saving still works.
    }
  }

  const updateLine = (key: number, patch: Partial<Line>) =>
    setLines((list) => list.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!date || !shiftId || !machineId) return setError("Select the date, shift and machine");
    if (!skuMasterId) return setError("Select the SKU");
    if (!operator.trim()) return setError("Operator is required");
    if (!lines.length) return setError("Add at least one reject type");
    if (lines.some((l) => !l.rejectTypeId)) return setError("Select a reject type on every line");
    if (lines.some((l) => !/^\d+$/.test(l.quantity.trim()))) return setError("Quantity must be a whole number of 0 or more");
    if (!lines.some((l) => Number(l.quantity) > 0)) return setError("Enter a quantity greater than 0");

    setSaving(true);
    setError(null);
    try {
      const record = await rejectApi.saveManual({
        productionDate: date,
        shiftId,
        machineId,
        skuMasterId,
        operator: operator.trim(),
        items: lines.map((l) => ({ rejectTypeId: l.rejectTypeId, quantity: Number(l.quantity) })),
      });
      onSaved(record);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setSaving(false);
    }
  }

  const skus = running.key === selectionKey ? (running.data?.skus ?? []) : [];
  const usedTypes = new Set(lines.map((l) => l.rejectTypeId));
  const total = lines.reduce((sum, l) => sum + (/^\d+$/.test(l.quantity.trim()) ? Number(l.quantity) : 0), 0);
  const dateClosed = !!initial && dates.length > 0 && !dates.includes(initial.productionDate);
  const shift = shifts.find((s) => s.id === shiftId);

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">{initial ? "Edit Reject Data" : "Manual Input"}</h3>
          <p className="text-sm text-slate-500">
            Reject data of one machine and SKU for a shift in the last {MANUAL_INPUT_DAYS} days.
          </p>
        </div>
        {onCancel && (
          <button type="button" onClick={onCancel} className={buttonStyles.secondary}>
            <X size={16} />
            Cancel edit
          </button>
        )}
      </div>

      {loadError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>}
      {dateClosed && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {initial!.productionDate} is older than {MANUAL_INPUT_DAYS} days and can no longer be changed manually. Upload the
          reject sheet instead.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <label htmlFor="mrDate" className={labelCls}>
            Date
          </label>
          <select
            id="mrDate"
            value={date}
            onChange={(e) => changeSelection({ date: e.target.value })}
            className={fieldCls}
          >
            <option value="">Select date</option>
            {dates.map((d, i) => (
              <option key={d} value={d}>
                {dateLabel(d, i)}
              </option>
            ))}
            {date && dates.length > 0 && !dates.includes(date) && <option value={date}>{date}</option>}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="mrShift" className={labelCls}>
            Shift
          </label>
          <select
            id="mrShift"
            value={shiftId}
            onChange={(e) => changeSelection({ shiftId: e.target.value })}
            className={fieldCls}
          >
            <option value="">Select shift</option>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.start}–{s.end})
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="mrMachine" className={labelCls}>
            Machine
          </label>
          <select
            id="mrMachine"
            value={machineId}
            onChange={(e) => changeSelection({ machineId: e.target.value })}
            className={fieldCls}
          >
            <option value="">Select machine</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.machineNo} — {m.machineName}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="mrSku" className={labelCls}>
            SKU
          </label>
          <select
            id="mrSku"
            value={skuMasterId}
            onChange={(e) => changeSku(e.target.value)}
            disabled={!selectionKey || loadingSkus || skus.length === 0}
            className={fieldCls}
          >
            <option value="">
              {!selectionKey
                ? "Select date, shift and machine first"
                : loadingSkus
                  ? "Loading..."
                  : skus.length
                    ? "Select SKU"
                    : "No SKU ran in this shift"}
            </option>
            {skus.map((s) => (
              <option key={s.skuMasterId} value={s.skuMasterId}>
                {s.skuId} — {s.productName} ({s.sku})
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectionKey && !loadingSkus && (
        <p className="-mt-2 text-xs text-slate-500">
          {running.error ? (
            <span className="text-red-600">{running.error}</span>
          ) : running.data ? (
            <>
              SKUs from the machine&apos;s product tag during {shift?.name ?? "the shift"} (
              {timeLabel(running.data.start)} – {timeLabel(running.data.end)}).
              {running.data.skus.length === 0 && " Nothing registered in SKU Management ran on this machine then."}
            </>
          ) : null}
        </p>
      )}

      {existing && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <p>
            This machine and SKU already have reject data for this shift (total {existing.total}). Saving replaces it.
          </p>
        </div>
      )}

      <div className="space-y-1.5 sm:max-w-sm">
        <label htmlFor="mrOperator" className={labelCls}>
          Operator
        </label>
        <input
          id="mrOperator"
          value={operator}
          onChange={(e) => setOperator(e.target.value)}
          placeholder="Operator name"
          maxLength={100}
          className={fieldCls}
        />
      </div>

      <div className="space-y-2">
        <p className={labelCls}>Reject</p>
        {types !== null && types.length === 0 ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            No reject types registered yet.{" "}
            <Link href="/reject/types" className="font-medium underline">
              Register reject types
            </Link>{" "}
            first.
          </p>
        ) : (
          <>
            {lines.map((l) => (
              <div key={l.key} className="flex gap-2">
                <select
                  value={l.rejectTypeId}
                  onChange={(e) => updateLine(l.key, { rejectTypeId: e.target.value })}
                  aria-label="Reject type"
                  className={`${fieldCls} sm:max-w-xs`}
                >
                  <option value="">Select reject type</option>
                  {(types ?? []).map((t) => (
                    <option key={t.id} value={t.id} disabled={t.id !== l.rejectTypeId && usedTypes.has(t.id)}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={l.quantity}
                  onChange={(e) => updateLine(l.key, { quantity: e.target.value })}
                  placeholder="Qty"
                  aria-label="Quantity"
                  className={`${fieldCls} w-28 text-right`}
                />
                <button
                  type="button"
                  onClick={() => setLines((list) => list.filter((x) => x.key !== l.key))}
                  className="rounded-md p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"
                  aria-label="Remove line"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setLines((list) => [...list, newLine()])}
                disabled={types === null || lines.length >= types.length}
                className={buttonStyles.secondary}
              >
                <Plus size={16} />
                Add reject type
              </button>
              <p className="text-sm text-slate-600">
                Total: <strong className="text-slate-900 tabular-nums">{total}</strong>
              </p>
            </div>
          </>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex justify-end border-t border-slate-100 pt-4">
        <button type="submit" disabled={saving || dateClosed} className={buttonStyles.primary}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {existing ? "Replace Reject Data" : "Save Reject Data"}
        </button>
      </div>
    </form>
  );
}

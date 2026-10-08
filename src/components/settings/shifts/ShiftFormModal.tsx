"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import Modal, { buttonStyles } from "@/components/ui/Modal";
import { formatMinutes, toMinutes } from "@/lib/shift-api";
import type { Shift, ShiftInput } from "@/types/shift";

interface ShiftFormModalProps {
  shift?: Shift;
  onClose: () => void;
  onSubmit: (input: ShiftInput) => Promise<void>;
}

const inputCls =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none";

export default function ShiftFormModal({ shift, onClose, onSubmit }: ShiftFormModalProps) {
  const [name, setName] = useState(shift?.name ?? "");
  const [start, setStart] = useState(shift?.start ?? "06:00");
  const [end, setEnd] = useState(shift?.end ?? "14:00");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = /^\d{2}:\d{2}$/.test(start) && /^\d{2}:\d{2}$/.test(end);
  const duration = valid ? (toMinutes(end) - toMinutes(start) + 1440) % 1440 : 0;
  const crossesMidnight = valid && toMinutes(end) < toMinutes(start);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Shift name is required");
    if (!valid) return setError("Start and end are required");
    if (duration === 0) return setError("Start and end must be different");
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), start, end });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save shift");
      setSaving(false);
    }
  }

  return (
    <Modal
      size="sm"
      title={shift ? `Edit ${shift.name}` : "Add Shift"}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={buttonStyles.secondary}>
            Cancel
          </button>
          <button type="submit" form="shift-form" disabled={saving} className={buttonStyles.primary}>
            {saving && <Loader2 size={16} className="animate-spin" />}
            {shift ? "Save Changes" : "Add Shift"}
          </button>
        </>
      }
    >
      <form id="shift-form" onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="space-y-1.5">
          <label htmlFor="shiftName" className="block text-sm font-medium text-slate-700">
            Shift Name
          </label>
          <input
            id="shiftName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Shift 1"
            maxLength={50}
            className={inputCls}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="shiftStart" className="block text-sm font-medium text-slate-700">
              Start
            </label>
            <input
              id="shiftStart"
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className={`${inputCls} tabular-nums`}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="shiftEnd" className="block text-sm font-medium text-slate-700">
              End
            </label>
            <input
              id="shiftEnd"
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className={`${inputCls} tabular-nums`}
            />
          </div>
        </div>

        <p className="text-sm text-slate-600">
          Duration <strong className="text-slate-900">{duration ? formatMinutes(duration) : "—"}</strong>
          {crossesMidnight && <span className="ml-2 text-xs text-indigo-600">crosses midnight</span>}
        </p>
        <p className="text-xs text-slate-500">
          Times use the plant (server) clock. Shifts may not overlap; OEE resets at every shift boundary.
        </p>
      </form>
    </Modal>
  );
}

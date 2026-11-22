"use client";

import { useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import Modal, { buttonStyles } from "@/components/ui/Modal";
import { formatMinutes, toMinutes } from "@/lib/shift-api";
import { WEEKDAYS, dayName, type Shift, type ShiftInput } from "@/types/shift";

interface ShiftFormModalProps {
  shift?: Shift;
  onClose: () => void;
  onSubmit: (input: ShiftInput) => Promise<void>;
}

const inputCls =
  "h-10 w-full rounded-lg border border-slate-200 bg-surface px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none";

export default function ShiftFormModal({ shift, onClose, onSubmit }: ShiftFormModalProps) {
  const [name, setName] = useState(shift?.name ?? "");
  const [start, setStart] = useState(shift?.start ?? "06:00");
  const [end, setEnd] = useState(shift?.end ?? "14:00");
  const [days, setDays] = useState<number[]>(shift?.days ?? [0, 1, 2, 3, 4, 5, 6]);
  /** Other times of this shift on some days, e.g. Saturday 06:00–11:00. */
  const [dayTimes, setDayTimes] = useState<{ day: number; start: string; end: string }[]>(
    shift?.dayTimes.map(({ day, start, end }) => ({ day, start, end })) ?? []
  );
  const freeDays = WEEKDAYS.map(([d]) => d).filter((d) => days.includes(d) && !dayTimes.some((t) => t.day === d));
  const setDayTime = (i: number, patch: Partial<{ day: number; start: string; end: string }>) =>
    setDayTimes((list) => list.map((t, j) => (j === i ? { ...t, ...patch } : t)));
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
    if (!days.length) return setError("Choose at least one day");
    const bad = dayTimes.find((t) => !/^\d{2}:\d{2}$/.test(t.start) || !/^\d{2}:\d{2}$/.test(t.end) || t.start === t.end);
    if (bad) return setError(`${dayName(bad.day)}: set a different start and end`);
    setSaving(true);
    setError(null);
    try {
      // Other times only for days the shift still runs on.
      await onSubmit({ name: name.trim(), start, end, days, dayTimes: dayTimes.filter((t) => days.includes(t.day)) });
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

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="block text-sm font-medium text-slate-700">Days</span>
            <div className="flex gap-2 text-xs font-medium">
              {(
                [
                  ["Every day", [0, 1, 2, 3, 4, 5, 6]],
                  ["Mon–Fri", [1, 2, 3, 4, 5]],
                  ["Sat", [6]],
                ] as const
              ).map(([label, set]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setDays([...set])}
                  className="text-(--brand) hover:underline"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days">
            {WEEKDAYS.map(([d, label]) => {
              const on = days.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setDays((list) => (on ? list.filter((x) => x !== d) : [...list, d]))}
                  className={`h-8 w-11 rounded-md border text-xs font-medium ${
                    on ? "border-(--brand) bg-(--brand) text-white" : "border-slate-200 text-slate-500 hover:border-slate-300"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-slate-500">
            The day the shift starts on: a shift from Friday 22:00 to Saturday 06:00 is a Friday shift.
          </p>
        </div>

        <div className="space-y-2 rounded-lg border border-slate-200 p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-slate-700">Other times on some days</p>
              <p className="text-xs text-slate-500">Same shift, different hours, e.g. a shorter Saturday.</p>
            </div>
            {freeDays.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  setDayTimes((list) => [...list, { day: freeDays.includes(6) ? 6 : freeDays[0], start, end }])
                }
                className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-(--brand) hover:underline"
              >
                <Plus size={14} /> Add day
              </button>
            )}
          </div>
          {dayTimes.map((t, i) => {
            const off = !days.includes(t.day);
            return (
              <div key={i} className={`flex items-center gap-2 ${off ? "opacity-50" : ""}`}>
                <select
                  value={t.day}
                  onChange={(e) => setDayTime(i, { day: Number(e.target.value) })}
                  aria-label="Day"
                  className="h-9 w-20 rounded-lg border border-slate-200 bg-surface px-2 text-sm"
                >
                  {WEEKDAYS.filter(([d]) => d === t.day || freeDays.includes(d)).map(([d, label]) => (
                    <option key={d} value={d}>
                      {label}
                    </option>
                  ))}
                </select>
                <input
                  type="time"
                  value={t.start}
                  onChange={(e) => setDayTime(i, { start: e.target.value })}
                  aria-label={`${dayName(t.day)} start`}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-surface px-2 text-sm tabular-nums"
                />
                <span className="text-slate-400">–</span>
                <input
                  type="time"
                  value={t.end}
                  onChange={(e) => setDayTime(i, { end: e.target.value })}
                  aria-label={`${dayName(t.day)} end`}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-surface px-2 text-sm tabular-nums"
                />
                <button
                  type="button"
                  onClick={() => setDayTimes((list) => list.filter((_, j) => j !== i))}
                  aria-label={`Remove ${dayName(t.day)} times`}
                  className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
          {dayTimes.some((t) => !days.includes(t.day)) && (
            <p className="text-xs text-amber-600">Days the shift does not run on are ignored.</p>
          )}
        </div>

        <p className="text-sm text-slate-600">
          Default duration <strong className="text-slate-900">{duration ? formatMinutes(duration) : "—"}</strong>
          {crossesMidnight && <span className="ml-2 text-xs text-indigo-600">crosses midnight</span>}
        </p>
        <p className="text-xs text-slate-500">
          Times use the plant (server) clock. Shifts may not overlap on the same day; OEE resets at every shift
          boundary.
        </p>
      </form>
    </Modal>
  );
}

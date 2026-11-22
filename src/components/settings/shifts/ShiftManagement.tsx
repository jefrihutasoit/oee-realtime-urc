"use client";

import { useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import Modal, { buttonStyles } from "@/components/ui/Modal";
import { useCurrentShift } from "@/hooks/useCurrentShift";
import { formatMinutes, shiftApi, toMinutes } from "@/lib/shift-api";
import { WEEKDAYS, dayName, daysLabel, shiftTimesOn, type Shift, type ShiftInput } from "@/types/shift";
import ShiftFormModal from "./ShiftFormModal";

type FormState = { mode: "create" } | { mode: "edit"; shift: Shift } | null;

const DAY = 1440;
const COLORS = ["bg-sky-500", "bg-indigo-500", "bg-teal-500", "bg-violet-500", "bg-cyan-600", "bg-blue-600"];
const byStart = (a: Shift, b: Shift) => toMinutes(a.start) - toMinutes(b.start);

/**
 * Pieces of one weekday's 0–24h covered by the shifts: those starting that day, plus the part after midnight
 * of the previous day's shifts that cross it; and the gaps.
 */
function coverage(shifts: Shift[], day: number) {
  const prev = (day + 6) % 7;
  const pieces = shifts.flatMap((s) => {
    const color = COLORS[shifts.indexOf(s) % COLORS.length];
    const out: { shift: Shift; from: number; to: number; color: string; label: string }[] = [];
    // This day's times, and the part after midnight of the previous day's occurrence.
    const today = shiftTimesOn(s, day);
    if (today) {
      const from = toMinutes(today.start);
      out.push({ shift: s, from, to: Math.min(from + today.durationMinutes, DAY), color, label: `${today.start}–${today.end}` });
    }
    const before = shiftTimesOn(s, prev);
    if (before) {
      const to = toMinutes(before.start) + before.durationMinutes;
      if (to > DAY) out.push({ shift: s, from: 0, to: to - DAY, color, label: `${before.start}–${before.end}` });
    }
    return out;
  });
  const sorted = [...pieces].sort((a, b) => a.from - b.from);
  const gaps: { from: number; to: number }[] = [];
  let cursor = 0;
  for (const p of sorted) {
    if (p.from > cursor) gaps.push({ from: cursor, to: p.from });
    cursor = Math.max(cursor, p.to);
  }
  if (cursor < DAY) gaps.push({ from: cursor, to: DAY });
  const covered = pieces.reduce((sum, p) => sum + (p.to - p.from), 0);
  return { pieces, gaps, covered };
}

const label = (minute: number) =>
  `${String(Math.floor(minute / 60) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

export default function ShiftManagement() {
  const [shifts, setShifts] = useState<Shift[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(null);
  const [deleting, setDeleting] = useState<Shift | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const current = useCurrentShift();

  const showToast = (text: string, tone: "ok" | "error" = "ok") => setToast({ text, tone });

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  function load() {
    shiftApi
      .list()
      .then((list) => {
        setShifts(list.sort(byStart));
        setLoadError(null);
      })
      .catch((err: Error) => setLoadError(err.message));
  }

  useEffect(load, []);

  async function handleSubmit(input: ShiftInput) {
    if (form?.mode === "edit") {
      const updated = await shiftApi.update(form.shift.id, input);
      setShifts((list) => (list ?? []).map((s) => (s.id === updated.id ? updated : s)).sort(byStart));
      showToast(`${updated.name} updated`);
    } else {
      const created = await shiftApi.create(input);
      setShifts((list) => [...(list ?? []), created].sort(byStart));
      showToast(`${created.name} added`);
    }
    setForm(null);
  }

  async function handleDelete() {
    if (!deleting) return;
    setBusyDelete(true);
    try {
      await shiftApi.remove(deleting.id);
      setShifts((list) => (list ?? []).filter((s) => s.id !== deleting.id));
      showToast(`${deleting.name} deleted`);
      setDeleting(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Delete failed", "error");
    } finally {
      setBusyDelete(false);
    }
  }

  const pct = (m: number) => `${(m / DAY) * 100}%`;
  const today = new Date().getDay();
  const week = WEEKDAYS.map(([day, name]) => ({ day, name, ...coverage(shifts ?? [], day) }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">Settings / Shift Management</p>
          <h2 className="text-xl font-semibold text-slate-900">Shift Management</h2>
          <p className="text-sm text-slate-500">
            Production shifts. OEE, counters and the operation timeline reset at every shift boundary.
          </p>
        </div>
        <button type="button" onClick={() => setForm({ mode: "create" })} className={buttonStyles.primary}>
          <Plus size={16} />
          Add Shift
        </button>
      </div>

      {!shifts ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-surface py-16 text-sm text-slate-500">
          {loadError ? (
            <>
              <p className="text-red-600">{loadError}</p>
              <button type="button" onClick={load} className="font-medium text-(--brand) hover:underline">
                Retry
              </button>
            </>
          ) : (
            <>
              <Loader2 size={22} className="animate-spin" />
              Loading shifts…
            </>
          )}
        </div>
      ) : (
        <>
          <section className="space-y-3 rounded-xl border border-slate-200 bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Weekly coverage</h3>
              <p className="text-xs text-slate-500">
                {current && (
                  <>
                    now: <strong className="text-slate-700">{current.name}</strong>
                  </>
                )}
              </p>
            </div>
            <div className="space-y-1.5">
              {week.map((w) => (
                <div key={w.day} className="flex items-center gap-2">
                  <span
                    className={`w-9 shrink-0 text-xs font-medium ${w.day === today ? "text-(--brand)" : "text-slate-500"}`}
                    title={w.covered < DAY ? `${formatMinutes(DAY - w.covered)} without shift` : "Fully covered"}
                  >
                    {w.name}
                  </span>
                  <div className="relative h-7 flex-1 overflow-hidden rounded-md bg-slate-100">
                    {w.gaps.map((g) => (
                      <div
                        key={`gap-${g.from}`}
                        title={`No shift · ${label(g.from)}–${label(g.to)}`}
                        className="absolute inset-y-0 bg-[repeating-linear-gradient(135deg,#F1F5F9_0_6px,#E2E8F0_6px_12px)]"
                        style={{ left: pct(g.from), width: pct(g.to - g.from) }}
                      />
                    ))}
                    {w.pieces.map((p) => (
                      <div
                        key={`${p.shift.id}-${p.from}`}
                        title={`${p.shift.name} · ${p.label}`}
                        className={`absolute inset-y-0 flex items-center justify-center overflow-hidden border-r border-white/60 text-[11px] font-medium whitespace-nowrap text-white ${p.color} ${
                          w.day === today && current?.shiftId === p.shift.id ? "ring-2 ring-(--brand-ink) ring-inset" : ""
                        }`}
                        style={{ left: pct(p.from), width: pct(p.to - p.from) }}
                      >
                        {p.to - p.from >= 120 ? p.shift.name : ""}
                      </div>
                    ))}
                  </div>
                  <span className={`w-14 shrink-0 text-right text-[11px] tabular-nums ${w.covered < DAY ? "text-amber-600" : "text-slate-400"}`}>
                    {formatMinutes(w.covered)}
                  </span>
                </div>
              ))}
            </div>
            <div className="relative mr-16 ml-11 h-4 text-[11px] text-slate-400 tabular-nums">
              {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h, i, all) => (
                <span
                  key={h}
                  className={`absolute ${i === 0 ? "" : i === all.length - 1 ? "-translate-x-full" : "-translate-x-1/2"}`}
                  style={{ left: pct(h * 60) }}
                >
                  {String(h).padStart(2, "0")}:00
                </span>
              ))}
            </div>
          </section>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-surface">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Shift Name</th>
                  <th className="px-4 py-2.5 font-medium">Start</th>
                  <th className="px-4 py-2.5 font-medium">End</th>
                  <th className="px-4 py-2.5 font-medium">Duration</th>
                  <th className="px-4 py-2.5 font-medium">Days</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {shifts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                      No shifts defined. The whole day counts as one &quot;No shift&quot; period.
                    </td>
                  </tr>
                ) : (
                  shifts.map((s, i) => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-2">
                          <span className={`size-2.5 rounded-sm ${COLORS[i % COLORS.length]}`} />
                          <span className="font-semibold text-slate-900">{s.name}</span>
                          {current?.shiftId === s.id && (
                            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
                              Running now
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-700">{s.start}</td>
                      <td className="px-4 py-2.5 font-mono text-slate-700">
                        {s.end}
                        {toMinutes(s.end) < toMinutes(s.start) && (
                          <span className="ml-2 font-sans text-[11px] text-indigo-600">next day</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">{formatMinutes(s.durationMinutes)}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap ${
                            s.days.length === 7 ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-800"
                          }`}
                        >
                          {daysLabel(s.days)}
                        </span>
                        {s.dayTimes.map((t) => (
                          <span
                            key={t.day}
                            className="mt-1 block text-xs whitespace-nowrap text-slate-500"
                            title="Other times on this day"
                          >
                            {dayName(t.day)} <span className="font-mono text-slate-700">{t.start}–{t.end}</span>
                          </span>
                        ))}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setForm({ mode: "edit", shift: s })}
                            className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-(--brand)"
                            aria-label={`Edit ${s.name}`}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleting(s)}
                            className="rounded-md p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"
                            aria-label={`Delete ${s.name}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {form && (
        <ShiftFormModal
          key={form.mode === "edit" ? form.shift.id : "new"}
          shift={form.mode === "edit" ? form.shift : undefined}
          onClose={() => setForm(null)}
          onSubmit={handleSubmit}
        />
      )}

      {deleting && (
        <Modal
          size="sm"
          title="Delete Shift"
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
          <p className="text-sm text-slate-600">
            Delete <strong className="text-slate-900">{deleting.name}</strong> ({deleting.start}–{deleting.end})? That
            time becomes a &quot;No shift&quot; period.
          </p>
        </Modal>
      )}

      {toast && (
        <div
          role="status"
          className={`fixed right-4 bottom-4 z-50 rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-lg ${
            toast.tone === "ok" ? "theme-fixed bg-slate-900" : "bg-red-600"
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

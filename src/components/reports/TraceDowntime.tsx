"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, RotateCcw } from "lucide-react";
import DateRangeInput from "@/components/ui/DateRangeInput";
import MultiSelect from "@/components/ui/MultiSelect";
import { downtimeTypeColors, downtimeTypeLabel, minutesLabel } from "@/config/downtime";
import { OEE_TARGET } from "@/config/oee";
import { machineApi } from "@/lib/machine-api";
import { reportApi } from "@/lib/report-api";
import { todayYmd } from "@/lib/reject-sheet";
import { MACHINE_CATEGORIES, MACHINE_CATEGORY_LABELS, type MachineCategory, type MachineRegistration } from "@/types/machine";
import type { TraceDowntimeReport, TraceFigures } from "@/types/trace";

// Trace downtime: OEE where the downtime is the uploaded downtime of the checked categories (EL, MS, …) instead of
// the machine status, next to the usual OEE. Availability (trace) = (counted − downtime of the checked categories)
// / counted; Performance and Quality are the usual ones.

interface Filters {
  from: string;
  to: string;
  category: MachineCategory;
  machines: string[];
}

const defaultFilters = (): Filters => {
  const today = todayYmd();
  return { from: `${today.slice(0, 8)}01`, to: today, category: "BAGGER", machines: [] };
};

const inputClass =
  "h-10 w-full rounded-lg border border-slate-200 bg-surface px-3 text-sm text-slate-800 focus:border-blue-400 focus:outline-none";
const fmt = new Intl.NumberFormat("en-US");
const dateFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "short" });
const pctText = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)}%`);
const oeeTone = (v: number | null) =>
  v === null ? "text-slate-400" : v >= OEE_TARGET ? "text-emerald-600" : v >= 60 ? "text-amber-600" : "text-red-600";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-slate-200 bg-surface p-4 md:p-5 ${className}`}>{children}</section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </div>
  );
}

/** Difference of the trace OEE to the usual one, e.g. "+2.3 pts". */
function delta(f: TraceFigures) {
  if (f.oee === null || f.signalOee === null) return null;
  const d = f.oee - f.signalOee;
  return { text: `${d >= 0 ? "+" : ""}${d.toFixed(1)} pts`, tone: d > 0 ? "text-emerald-600" : d < 0 ? "text-red-600" : "text-slate-500" };
}

export default function TraceDowntime() {
  const [machines, setMachines] = useState<MachineRegistration[]>([]);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [applied, setApplied] = useState<Filters>(defaultFilters);
  /** Checked uploaded categories; null = every category of the range (until one is unchecked). */
  const [types, setTypes] = useState<string[] | null>(null);
  /** Downtime source: the uploaded categories, or the machine status. They are not combined. */
  const [source, setSource] = useState<"upload" | "signal">("upload");
  const [result, setResult] = useState<{ key: string; report: TraceDowntimeReport } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  /** The request in effect; loading until its answer (or error) arrives. */
  const requestKey = JSON.stringify([applied, types, source]);
  const loading = result?.key !== requestKey && error?.key !== requestKey;
  const report = result?.report ?? null;

  useEffect(() => {
    machineApi
      .list()
      .then(setMachines)
      .catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    const key = JSON.stringify([applied, types, source]);
    reportApi
      .traceDowntime({ ...applied, source, types: types ?? undefined })
      .then((r) => alive && setResult({ key, report: r }))
      .catch((err: Error) => alive && setError({ key, message: err.message }));
    return () => {
      alive = false;
    };
  }, [applied, types, source]);
  const [formError, setFormError] = useState<string | null>(null);

  const machineOptions = useMemo(
    () =>
      machines
        .filter((m) => m.category === filters.category)
        .map((m) => ({ value: m.id, label: m.machineNo, hint: m.machineName })),
    [machines, filters.category]
  );
  const colorOf = useMemo(() => downtimeTypeColors(report?.types.map((t) => t.type) ?? []), [report]);

  const signal = source === "signal";
  const checked = new Set(signal ? [] : (report?.selected ?? []));
  const toggle = (type: string) => {
    // Checking an uploaded category leaves the machine signal: that category alone.
    if (signal) {
      setSource("upload");
      setTypes([type]);
      return;
    }
    const all = report?.types.map((t) => t.type) ?? [];
    const now = types ?? all;
    setTypes(now.includes(type) ? now.filter((t) => t !== type) : [...now, type]);
  };
  /** The machine signal replaces the uploaded categories; unchecking it goes back to all of them. */
  const toggleSignal = () => {
    if (signal) {
      setSource("upload");
      setTypes(null);
    } else setSource("signal");
  };

  const apply = (f: Filters) => {
    if (!f.from || !f.to) return setFormError("Choose a date range");
    if (f.from > f.to) return setFormError("The start date must not be after the end date");
    setFormError(null);
    // A new range may have other categories: start again with all of them.
    setTypes(null);
    setApplied({ ...f });
  };

  const t = report?.total;
  const d = t ? delta(t) : null;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-slate-500">Reports / Trace Downtime</p>
        <h2 className="text-xl font-semibold text-slate-900">Trace Downtime</h2>
        <p className="text-sm text-slate-500">
          OEE with Availability from the uploaded downtime of the categories you check, next to the usual OEE (downtime from the
          machine status).
        </p>
      </div>

      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            apply(filters);
          }}
          className="grid grid-cols-1 items-end gap-4 md:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1.5fr_auto]"
        >
          <Field label="Date Range">
            <DateRangeInput from={filters.from} to={filters.to} onChange={(r) => setFilters((f) => ({ ...f, ...r }))} />
          </Field>
          <Field label="Category">
            <select
              value={filters.category}
              onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value as MachineCategory, machines: [] }))}
              className={inputClass}
            >
              {MACHINE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {MACHINE_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Machine">
            <MultiSelect
              options={machineOptions}
              value={filters.machines}
              onChange={(v) => setFilters((f) => ({ ...f, machines: v }))}
              placeholder="All machines"
              ariaLabel="Machines"
            />
          </Field>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-(--brand) px-6 text-sm font-medium text-white hover:bg-(--brand-hover) disabled:opacity-60"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              Apply
            </button>
            <button
              type="button"
              onClick={() => {
                setFilters(defaultFilters());
                apply(defaultFilters());
              }}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 px-3 text-slate-600 hover:bg-slate-50"
              aria-label="Reset filters"
              title="Reset"
            >
              <RotateCcw size={16} />
            </button>
          </div>
        </form>
      </Card>

      {/* Downtime categories to count */}
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold text-slate-900">Downtime source</h3>
            <p className="text-xs text-slate-500">
              The machine signal, or the uploaded categories you check (combine as you like). The machine signal is not
              combined with uploaded categories.
            </p>
          </div>
          {report && report.types.length > 0 && (
            <div className="flex gap-3 text-xs font-medium">
              <button
                type="button"
                className="text-(--brand) hover:underline"
                onClick={() => {
                  setSource("upload");
                  setTypes(null);
                }}
              >
                All uploaded
              </button>
              <button
                type="button"
                className="text-(--brand) hover:underline"
                onClick={() => {
                  setSource("upload");
                  setTypes([]);
                }}
              >
                Uncheck all
              </button>
            </div>
          )}
        </div>
        {!report ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <label
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                signal ? "border-(--brand) bg-blue-50/40" : "border-slate-200 text-slate-500"
              }`}
            >
              <input type="checkbox" checked={signal} onChange={toggleSignal} className="size-4 accent-(--brand)" />
              <span className="size-2.5 rounded-full bg-amber-400" />
              <span className={signal ? "font-medium text-slate-900" : ""}>Machine signal (Stop / Off)</span>
              <span className="text-xs text-slate-500 tabular-nums">{minutesLabel(report.total.signalDowntimeSeconds)}</span>
            </label>
            <span className="px-1 text-xs font-medium text-slate-400">or uploaded:</span>
            {report.types.length === 0 && (
              <span className="text-sm text-slate-500">No downtime uploaded for these machines in this range.</span>
            )}
            {report.types.map((x) => {
              const on = checked.has(x.type);
              return (
                <label
                  key={x.type}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                    on ? "border-(--brand) bg-blue-50/40" : "border-slate-200 text-slate-500"
                  }`}
                >
                  <input type="checkbox" checked={on} onChange={() => toggle(x.type)} className="size-4 accent-(--brand)" />
                  <span className="size-2.5 rounded-full" style={{ background: colorOf(x.type) }} />
                  <span className={on ? "font-medium text-slate-900" : ""}>{downtimeTypeLabel(x.type)}</span>
                  <span className="text-xs text-slate-500 tabular-nums">
                    {minutesLabel(x.seconds)} · {fmt.format(x.count)}×
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </Card>

      {(formError || error?.key === requestKey) && (
        <p className="text-sm text-red-600">{formError ?? error?.message}</p>
      )}

      {report && t && (
        <div className={`space-y-4 ${loading ? "opacity-60 transition-opacity" : ""}`}>
          {/* Totals */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <p className="text-xs font-medium text-slate-500 uppercase">OEE (trace)</p>
              <p className={`mt-1 text-3xl font-bold tabular-nums ${oeeTone(t.oee)}`}>{pctText(t.oee)}</p>
              <p className="text-xs text-slate-500">
                Usual OEE {pctText(t.signalOee)}
                {d && <span className={`ml-1.5 font-medium ${d.tone}`}>{d.text}</span>}
              </p>
            </Card>
            <Card>
              <p className="text-xs font-medium text-slate-500 uppercase">Availability (trace)</p>
              <p className="mt-1 text-3xl font-bold text-slate-900 tabular-nums">{pctText(t.availability)}</p>
              <p className="text-xs text-slate-500">Usual (machine status) {pctText(t.signalAvailability)}</p>
            </Card>
            <Card>
              <p className="text-xs font-medium text-slate-500 uppercase">Performance · Quality</p>
              <p className="mt-1 text-3xl font-bold text-slate-900 tabular-nums">
                {pctText(t.performance)} <span className="text-lg text-slate-400">·</span> {pctText(t.quality)}
              </p>
              <p className="text-xs text-slate-500">Same as the usual OEE</p>
            </Card>
            <Card>
              <p className="text-xs font-medium text-slate-500 uppercase">Downtime counted</p>
              <p className="mt-1 text-3xl font-bold text-slate-900 tabular-nums">{minutesLabel(t.downtimeSeconds)}</p>
              <p className="text-xs text-slate-500">
                of {minutesLabel(t.countedSeconds)} counted · machine status {minutesLabel(t.signalDowntimeSeconds)}
              </p>
            </Card>
          </div>
          {report.unmatchedSeconds > 0 && (
            <p className="text-xs text-amber-600">
              {minutesLabel(report.unmatchedSeconds)} of the checked downtime matched no counted machine time (no OEE data for
              that machine and date) and is not counted.
            </p>
          )}

          {/* Per machine and per date */}
          {(
            [
              { title: "Per Machine", rows: report.machines.map((m) => ({ key: m.machineId, label: m.machineNo, f: m as TraceFigures })) },
              {
                title: "Per Date",
                rows: report.days.map((x) => ({ key: x.date, label: dateFmt.format(new Date(`${x.date}T00:00:00`)), f: x as TraceFigures })),
              },
            ] as const
          ).map((section) => (
            <Card key={section.title} className="p-0 md:p-0">
              <h3 className="px-4 py-3 font-semibold text-slate-900">{section.title}</h3>
              <div className="overflow-x-auto border-t border-slate-100">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">{section.title === "Per Machine" ? "Machine" : "Date"}</th>
                      <th className="px-4 py-2 text-right font-medium">Counted</th>
                      <th className="px-4 py-2 text-right font-medium">Downtime (checked)</th>
                      <th className="px-4 py-2 text-right font-medium">Availability (trace / usual)</th>
                      <th className="px-4 py-2 text-right font-medium">Performance</th>
                      <th className="px-4 py-2 text-right font-medium">Quality</th>
                      <th className="px-4 py-2 text-right font-medium">OEE (trace)</th>
                      <th className="px-4 py-2 text-right font-medium">Usual OEE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 tabular-nums">
                    {section.rows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                          No production data for these filters.
                        </td>
                      </tr>
                    ) : (
                      section.rows.map(({ key, label, f }) => {
                        const dd = delta(f);
                        return (
                          <tr key={key} className="hover:bg-slate-50">
                            <td className="px-4 py-2 font-medium text-slate-900">{label}</td>
                            <td className="px-4 py-2 text-right text-slate-600">{minutesLabel(f.countedSeconds)}</td>
                            <td className="px-4 py-2 text-right text-slate-700">{minutesLabel(f.downtimeSeconds)}</td>
                            <td className="px-4 py-2 text-right whitespace-nowrap text-slate-700">
                              {pctText(f.availability)} <span className="text-slate-400">/ {pctText(f.signalAvailability)}</span>
                            </td>
                            <td className="px-4 py-2 text-right text-slate-700">{pctText(f.performance)}</td>
                            <td className="px-4 py-2 text-right text-slate-700">{pctText(f.quality)}</td>
                            <td className={`px-4 py-2 text-right font-semibold ${oeeTone(f.oee)}`}>
                              {pctText(f.oee)}
                              {dd && <span className={`ml-1.5 text-xs font-normal ${dd.tone}`}>{dd.text}</span>}
                            </td>
                            <td className="px-4 py-2 text-right text-slate-500">{pctText(f.signalOee)}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
          <p className="text-xs text-slate-400">
            Availability (trace) = (counted time − downtime of the chosen source) ÷ counted time; OEE (trace) =
            Availability (trace) × Performance × Quality. Downtime is matched to machines and production dates through the
            machine linked to each uploaded row.
          </p>
        </div>
      )}
    </div>
  );
}

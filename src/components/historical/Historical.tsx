"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Box, CircleX, Download, Loader2, RotateCcw, Search } from "lucide-react";
import DateRangeInput from "@/components/ui/DateRangeInput";
import MultiSelect from "@/components/ui/MultiSelect";
import { OEE_TARGET } from "@/config/oee";
import { exportHistoricalExcel, hourRange } from "@/lib/historical-export";
import { historicalApi } from "@/lib/historical-api";
import { useMachineLabel } from "@/lib/machine-label";
import { machineApi } from "@/lib/machine-api";
import { todayYmd } from "@/lib/reject-sheet";
import { dmy, type ReportFilterText } from "@/lib/report-export";
import { shiftApi } from "@/lib/shift-api";
import { skuApi } from "@/lib/sku-api";
import type { HistoricalData, HourlyDetail } from "@/types/historical";
import type { MachineRegistration } from "@/types/machine";
import type { ReportFigures } from "@/types/report";
import type { Shift } from "@/types/shift";
import type { SkuMaster } from "@/types/sku";
import { Ring, SERIES_COLORS, TrendChart, type TrendSeries } from "./HistoricalCharts";

const num = new Intl.NumberFormat("en-US");
const pct = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)}%`);
const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" });
const BRAND = "#1E6FD9";
const oeeColor = (v: number | null) => ((v ?? 0) >= OEE_TARGET ? "#22A447" : (v ?? 0) >= 60 ? "#F5A524" : "#E5484D");

type Metric = "oee" | "availability" | "performance" | "quality";
const METRICS: { value: Metric; label: string }[] = [
  { value: "oee", label: "OEE" },
  { value: "availability", label: "Availability" },
  { value: "performance", label: "Performance" },
  { value: "quality", label: "Quality" },
];
type Period = "daily" | "weekly" | "monthly";

interface Filters {
  from: string;
  to: string;
  machines: string[];
  skus: string[];
  shift: string;
}

const defaultFilters = (): Filters => {
  const today = todayYmd();
  return { from: `${today.slice(0, 8)}01`, to: today, machines: [], skus: [], shift: "" };
};
const apiFilter = (f: Filters) => ({ ...f, machines: f.machines.join(","), skus: f.skus.join(",") });

const inputClass =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-blue-400 focus:outline-none";

const ymdOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Key and label of the period a production date falls in (weeks start on Monday). */
function periodOf(date: string, period: Period) {
  if (period === "daily") return { key: date, label: dmy(date) };
  const d = new Date(`${date}T00:00:00`);
  if (period === "monthly") return { key: date.slice(0, 7), label: monthFmt.format(d) };
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  return { key: ymdOf(d), label: `${dmy(ymdOf(d)).slice(0, 5)} – ${dmy(ymdOf(end))}` };
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-slate-200 bg-white p-4 md:p-5 ${className}`}>{children}</section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-sm font-medium text-slate-800">{label}</p>
      {children}
    </div>
  );
}

function Kpi({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 px-1 py-2 xl:border-l xl:border-slate-200 xl:px-5 xl:first:border-l-0 xl:first:pl-1">
      <p className="mb-2 text-sm text-slate-600">{label}</p>
      <div className="flex items-center gap-3">{children}</div>
    </div>
  );
}

function RingKpi({ label, value, color, note }: { label: string; value: number | null; color: string; note?: string }) {
  return (
    <Kpi label={label}>
      <Ring value={value} color={color} />
      <div>
        <p className="text-2xl font-semibold text-slate-900 tabular-nums">{pct(value)}</p>
        {note && <p className="text-xs text-slate-500">{note}</p>}
      </div>
    </Kpi>
  );
}

const th = "border-b border-slate-200 bg-slate-50 px-3 py-2 font-semibold whitespace-nowrap text-slate-700";
const td = "border-t border-slate-100 px-3 py-2";

export default function Historical() {
  const name = useMachineLabel();
  const [machines, setMachines] = useState<MachineRegistration[]>([]);
  const [skus, setSkus] = useState<SkuMaster[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  /** Filters of the data on screen. */
  const [applied, setApplied] = useState<Filters>(defaultFilters);
  const [data, setData] = useState<HistoricalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>("oee");
  const [period, setPeriod] = useState<Period>("daily");
  const [pickedDetail, setPickedDetail] = useState<{ machineId: string; date: string } | null>(null);
  const [detail, setDetail] = useState<(HourlyDetail & { key: string }) | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    Promise.all([machineApi.list(), skuApi.list(), shiftApi.list()])
      .then(([m, s, sh]) => {
        setMachines(m.sort((a, b) => a.machineNo.localeCompare(b.machineNo, undefined, { numeric: true })));
        setSkus(s.sort((a, b) => a.skuId.localeCompare(b.skuId, undefined, { numeric: true })));
        setShifts(sh);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  const fetchData = useCallback((f: Filters) => {
    historicalApi
      .range(apiFilter(f))
      .then((d) => {
        setData(d);
        setApplied(f);
        setError(null);
        setPickedDetail(null);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // First load with the default filters (`loading` starts true for it).
  useEffect(() => fetchData(defaultFilters()), [fetchData]);

  const apply = (f: Filters) => {
    if (!f.from || !f.to) return setError("Choose a date range");
    if (f.from > f.to) return setError("The start date must not be after the end date");
    setLoading(true);
    setError(null);
    fetchData(f);
  };

  // ---- hourly detail: the picked machine and date, else the first machine on its latest day with data
  const daysWithData = useMemo(() => (data?.days ?? []).filter((d) => Object.keys(d.machines).length), [data]);
  const selection = useMemo(() => {
    if (!data?.machines.length) return null;
    const valid =
      pickedDetail &&
      data.machines.some((m) => m.machineId === pickedDetail.machineId) &&
      data.days.some((d) => d.date === pickedDetail.date);
    if (valid) return pickedDetail;
    const machineId = data.machines[0].machineId;
    const day = [...daysWithData].reverse().find((d) => d.machines[machineId]) ?? daysWithData.at(-1);
    return day ? { machineId, date: day.date } : null;
  }, [data, pickedDetail, daysWithData]);
  const detailKey = selection ? `${selection.machineId}|${selection.date}|${applied.skus.join(",")}|${applied.shift}` : "";

  useEffect(() => {
    if (!selection) return;
    historicalApi
      .hourly(selection.machineId, selection.date, { skus: applied.skus.join(","), shift: applied.shift })
      .then((d) => {
        setDetail({ ...d, key: detailKey });
        setDetailError(null);
      })
      .catch((err: Error) => setDetailError(err.message));
  }, [selection, applied, detailKey]);
  const shownDetail = detail && detail.key === detailKey ? detail : null;

  // ---- derived views
  const machineOptions = useMemo(
    () => machines.map((m) => ({ value: m.id, label: m.machineNo, hint: m.machineName })),
    [machines]
  );
  const skuOptions = useMemo(
    () => [
      ...skus.map((s) => ({ value: s.skuId, label: s.skuId, hint: s.productName })),
      { value: "-", label: "-", hint: "No / unknown SKU" },
    ],
    [skus]
  );

  /** One line per machine (up to the 8 categorical slots), else the total of all machines. */
  const trend = useMemo((): { series: TrendSeries[]; folded: boolean } => {
    if (!data) return { series: [], folded: false };
    if (data.machines.length > 0 && data.machines.length <= SERIES_COLORS.length) {
      return {
        folded: false,
        series: data.machines.map((m, i) => ({
          key: m.machineId,
          label: m.machineNo,
          color: SERIES_COLORS[i],
          values: data.days.map((d) => d.machines[m.machineId]?.[metric] ?? null),
        })),
      };
    }
    return {
      folded: data.machines.length > 0,
      series: [
        {
          key: "all",
          label: `All ${name.many.toLowerCase()}`,
          color: SERIES_COLORS[0],
          values: data.days.map((d) => d.total[metric]),
        },
      ],
    };
  }, [data, metric, name.many]);

  /** Output and reject per period and machine, newest period first; periods without data are left out. */
  const breakdown = useMemo(() => {
    const periods = new Map<string, { key: string; label: string; firstDate: string; machines: Map<string, { output: number; reject: number }>; output: number; reject: number }>();
    for (const d of daysWithData) {
      const p = periodOf(d.date, period);
      const row = periods.get(p.key) ?? { ...p, firstDate: d.date, machines: new Map(), output: 0, reject: 0 };
      for (const [id, f] of Object.entries(d.machines)) {
        const m = row.machines.get(id) ?? { output: 0, reject: 0 };
        m.output += f.output;
        m.reject += f.reject;
        row.machines.set(id, m);
      }
      row.output += d.total.output;
      row.reject += d.total.reject;
      periods.set(p.key, row);
    }
    return [...periods.values()].sort((a, b) => b.key.localeCompare(a.key));
  }, [daysWithData, period]);

  const filterText = (f: Filters): ReportFilterText => ({
    machines: f.machines.length ? machines.filter((m) => f.machines.includes(m.id)).map((m) => m.machineNo).join(", ") : "All",
    skus: f.skus.length ? f.skus.join(", ") : "All",
    shift: shifts.find((s) => s.id === f.shift)?.name ?? "All",
  });

  const runExport = async () => {
    if (!data) return;
    setExporting(true);
    try {
      await exportHistoricalExcel(data, shownDetail, filterText(applied), name.one);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const total: ReportFigures | null = data?.total ?? null;
  const dim = loading ? "opacity-60 transition-opacity" : "transition-opacity";
  const detailMachineNo = data?.machines.find((m) => m.machineId === selection?.machineId)?.machineNo;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Historical</h2>
        <p className="text-sm text-slate-500">OEE, output and reject over time per {name.one.toLowerCase()}</p>
      </div>

      {/* Filter */}
      <Card>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-900">Filter Data</h3>
          <button
            type="button"
            onClick={runExport}
            disabled={!data || exporting}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-[#1E6FD9] hover:bg-slate-50 disabled:opacity-50"
          >
            {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            Export
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            apply(filters);
          }}
          className="grid grid-cols-1 items-end gap-4 md:grid-cols-2 xl:grid-cols-[1.3fr_1.5fr_1fr_1fr_auto]"
        >
          <Field label="Date Range">
            <DateRangeInput from={filters.from} to={filters.to} onChange={(r) => setFilters((f) => ({ ...f, ...r }))} />
          </Field>
          <Field label={name.one}>
            <MultiSelect
              options={machineOptions}
              value={filters.machines}
              onChange={(v) => setFilters((f) => ({ ...f, machines: v }))}
              placeholder={`All ${name.many}`}
              ariaLabel={name.many}
            />
          </Field>
          <Field label="SKU">
            <MultiSelect
              options={skuOptions}
              value={filters.skus}
              onChange={(v) => setFilters((f) => ({ ...f, skus: v }))}
              placeholder="All SKU"
              ariaLabel="SKU"
            />
          </Field>
          <Field label="Shift">
            <select value={filters.shift} onChange={(e) => setFilters((f) => ({ ...f, shift: e.target.value }))} className={inputClass}>
              <option value="">All Shift</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.start} – {s.end})
                </option>
              ))}
            </select>
          </Field>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-[#1E6FD9] px-6 text-sm font-medium text-white hover:bg-[#185DB8] disabled:opacity-60"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              Apply
            </button>
            <button
              type="button"
              onClick={() => setFilters(defaultFilters())}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-50 px-4 text-sm font-medium text-[#1E6FD9] hover:bg-blue-100"
            >
              <RotateCcw size={16} />
              Reset
            </button>
          </div>
        </form>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </Card>

      {!data ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-sm text-slate-500">
          {loading ? (
            <>
              <Loader2 size={22} className="animate-spin" />
              Loading…
            </>
          ) : (
            "No data loaded."
          )}
        </Card>
      ) : (
        <div className={`space-y-4 ${dim}`}>
          {/* KPIs */}
          <Card className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-6">
            <Kpi label="Total Output">
              <Box size={34} className="shrink-0 text-[#1E6FD9]" />
              <p className="text-2xl font-semibold text-slate-900 tabular-nums">{num.format(total!.output)} pcs</p>
            </Kpi>
            <Kpi label="Total Reject">
              <CircleX size={34} className="shrink-0 text-red-500" />
              <div>
                <p className="text-2xl font-semibold text-slate-900 tabular-nums">{num.format(total!.reject)} pcs</p>
                <p className="text-xs text-slate-500">
                  {total!.output > 0 ? `${((total!.reject / total!.output) * 100).toFixed(2)}% of output` : "—"}
                </p>
              </div>
            </Kpi>
            <RingKpi label="OEE" value={total!.oee} color={oeeColor(total!.oee)} note={`Target ${OEE_TARGET}%`} />
            <RingKpi label="Availability" value={total!.availability} color={BRAND} />
            <RingKpi label="Performance" value={total!.performance} color={BRAND} />
            <RingKpi label="Quality" value={total!.quality} color={BRAND} />
          </Card>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            {/* Trend */}
            <Card className="xl:col-span-7">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900">{METRICS.find((m) => m.value === metric)!.label} Trend</h3>
                  <p className="text-xs text-slate-500">
                    Per production day
                    {trend.folded && ` · all ${data.machines.length} ${name.many.toLowerCase()} combined; filter up to ${SERIES_COLORS.length} to compare`}
                  </p>
                </div>
                <select
                  value={metric}
                  onChange={(e) => setMetric(e.target.value as Metric)}
                  aria-label="Trend metric"
                  className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-blue-400 focus:outline-none"
                >
                  {METRICS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              {data.machines.length ? (
                <TrendChart dates={data.days.map((d) => d.date)} series={trend.series} metric={metric} />
              ) : (
                <p className="py-16 text-center text-sm text-slate-400">No production data for these filters.</p>
              )}
            </Card>

            {/* By machine */}
            <Card className="xl:col-span-5">
              <h3 className="mb-3 font-semibold text-slate-900">OEE by {name.one}</h3>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className={`${th} text-left`}>{name.one}</th>
                      {["Output (pcs)", "Reject (pcs)", "OEE", "Availability", "Performance", "Quality"].map((h) => (
                        <th key={h} className={`${th} text-right`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.machines.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-3 py-10 text-center text-slate-400">
                          No data
                        </td>
                      </tr>
                    )}
                    {data.machines.map((m, i) => (
                      <tr
                        key={m.machineId}
                        onClick={() => selection && setPickedDetail({ machineId: m.machineId, date: selection.date })}
                        className={`cursor-pointer hover:bg-blue-50/50 ${selection?.machineId === m.machineId ? "bg-blue-50/70" : ""}`}
                        title="Show hourly detail"
                      >
                        <td className={`${td} whitespace-nowrap text-slate-800`}>
                          {!trend.folded && (
                            <span className="mr-2 inline-block h-0.5 w-3 rounded align-middle" style={{ background: SERIES_COLORS[i] }} />
                          )}
                          {m.machineNo}
                        </td>
                        <td className={`${td} text-right tabular-nums`}>{num.format(m.output)}</td>
                        <td className={`${td} text-right tabular-nums`}>{num.format(m.reject)}</td>
                        <td className={`${td} text-right font-semibold tabular-nums`}>{pct(m.oee)}</td>
                        <td className={`${td} text-right tabular-nums`}>{pct(m.availability)}</td>
                        <td className={`${td} text-right tabular-nums`}>{pct(m.performance)}</td>
                        <td className={`${td} text-right tabular-nums`}>{pct(m.quality)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-blue-50 font-semibold text-slate-900">
                      <td className="px-3 py-2 text-[#1E6FD9]">Total</td>
                      <td className="px-3 py-2 text-right tabular-nums">{num.format(data.total.output)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{num.format(data.total.reject)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{pct(data.total.oee)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{pct(data.total.availability)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{pct(data.total.performance)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{pct(data.total.quality)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>

            {/* Breakdown */}
            <Card className="xl:col-span-7">
              <div className="mb-3 flex flex-wrap items-center gap-4">
                <h3 className="font-semibold text-slate-900">{name.one} Breakdown</h3>
                <div className="flex rounded-lg bg-slate-100 p-0.5 text-sm" role="tablist">
                  {(["daily", "weekly", "monthly"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      role="tab"
                      aria-selected={period === p}
                      onClick={() => setPeriod(p)}
                      className={`rounded-md px-4 py-1.5 capitalize ${
                        period === p ? "bg-white font-medium text-[#1E6FD9] shadow-sm" : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div className="max-h-[420px] overflow-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="sticky top-0">
                    <tr>
                      <th rowSpan={2} className={`${th} text-left`}>
                        {period === "daily" ? "Date" : period === "weekly" ? "Week" : "Month"}
                      </th>
                      {data.machines.map((m) => (
                        <th key={m.machineId} colSpan={2} className={`${th} border-l text-center`}>
                          {m.machineNo}
                        </th>
                      ))}
                      <th colSpan={2} className={`${th} border-l text-center`}>
                        Total
                      </th>
                    </tr>
                    <tr>
                      {[...data.machines.map((m) => m.machineId), "total"].map((id) => (
                        <Fragment key={id}>
                          <th className={`${th} border-l text-right font-medium`}>Output (pcs)</th>
                          <th className={`${th} text-right font-medium`}>Reject (pcs)</th>
                        </Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.length === 0 && (
                      <tr>
                        <td colSpan={data.machines.length * 2 + 3} className="px-3 py-10 text-center text-slate-400">
                          No data
                        </td>
                      </tr>
                    )}
                    {breakdown.map((p) => {
                      const picked = period === "daily" && selection?.date === p.key;
                      return (
                        <tr
                          key={p.key}
                          onClick={
                            period === "daily" && selection
                              ? () => setPickedDetail({ machineId: selection.machineId, date: p.key })
                              : undefined
                          }
                          className={`${period === "daily" ? "cursor-pointer hover:bg-blue-50/50" : ""} ${picked ? "bg-blue-50/70" : ""}`}
                          title={period === "daily" ? "Show hourly detail" : undefined}
                        >
                          <td className={`${td} whitespace-nowrap text-slate-800`}>{p.label}</td>
                          {data.machines.map((m) => {
                            const v = p.machines.get(m.machineId);
                            return (
                              <Fragment key={m.machineId}>
                                <td className={`${td} border-l border-l-slate-100 text-right tabular-nums`}>{v ? num.format(v.output) : "—"}</td>
                                <td className={`${td} text-right tabular-nums`}>{v ? num.format(v.reject) : "—"}</td>
                              </Fragment>
                            );
                          })}
                          <td className={`${td} border-l border-l-slate-100 text-right font-semibold tabular-nums`}>{num.format(p.output)}</td>
                          <td className={`${td} text-right font-semibold tabular-nums`}>{num.format(p.reject)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Hourly detail */}
            <Card className="xl:col-span-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-slate-900">
                  Daily Detail{selection && detailMachineNo ? ` – ${detailMachineNo} (${dmy(selection.date)})` : ""}
                </h3>
                {selection && (
                  <div className="flex gap-2">
                    <select
                      value={selection.machineId}
                      onChange={(e) => setPickedDetail({ machineId: e.target.value, date: selection.date })}
                      aria-label={`Detail ${name.one.toLowerCase()}`}
                      className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-sm focus:border-blue-400 focus:outline-none"
                    >
                      {data.machines.map((m) => (
                        <option key={m.machineId} value={m.machineId}>
                          {m.machineNo}
                        </option>
                      ))}
                    </select>
                    <select
                      value={selection.date}
                      onChange={(e) => setPickedDetail({ machineId: selection.machineId, date: e.target.value })}
                      aria-label="Detail date"
                      className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-sm focus:border-blue-400 focus:outline-none"
                    >
                      {[...daysWithData].reverse().map((d) => (
                        <option key={d.date} value={d.date}>
                          {dmy(d.date)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              {!selection ? (
                <p className="py-16 text-center text-sm text-slate-400">No production data for these filters.</p>
              ) : detailError && !shownDetail ? (
                <p className="py-16 text-center text-sm text-red-600">{detailError}</p>
              ) : !shownDetail ? (
                <div className="flex justify-center py-16 text-slate-400">
                  <Loader2 size={20} className="animate-spin" />
                </div>
              ) : (
                <div className="max-h-[420px] overflow-auto rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0">
                      <tr>
                        <th className={`${th} text-left`}>Time</th>
                        <th className={`${th} text-left`}>SKU</th>
                        <th className={`${th} text-right`}>Output (pcs)</th>
                        <th className={`${th} text-right`}>Reject (pcs)</th>
                        <th className={`${th} text-right`}>OEE</th>
                        <th className={`${th} text-left`}>Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shownDetail.rows.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-3 py-10 text-center text-slate-400">
                            No data for this {name.one.toLowerCase()} on this date
                          </td>
                        </tr>
                      )}
                      {shownDetail.rows.map((r) => (
                        <tr key={`${r.hourStart}|${r.skuCode}`} className="hover:bg-slate-50">
                          <td className={`${td} whitespace-nowrap tabular-nums`}>{hourRange(r.hourStart)}</td>
                          <td className={`${td} whitespace-nowrap`} title={r.productName}>
                            {r.skuCode}
                          </td>
                          <td className={`${td} text-right tabular-nums`}>{num.format(r.output)}</td>
                          <td className={`${td} text-right tabular-nums`}>{num.format(r.reject)}</td>
                          <td className={`${td} text-right tabular-nums`}>{pct(r.oee)}</td>
                          <td className={`${td} text-slate-600`}>{r.remarks || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                    {shownDetail.rows.length > 0 && (
                      <tfoot>
                        <tr className="bg-blue-50 font-semibold text-slate-900">
                          <td className="px-3 py-2" colSpan={2}>
                            Total
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{num.format(shownDetail.total.output)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{num.format(shownDetail.total.reject)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{pct(shownDetail.total.oee)}</td>
                          <td className="px-3 py-2" />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

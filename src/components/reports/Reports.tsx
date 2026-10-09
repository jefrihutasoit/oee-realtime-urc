"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  Loader2,
  RotateCcw,
  Search,
} from "lucide-react";
import DateRangeInput from "@/components/ui/DateRangeInput";
import MultiSelect from "@/components/ui/MultiSelect";
import { useMachineLabel } from "@/lib/machine-label";
import { machineApi } from "@/lib/machine-api";
import { reportApi } from "@/lib/report-api";
import {
  REPORT_TYPES,
  exportReportExcel,
  exportReportPdf,
  formatFigures,
  reportColumns,
  reportTypeOf,
  totalCells,
  type ReportFilterText,
} from "@/lib/report-export";
import { todayYmd } from "@/lib/reject-sheet";
import { shiftApi } from "@/lib/shift-api";
import { skuApi } from "@/lib/sku-api";
import type { MachineRegistration } from "@/types/machine";
import type { Report, ReportType } from "@/types/report";
import type { Shift } from "@/types/shift";
import type { SkuMaster } from "@/types/sku";

const PAGE_SIZES = [5, 10, 20, 50];
const GROUP_NOUN: Record<ReportType, string> = { daily: "dates", shift: "shifts", machine: "machines", sku: "SKUs" };

interface Filters {
  from: string;
  to: string;
  machines: string[];
  skus: string[];
  shift: string;
  type: ReportType;
}

const defaultFilters = (): Filters => {
  const today = todayYmd();
  return { from: `${today.slice(0, 8)}01`, to: today, machines: [], skus: [], shift: "", type: "daily" };
};

const inputClass =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-blue-400 focus:outline-none";

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-sm font-medium text-slate-800">
        {label}
        {optional && <span className="font-normal text-[#1E6FD9]"> (Optional)</span>}
      </p>
      {children}
    </div>
  );
}

/** Page numbers around the current one, with "…" for skipped ranges. */
function pageList(current: number, count: number): (number | "…")[] {
  const pages = new Set([1, count, current - 1, current, current + 1].filter((p) => p >= 1 && p <= count));
  if (current <= 4) [2, 3, 4, 5].forEach((p) => p <= count && pages.add(p));
  if (current >= count - 3) [count - 4, count - 3, count - 2, count - 1].forEach((p) => p >= 1 && pages.add(p));
  const sorted = [...pages].sort((a, b) => a - b);
  return sorted.flatMap((p, i) => (i > 0 && p - sorted[i - 1] > 1 ? (["…", p] as const) : [p]));
}

export default function Reports() {
  const name = useMachineLabel();
  const [machines, setMachines] = useState<MachineRegistration[]>([]);
  const [skus, setSkus] = useState<SkuMaster[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  /** Filters of the report on screen, for its title and exports. */
  const [applied, setApplied] = useState<Filters | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    Promise.all([machineApi.list(), skuApi.list(), shiftApi.list()])
      .then(([m, s, sh]) => {
        setMachines(m.sort((a, b) => a.machineNo.localeCompare(b.machineNo, undefined, { numeric: true })));
        setSkus(s.sort((a, b) => a.skuId.localeCompare(b.skuId, undefined, { numeric: true })));
        setShifts(sh);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  const fetchReport = useCallback((f: Filters) => {
    reportApi
      .get({ type: f.type, from: f.from, to: f.to, machines: f.machines.join(","), skus: f.skus.join(","), shift: f.shift })
      .then((r) => {
        setReport(r);
        setApplied(f);
        setError(null);
        setCollapsed(new Set());
        setPage(1);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // First report with the default filters (`loading` starts true for it).
  useEffect(() => fetchReport(defaultFilters()), [fetchReport]);

  const generate = (f: Filters) => {
    if (!f.from || !f.to) return setError("Choose a date range");
    if (f.from > f.to) return setError("The start date must not be after the end date");
    setLoading(true);
    setError(null);
    fetchReport(f);
  };

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((f) => ({ ...f, [key]: value }));

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

  const filterText = (f: Filters): ReportFilterText => ({
    machines: f.machines.length ? machines.filter((m) => f.machines.includes(m.id)).map((m) => m.machineNo).join(", ") : "All",
    skus: f.skus.length ? f.skus.join(", ") : "All",
    shift: shifts.find((s) => s.id === f.shift)?.name ?? "All",
  });

  const runExport = async (kind: "pdf" | "excel") => {
    if (!report || !applied) return;
    setExporting(kind);
    try {
      await (kind === "pdf" ? exportReportPdf : exportReportExcel)(report, filterText(applied), name.one);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(null);
    }
  };

  const groups = report?.groups ?? [];
  const pageCount = Math.max(1, Math.ceil(groups.length / pageSize));
  const current = Math.min(page, pageCount);
  const visible = groups.slice((current - 1) * pageSize, current * pageSize);
  const columns = report ? reportColumns(report.type, name.one) : [];
  const allCollapsed = groups.length > 0 && groups.every((g) => collapsed.has(g.key));

  const toggle = (key: string) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Reports</h2>
        <p className="text-sm text-slate-500">View, filter and download production and OEE reports</p>
      </div>

      {/* Filter */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-5">
        <h3 className="mb-4 text-lg font-semibold text-slate-900">Report Filter</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            generate(filters);
          }}
          className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          <Field label="Date Range">
            <DateRangeInput from={filters.from} to={filters.to} onChange={(r) => setFilters((f) => ({ ...f, ...r }))} />
          </Field>
          <Field label={name.one}>
            <MultiSelect
              options={machineOptions}
              value={filters.machines}
              onChange={(v) => set("machines", v)}
              placeholder={`All ${name.many}`}
              ariaLabel={name.many}
            />
          </Field>
          <Field label="SKU" optional>
            <MultiSelect
              options={skuOptions}
              value={filters.skus}
              onChange={(v) => set("skus", v)}
              placeholder="All SKU"
              ariaLabel="SKU"
            />
          </Field>
          <Field label="Shift" optional>
            <select value={filters.shift} onChange={(e) => set("shift", e.target.value)} className={inputClass}>
              <option value="">All Shift</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.start} – {s.end})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Report Type">
            <select
              value={filters.type}
              onChange={(e) => set("type", e.target.value as ReportType)}
              className={inputClass}
            >
              {REPORT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end gap-3 md:col-span-2 xl:col-span-1">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-[#1E6FD9] px-4 text-sm font-medium text-white hover:bg-[#185DB8] disabled:opacity-60"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              Generate Report
            </button>
            <button
              type="button"
              onClick={() => setFilters(defaultFilters())}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-50 px-5 text-sm font-medium text-[#1E6FD9] hover:bg-blue-100"
            >
              <RotateCcw size={16} />
              Reset
            </button>
          </div>
        </form>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </section>

      {/* Result */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              Report Result{report && ` (${reportTypeOf(report.type).label})`}
            </h3>
            {report && applied && (
              <p className="text-xs text-slate-500">
                {report.from.split("-").reverse().join("/")} – {report.to.split("-").reverse().join("/")} ·{" "}
                {name.many}: {filterText(applied).machines} · SKU: {filterText(applied).skus} · Shift:{" "}
                {filterText(applied).shift}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => runExport("pdf")}
              disabled={!groups.length || exporting !== null}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-red-50 px-4 text-sm font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
            >
              {exporting === "pdf" ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
              Export to PDF
            </button>
            <button
              type="button"
              onClick={() => runExport("excel")}
              disabled={!groups.length || exporting !== null}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-50 px-4 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
            >
              {exporting === "excel" ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
              Export to Excel
            </button>
          </div>
        </div>

        {!report ? (
          <div className="flex flex-col items-center gap-3 py-16 text-sm text-slate-500">
            {loading ? (
              <>
                <Loader2 size={22} className="animate-spin" />
                Generating report…
              </>
            ) : (
              "Choose the filters and generate a report."
            )}
          </div>
        ) : (
          <>
            <div className={`overflow-x-auto rounded-lg border border-slate-200 ${loading ? "opacity-60" : ""}`}>
              <table className="w-full min-w-[960px] text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    {columns.map((c, i) => (
                      <th
                        key={c}
                        className={`border-b border-slate-200 px-3 py-2.5 font-semibold whitespace-nowrap ${
                          i === 0 ? "text-left" : i >= 4 ? "text-right" : "text-left"
                        }`}
                      >
                        {i === 0 && groups.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(groups.map((g) => g.key)))}
                            className="inline-flex items-center gap-1 hover:text-[#1E6FD9]"
                            title={allCollapsed ? "Expand all" : "Collapse all"}
                          >
                            <ChevronDown size={14} className={allCollapsed ? "-rotate-90" : ""} />
                            {c}
                          </button>
                        ) : (
                          c
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 && (
                    <tr>
                      <td colSpan={columns.length} className="px-3 py-12 text-center text-slate-400">
                        No production data for these filters.
                      </td>
                    </tr>
                  )}
                  {visible.map((g) => {
                    const open = !collapsed.has(g.key);
                    const [label, ...texts] = totalCells(report.type, g);
                    return (
                      <Fragment key={g.key}>
                        <tr className="cursor-pointer bg-slate-50/80 font-semibold text-slate-900 hover:bg-slate-100" onClick={() => toggle(g.key)}>
                          <td className="border-t border-slate-200 px-3 py-2.5 whitespace-nowrap">
                            <span className="inline-flex items-center gap-2">
                              <ChevronDown size={16} className={`text-slate-500 transition-transform ${open ? "" : "-rotate-90"}`} />
                              {label}
                            </span>
                          </td>
                          {texts.map((t, i) => (
                            <td key={i} className="border-t border-slate-200 px-3 py-2.5">
                              {t}
                            </td>
                          ))}
                          {formatFigures(g.total).map((v, i) => (
                            <td key={i} className="border-t border-slate-200 px-3 py-2.5 text-right tabular-nums">
                              {v}
                            </td>
                          ))}
                        </tr>
                        {open &&
                          g.rows.map((r) => (
                            <tr key={`${r.machineId}|${r.skuCode}`} className="text-slate-700 hover:bg-blue-50/40">
                              <td className="border-t border-slate-100 px-3 py-2" />
                              <td className="border-t border-slate-100 px-3 py-2">{r.machineNo}</td>
                              <td className="border-t border-slate-100 px-3 py-2 whitespace-nowrap">{r.skuCode}</td>
                              <td className="border-t border-slate-100 px-3 py-2">{r.productName}</td>
                              {formatFigures(r).map((v, i) => (
                                <td key={i} className="border-t border-slate-100 px-3 py-2 text-right tabular-nums">
                                  {v}
                                </td>
                              ))}
                            </tr>
                          ))}
                      </Fragment>
                    );
                  })}
                </tbody>
                {groups.length > 0 && (
                  <tfoot>
                    <tr className="bg-blue-50 font-semibold text-slate-900">
                      <td className="border-t border-slate-200 px-3 py-2.5" colSpan={4}>
                        Grand total
                      </td>
                      {formatFigures(report.total).map((v, i) => (
                        <td key={i} className="border-t border-slate-200 px-3 py-2.5 text-right tabular-nums">
                          {v}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Pagination: by group */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
              <nav className="flex items-center gap-1.5" aria-label="Pagination">
                <PageButton disabled={current <= 1} onClick={() => setPage(current - 1)} label="Previous page">
                  <ChevronLeft size={16} />
                </PageButton>
                {pageList(current, pageCount).map((p, i) =>
                  p === "…" ? (
                    <span key={`gap${i}`} className="flex size-9 items-center justify-center text-slate-400">
                      …
                    </span>
                  ) : (
                    <PageButton key={p} active={p === current} onClick={() => setPage(p)} label={`Page ${p}`}>
                      {p}
                    </PageButton>
                  )
                )}
                <PageButton disabled={current >= pageCount} onClick={() => setPage(current + 1)} label="Next page">
                  <ChevronRight size={16} />
                </PageButton>
              </nav>
              <div className="flex items-center gap-4">
                <span>
                  {groups.length
                    ? `Showing ${(current - 1) * pageSize + 1} – ${Math.min(current * pageSize, groups.length)} of ${groups.length} ${GROUP_NOUN[report.type]}`
                    : `0 ${GROUP_NOUN[report.type]}`}
                </span>
                <label className="flex items-center gap-2">
                  Rows per page
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm focus:border-blue-400 focus:outline-none"
                  >
                    {PAGE_SIZES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function PageButton({
  children,
  onClick,
  disabled,
  active,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={`flex size-9 items-center justify-center rounded-lg border text-sm tabular-nums disabled:opacity-40 ${
        active ? "border-[#1E6FD9] bg-[#1E6FD9] font-semibold text-white" : "border-slate-200 bg-white hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Play,
  RefreshCw,
  ScanSearch,
  Undo2,
  X,
  XCircle,
} from "lucide-react";
import { buttonStyles } from "@/components/ui/Modal";
import { downtimeApi } from "@/lib/downtime-api";
import { listDowntimeSheets, parseDowntimeSheet, type ParsedDowntimeSheet } from "@/lib/downtime-sheet";
import { todayYmd } from "@/lib/reject-sheet";
import type { DowntimeUploadInput, DowntimeUploadRow, DowntimeValidation } from "@/types/downtime";
import DowntimeTable from "./DowntimeTable";

// Downtime upload in steps: choose the Excel file, pick the sheet, extract it, review and fix the data right in the
// table (every change is checked again: only the machine is checked), then execute the import. Rows with a problem
// block the import until they are fixed or ignored. The uploaded data per date is listed below.

type SheetInfo = Awaited<ReturnType<typeof listDowntimeSheets>>[number];
type Step = "file" | "sheet" | "review";

const STEPS = ["Choose file", "Select sheet", "Extract & fix", "Execute import"];
const CHECK_DELAY_MS = 600;
const cellInput =
  "h-8 w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 text-sm hover:border-slate-200 focus:border-blue-400 focus:bg-surface focus:outline-none";

const pad = (n: number) => String(n).padStart(2, "0");
const minutesOf = (hhmm: string) => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3);
/** "7:5", "07.05" or "0705" → "07:05"; null when it is not a time. */
function timeOf(v: string): string | null {
  const m = /^(\d{1,2})[:.]?(\d{2})$/.exec(v.trim());
  return m && +m[1] < 24 && +m[2] < 60 ? `${pad(+m[1])}:${m[2]}` : null;
}
/** Start → end in seconds; an end before the start crosses midnight. */
const spanSeconds = (start: string, end: string) => ((((minutesOf(end) - minutesOf(start)) % 1440) + 1440) % 1440) * 60;

export default function DowntimeUpload() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("file");
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<SheetInfo[]>([]);
  const [sheetName, setSheetName] = useState("");
  const [sheet, setSheet] = useState<ParsedDowntimeSheet | null>(null);
  /** The extracted rows as edited by the user. */
  const [rows, setRows] = useState<DowntimeUploadRow[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [validation, setValidation] = useState<DowntimeValidation | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  /** Row numbers the user chose to leave out of the import. */
  const [ignored, setIgnored] = useState<Set<number>>(new Set());
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [done, setDone] = useState<{ text: string; dates: string[] } | null>(null);
  const [tableDate, setTableDate] = useState(todayYmd());
  const [reloadToken, setReloadToken] = useState(0);
  const checkSeq = useRef(0);
  /** Data to check shortly after the user stops typing. */
  const [toCheck, setToCheck] = useState<DowntimeUploadInput | null>(null);

  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(null), 15000);
    return () => clearTimeout(timer);
  }, [done]);

  const toInput = (list: DowntimeUploadRow[], skip: Set<number>): DowntimeUploadInput => ({
    rows: list.filter((r) => !skip.has(r.rowNumber)),
  });

  /** Checks the machine of every row; only the latest check counts. */
  const runCheck = useCallback(async (next: DowntimeUploadInput) => {
    const seq = ++checkSeq.current;
    setChecking(true);
    setCheckError(null);
    try {
      const result = await downtimeApi.validate(next);
      if (seq === checkSeq.current) setValidation(result);
    } catch (err) {
      if (seq !== checkSeq.current) return;
      setValidation(null);
      setCheckError(err instanceof Error ? err.message : "Validation failed");
    } finally {
      if (seq === checkSeq.current) setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (!toCheck) return;
    const timer = setTimeout(() => void runCheck(toCheck), CHECK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [toCheck, runCheck]);

  /** Checks now (a pending delayed check is dropped). */
  function validate(next: DowntimeUploadInput) {
    setToCheck(null);
    void runCheck(next);
  }

  // ---- step 1: file
  async function chooseFile(f: File) {
    reset();
    setFile(f);
    try {
      const list = await listDowntimeSheets(f);
      if (!list.length) throw new Error("The file has no sheets");
      setSheets(list);
      setSheetName((list.find((s) => s.looksLikeReject) ?? list[0]).name);
      setStep("sheet");
    } catch (err) {
      setFile(null);
      setFileError(`${f.name}: ${err instanceof Error ? err.message : "Could not read the file"}`);
    }
  }

  // ---- step 2 → 3: extract the chosen sheet
  async function extract() {
    if (!file || !sheetName) return;
    setExtracting(true);
    setFileError(null);
    setValidation(null);
    setIgnored(new Set());
    try {
      const parsed = await parseDowntimeSheet(file, sheetName);
      setSheet(parsed);
      setRows(parsed.rows);
      setOnlyProblems(false);
      setStep("review");
      validate(toInput(parsed.rows, new Set()));
    } catch (err) {
      setFileError(`Sheet "${sheetName}": ${err instanceof Error ? err.message : "Could not read the sheet"}. Choose another sheet.`);
    } finally {
      setExtracting(false);
    }
  }

  function reset() {
    setToCheck(null);
    checkSeq.current++;
    setStep("file");
    setFile(null);
    setSheets([]);
    setSheetName("");
    setSheet(null);
    setRows([]);
    setFileError(null);
    setValidation(null);
    setCheckError(null);
    setChecking(false);
    setIgnored(new Set());
    if (fileInput.current) fileInput.current.value = "";
  }

  // ---- step 3: fix
  function editRow(rowNumber: number, patch: Partial<DowntimeUploadRow>) {
    const next = rows.map((r) => {
      if (r.rowNumber !== rowNumber) return r;
      const row = { ...r, ...patch };
      // A new start / end gives the duration again.
      if (("start" in patch || "end" in patch) && row.start && row.end) row.durationSeconds = spanSeconds(row.start, row.end);
      return row;
    });
    setRows(next);
    setChecking(true);
    setToCheck(toInput(next, ignored));
  }
  function toggleIgnore(rowNumber: number) {
    const next = new Set(ignored);
    if (next.has(rowNumber)) next.delete(rowNumber);
    else next.add(rowNumber);
    setIgnored(next);
    validate(toInput(rows, next));
  }
  function undoEdits() {
    if (!sheet) return;
    setRows(sheet.rows);
    validate(toInput(sheet.rows, ignored));
  }

  // ---- step 4: import
  async function upload() {
    if (!sheet || !validation?.valid || checking) return;
    const input = toInput(rows, ignored);
    setUploading(true);
    setCheckError(null);
    try {
      const result = await downtimeApi.upload(input);
      const dates = [...new Set(input.rows.flatMap((r) => (r.productionDate ? [r.productionDate] : [])))].sort();
      setDone({
        text: `${result.saved} downtime rows imported${result.replaced ? ` (${result.replaced} replaced)` : ""}.`,
        dates,
      });
      if (dates.length) setTableDate(dates[0]);
      setReloadToken((n) => n + 1);
      reset();
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : "Import failed");
      validate(input);
    } finally {
      setUploading(false);
    }
  }

  const checkByRow = new Map(validation?.rows.map((r) => [r.rowNumber, r]) ?? []);
  const badRows = validation?.rows.filter((r) => r.issues.length).length ?? 0;
  const importRows = validation?.rows.length ?? 0;
  const edited = sheet ? rows.some((r, i) => JSON.stringify(r) !== JSON.stringify(sheet.rows[i])) : false;
  const shownRows = onlyProblems
    ? rows.filter((r) => !ignored.has(r.rowNumber) && (checkByRow.get(r.rowNumber)?.issues.length ?? 0) > 0)
    : rows;
  const stepIndex = step === "file" ? 0 : step === "sheet" ? 1 : validation?.valid && !checking ? 3 : 2;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Upload Downtime</h2>
        <p className="text-sm text-slate-500">
          Upload the downtime sheet. Only the machine is checked; the totals per category appear on the Dashboard Summary.
        </p>
      </div>

      {done && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
          <CheckCircle2 size={18} className="shrink-0" />
          <span>{done.text}</span>
          {done.dates.map((d) => (
            <button key={d} type="button" onClick={() => setTableDate(d)} className="font-medium text-(--brand) hover:underline">
              Show {d}
            </button>
          ))}
        </div>
      )}

      <section className="space-y-4 rounded-xl border border-slate-200 bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900">Downtime Sheet</h3>
            <p className="text-sm text-slate-500">
              Date, Machine Packaging, Bagger, Line, SKU, Start, End, Total, Notification, Detail, Operator, Tipe Downtime.
              One machine per row, written exactly as in Machine Management (e.g. 7A, 12).
            </p>
          </div>
          {file && (
            <button type="button" onClick={reset} disabled={uploading} className={buttonStyles.secondary}>
              <X size={16} />
              Clear
            </button>
          )}
        </div>

        {/* Steps */}
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {STEPS.map((label, i) => (
            <li key={label} className="flex items-center gap-2">
              <span
                className={`flex size-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                  i < stepIndex ? "bg-emerald-500 text-white" : i === stepIndex ? "bg-(--brand) text-white" : "bg-slate-100 text-slate-400"
                }`}
              >
                {i < stepIndex ? "✓" : i + 1}
              </span>
              <span className={i === stepIndex ? "font-medium text-slate-900" : "text-slate-500"}>{label}</span>
              {i < STEPS.length - 1 && <span className="h-px w-6 bg-slate-200" />}
            </li>
          ))}
        </ol>

        <input
          ref={fileInput}
          type="file"
          accept=".xlsx,.xls,.xlsm,.csv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && chooseFile(e.target.files[0])}
        />

        {fileError && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
            <XCircle size={18} className="mt-0.5 shrink-0" />
            <p>{fileError}</p>
          </div>
        )}

        {/* Step 1: file */}
        {step === "file" && (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (e.dataTransfer.files[0]) chooseFile(e.dataTransfer.files[0]);
            }}
            className={`flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 text-sm ${
              dragging ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:border-blue-300 hover:bg-slate-50"
            }`}
          >
            <FileSpreadsheet size={32} className="text-slate-400" />
            <span className="font-medium text-slate-700">Choose or drop an Excel file</span>
            <span className="text-slate-500">.xlsx, .xls or .csv</span>
          </button>
        )}

        {/* Step 2: sheet */}
        {step === "sheet" && file && (
          <div className="space-y-3">
            <div className="flex min-w-0 items-center gap-2 text-sm text-slate-700">
              <FileSpreadsheet size={18} className="shrink-0 text-emerald-600" />
              <span className="truncate font-medium">{file.name}</span>
              <span className="text-slate-400">· {sheets.length} sheet{sheets.length === 1 ? "" : "s"}</span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {sheets.map((s) => (
                <label
                  key={s.name}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm ${
                    sheetName === s.name ? "border-(--brand) bg-blue-50/40" : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="downtime-sheet"
                    checked={sheetName === s.name}
                    onChange={() => setSheetName(s.name)}
                    className="mt-0.5 accent-(--brand)"
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-900">{s.name}</span>
                    <span className="text-xs text-slate-500">
                      {s.rows} rows × {s.columns} columns
                      {s.looksLikeReject ? (
                        <span className="ml-1.5 text-emerald-600">· downtime layout found</span>
                      ) : (
                        <span className="ml-1.5 text-amber-600">· no &quot;Machine Packaging&quot; header</span>
                      )}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => fileInput.current?.click()} className={buttonStyles.secondary}>
                <FileSpreadsheet size={16} />
                Choose another file
              </button>
              <button type="button" onClick={extract} disabled={!sheetName || extracting} className={buttonStyles.primary}>
                {extracting ? <Loader2 size={16} className="animate-spin" /> : <ScanSearch size={16} />}
                Extract
              </button>
            </div>
          </div>
        )}

        {/* Step 3: review & fix, then import */}
        {step === "review" && sheet && (
          <>
            <div className="flex min-w-0 items-center gap-2 text-sm text-slate-700">
              <FileSpreadsheet size={18} className="shrink-0 text-emerald-600" />
              <span className="truncate font-medium">{file?.name}</span>
              <span className="text-slate-400">· sheet {sheet.sheetName}</span>
            </div>

            {checking && !validation ? (
              <p className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 size={16} className="animate-spin" /> Checking machine numbers...
              </p>
            ) : checkError ? (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
                <XCircle size={18} className="mt-0.5 shrink-0" />
                <p>{checkError}</p>
              </div>
            ) : validation?.valid ? (
              <div className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
                <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
                <p>
                  {importRows} rows are valid: every machine is registered. Ready to import.
                  {validation.replaced > 0 && ` ${validation.replaced} rows were imported before and will be replaced.`}
                </p>
              </div>
            ) : validation ? (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
                <XCircle size={18} className="mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="font-medium">
                    Fix the data before importing{badRows ? `: ${badRows} of ${validation.rows.length} rows have problems` : ""}.
                  </p>
                  {validation.errors.length > 0 && (
                    <ul className="list-disc pl-5">
                      {validation.errors.map((e) => (
                        <li key={e}>{e}</li>
                      ))}
                    </ul>
                  )}
                  <p>
                    Edit the red rows in the table (each change is checked again), press × to ignore a row, or register the
                    machine in Machine Management and press Check again.
                  </p>
                </div>
              </div>
            ) : null}

            {ignored.size > 0 && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                <p>{ignored.size} rows ignored by you; they are not imported.</p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <label className="flex items-center gap-2 text-slate-600">
                <input
                  type="checkbox"
                  checked={onlyProblems}
                  onChange={(e) => setOnlyProblems(e.target.checked)}
                  className="size-4 accent-(--brand)"
                />
                Show only rows with problems{badRows ? ` (${badRows})` : ""}
              </label>
              {edited && (
                <button type="button" onClick={undoEdits} className="inline-flex items-center gap-1 text-xs font-medium text-(--brand) hover:underline">
                  <Undo2 size={14} /> Undo my edits
                </button>
              )}
            </div>

            {/* Editable data */}
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[1400px] text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="w-10 px-2 py-2">
                      <span className="sr-only">Ignore</span>
                    </th>
                    <th className="px-2 py-2 font-medium">Row</th>
                    <th className="w-36 px-2 py-2 font-medium">Date</th>
                    <th className="w-24 px-2 py-2 font-medium">Machine</th>
                    <th className="w-16 px-2 py-2 font-medium">Bagger</th>
                    <th className="w-20 px-2 py-2 font-medium">Line</th>
                    <th className="w-24 px-2 py-2 font-medium">SKU</th>
                    <th className="w-20 px-2 py-2 font-medium">Start</th>
                    <th className="w-20 px-2 py-2 font-medium">End</th>
                    <th className="w-20 px-2 py-2 text-right font-medium" title="Duration in minutes">
                      Min
                    </th>
                    <th className="w-28 px-2 py-2 font-medium">Notification</th>
                    <th className="w-64 px-2 py-2 font-medium">Detail</th>
                    <th className="w-28 px-2 py-2 font-medium">Operator</th>
                    <th className="w-16 px-2 py-2 font-medium">Type</th>
                    <th className="px-2 py-2 font-medium">Check</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shownRows.length === 0 && (
                    <tr>
                      <td colSpan={15} className="px-3 py-6 text-center text-slate-400">
                        {onlyProblems ? "No rows with problems." : "No data rows in this sheet."}
                      </td>
                    </tr>
                  )}
                  {shownRows.map((r) => {
                    const isIgnored = ignored.has(r.rowNumber);
                    const check = isIgnored ? undefined : checkByRow.get(r.rowNumber);
                    const bad = !!check?.issues.length;
                    const original = sheet.rows.find((x) => x.rowNumber === r.rowNumber);
                    const changed = (v: unknown, o: unknown) => !isIgnored && String(v ?? "") !== String(o ?? "");
                    const field = (
                      value: string,
                      was: string,
                      onChange: (v: string) => void,
                      label: string,
                      extra: { align?: string; type?: string; required?: boolean } = {}
                    ) => (
                      <input
                        type={extra.type ?? "text"}
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        disabled={isIgnored || uploading}
                        aria-label={`${label}, row ${r.rowNumber}`}
                        className={`${cellInput} ${extra.align ?? ""} ${changed(value, was) ? "bg-blue-50/70 font-medium text-blue-900" : ""} ${
                          bad && extra.required && !value ? "border-red-300" : ""
                        }`}
                      />
                    );
                    const minutes = r.durationSeconds === null ? "" : String(Math.round(r.durationSeconds / 60));
                    const wasMinutes = original?.durationSeconds == null ? "" : String(Math.round(original.durationSeconds / 60));
                    return (
                      <tr
                        key={r.rowNumber}
                        className={isIgnored ? "bg-slate-50 [&_input]:text-slate-400" : bad ? "bg-red-50/60" : undefined}
                      >
                        <td className="px-2 py-1">
                          <button
                            type="button"
                            onClick={() => toggleIgnore(r.rowNumber)}
                            disabled={uploading}
                            title={isIgnored ? "Include this row again" : "Ignore this row"}
                            aria-label={isIgnored ? `Include row ${r.rowNumber}` : `Ignore row ${r.rowNumber}`}
                            className={`rounded-md p-1.5 ${
                              isIgnored ? "text-(--brand) hover:bg-blue-50" : "text-slate-400 hover:bg-red-50 hover:text-red-600"
                            }`}
                          >
                            {isIgnored ? <Undo2 size={16} /> : <X size={16} />}
                          </button>
                        </td>
                        <td className="px-2 py-1 text-slate-400">{r.rowNumber}</td>
                        <td className="px-1 py-1" title={r.dateFromAbove ? "Taken from the row above" : undefined}>
                          {field(
                            r.productionDate ?? "",
                            original?.productionDate ?? "",
                            (v) => editRow(r.rowNumber, { productionDate: v || null, dateFromAbove: false }),
                            "Date",
                            { type: "date", required: true }
                          )}
                        </td>
                        <td className="px-1 py-1 font-medium">
                          {field(r.machineText, original?.machineText ?? "", (v) => editRow(r.rowNumber, { machineText: v }), "Machine", {
                            required: true,
                          })}
                        </td>
                        <td className="px-1 py-1">{field(r.bagger, original?.bagger ?? "", (v) => editRow(r.rowNumber, { bagger: v }), "Bagger")}</td>
                        <td className="px-1 py-1">{field(r.line, original?.line ?? "", (v) => editRow(r.rowNumber, { line: v }), "Line")}</td>
                        <td className="px-1 py-1">{field(r.sku, original?.sku ?? "", (v) => editRow(r.rowNumber, { sku: v }), "SKU")}</td>
                        <td className="px-1 py-1 tabular-nums">
                          {field(r.start ?? "", original?.start ?? "", (v) => editRow(r.rowNumber, { start: timeOf(v) ?? (v || null) }), "Start", {
                            required: true,
                          })}
                        </td>
                        <td className="px-1 py-1 tabular-nums">
                          {field(r.end ?? "", original?.end ?? "", (v) => editRow(r.rowNumber, { end: timeOf(v) ?? (v || null) }), "End")}
                        </td>
                        <td className="px-1 py-1 tabular-nums">
                          {field(
                            minutes,
                            wasMinutes,
                            (v) => editRow(r.rowNumber, { durationSeconds: v.trim() === "" || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 60) }),
                            "Duration in minutes",
                            { align: "text-right" }
                          )}
                        </td>
                        <td className="px-1 py-1">
                          {field(r.notificationNo, original?.notificationNo ?? "", (v) => editRow(r.rowNumber, { notificationNo: v }), "Notification")}
                        </td>
                        <td className="px-1 py-1">{field(r.detail, original?.detail ?? "", (v) => editRow(r.rowNumber, { detail: v }), "Detail")}</td>
                        <td className="px-1 py-1">
                          {field(r.operator, original?.operator ?? "", (v) => editRow(r.rowNumber, { operator: v }), "Operator")}
                        </td>
                        <td className="px-1 py-1">
                          {field(r.downtimeType, original?.downtimeType ?? "", (v) => editRow(r.rowNumber, { downtimeType: v.toUpperCase() }), "Type")}
                        </td>
                        <td className="px-2 py-1">
                          {isIgnored ? (
                            <span className="text-xs font-medium text-slate-500">Ignored</span>
                          ) : !check ? (
                            checking ? <Loader2 size={14} className="animate-spin text-slate-400" /> : <span className="text-slate-400">—</span>
                          ) : bad || check.warnings.length ? (
                            <ul className="space-y-0.5 text-xs">
                              {check.issues.map((issue) => (
                                <li key={issue} className="text-red-700">
                                  {issue}
                                </li>
                              ))}
                              {check.warnings.map((w) => (
                                <li key={w} className="text-amber-700">
                                  {w}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <CheckCircle2 size={16} className="text-emerald-600" aria-label="Valid" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap justify-between gap-2">
              <button type="button" onClick={() => setStep("sheet")} disabled={uploading} className={buttonStyles.secondary}>
                <ArrowLeft size={16} />
                Choose another sheet
              </button>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => validate(toInput(rows, ignored))}
                  disabled={checking || uploading}
                  className={buttonStyles.secondary}
                >
                  <RefreshCw size={16} className={checking ? "animate-spin" : undefined} />
                  Check again
                </button>
                <button
                  type="button"
                  onClick={upload}
                  disabled={!validation?.valid || checking || uploading}
                  className={buttonStyles.primary}
                  title={!validation?.valid ? "Fix or ignore the rows with problems first" : undefined}
                >
                  {uploading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                  Execute import {validation?.valid && !checking ? `(${importRows} rows)` : ""}
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      <DowntimeTable date={tableDate} onDateChange={setTableDate} reloadToken={reloadToken} />
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
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
import { machineApi } from "@/lib/machine-api";
import { rejectApi } from "@/lib/reject-api";
import { downloadRejectTemplate, listSheets, parseRejectSheet, type ParsedRejectSheet } from "@/lib/reject-sheet";
import type { RejectUploadInput, RejectUploadResult, RejectUploadRow, RejectValidation } from "@/types/reject";
import type { Shift } from "@/types/shift";

// Reject upload in steps: choose the Excel file, pick the sheet, extract it, review and fix the data right in the
// table (every change is checked again against the machine and SKU master), then execute the import. Rows with a
// problem block the import until they are fixed or ignored.

interface RejectUploadProps {
  shifts: Shift[];
  onUploaded: (result: RejectUploadResult, input: RejectUploadInput) => void;
}

type SheetInfo = Awaited<ReturnType<typeof listSheets>>[number];
type Step = "file" | "sheet" | "review";

/** Shift from the sheet's "Shift" cell: an exact name, or the number in it ("2" → "Shift 2"). */
function matchShift(raw: string | null, shifts: Shift[]) {
  if (!raw) return "";
  const exact = shifts.find((s) => s.name.toLowerCase() === raw.toLowerCase());
  if (exact) return exact.id;
  const no = raw.match(/\d+/)?.[0];
  return (no && shifts.find((s) => s.name.match(/\d+/)?.[0] === String(Number(no)))?.id) || "";
}

/** A typed quantity: empty = none, a number when it reads as one, else the text (the check reports it). */
const quantityOf = (v: string): number | string | null => (v.trim() === "" ? null : Number.isFinite(Number(v)) ? Number(v) : v.trim());

const inputClass =
  "h-9 rounded-lg border border-slate-200 bg-surface px-3 text-sm focus:border-blue-400 focus:outline-none";
const cellInput =
  "h-8 w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 text-sm hover:border-slate-200 focus:border-blue-400 focus:bg-surface focus:outline-none";
const CHECK_DELAY_MS = 600;

const STEPS: { key: Step | "import"; label: string }[] = [
  { key: "file", label: "Choose file" },
  { key: "sheet", label: "Select sheet" },
  { key: "review", label: "Extract & fix" },
  { key: "import", label: "Execute import" },
];

export default function RejectUpload({ shifts, onUploaded }: RejectUploadProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("file");
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<SheetInfo[]>([]);
  const [sheetName, setSheetName] = useState("");
  const [sheet, setSheet] = useState<ParsedRejectSheet | null>(null);
  /** The extracted rows as edited by the user. */
  const [rows, setRows] = useState<RejectUploadRow[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [date, setDate] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [validation, setValidation] = useState<RejectValidation | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  /** Row numbers the user chose to leave out of the import. */
  const [ignored, setIgnored] = useState<Set<number>>(new Set());
  const [onlyProblems, setOnlyProblems] = useState(false);
  const checkSeq = useRef(0);
  /** Data to check shortly after the user stops typing. */
  const [toCheck, setToCheck] = useState<RejectUploadInput | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);


  /** Template with the active machines and the registered reject types. */
  async function downloadTemplate() {
    setDownloading(true);
    setTemplateError(null);
    try {
      const [machines, types] = await Promise.all([machineApi.list(), rejectApi.types()]);
      const machineNos = machines
        .filter((m) => m.isActive)
        .map((m) => m.machineNo)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      await downloadRejectTemplate(machineNos, types.map((t) => t.name));
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : "Could not create the template");
    } finally {
      setDownloading(false);
    }
  }

  const toInput = (
    s: ParsedRejectSheet,
    list: RejectUploadRow[],
    productionDate: string,
    shift: string,
    skip: Set<number>
  ): RejectUploadInput => ({
    productionDate,
    shiftId: shift,
    rejectTypes: s.rejectTypes,
    rows: list.filter((r) => !skip.has(r.rowNumber)),
  });
  const input = sheet ? toInput(sheet, rows, date, shiftId, ignored) : null;

  /** Checks the data against the machine and SKU master; only the latest check counts. */
  const runCheck = useCallback(async (next: RejectUploadInput) => {
    const seq = ++checkSeq.current;
    setChecking(true);
    setCheckError(null);
    try {
      const result = await rejectApi.validate(next);
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
  function validate(next: RejectUploadInput | null) {
    setToCheck(null);
    if (next) void runCheck(next);
  }
  /** Checks again shortly after the user stops typing. */
  function validateSoon(next: RejectUploadInput) {
    setChecking(true);
    setToCheck(next);
  }

  // ---- step 1: file
  async function chooseFile(f: File) {
    reset();
    setFile(f);
    try {
      const list = await listSheets(f);
      if (!list.length) throw new Error("The file has no sheets");
      setSheets(list);
      // Preselect the first sheet with the reject layout.
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
      const parsed = await parseRejectSheet(file, sheetName);
      const parsedShift = matchShift(parsed.shift, shifts);
      setSheet(parsed);
      setRows(parsed.rows);
      setDate(parsed.productionDate ?? "");
      setShiftId(parsedShift);
      setOnlyProblems(false);
      setStep("review");
      validate(toInput(parsed, parsed.rows, parsed.productionDate ?? "", parsedShift, new Set()));
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
  function editRow(rowNumber: number, patch: Partial<RejectUploadRow>) {
    if (!sheet) return;
    const next = rows.map((r) => (r.rowNumber === rowNumber ? { ...r, ...patch } : r));
    setRows(next);
    validateSoon(toInput(sheet, next, date, shiftId, ignored));
  }
  function editQuantity(rowNumber: number, index: number, value: string) {
    const row = rows.find((r) => r.rowNumber === rowNumber);
    if (!row) return;
    const quantities = [...row.quantities];
    quantities[index] = quantityOf(value);
    editRow(rowNumber, { quantities });
  }
  function toggleIgnore(rowNumber: number) {
    if (!sheet) return;
    const next = new Set(ignored);
    if (next.has(rowNumber)) next.delete(rowNumber);
    else next.add(rowNumber);
    setIgnored(next);
    validate(toInput(sheet, rows, date, shiftId, next));
  }
  /** Back to the extracted values (drops the edits). */
  function undoEdits() {
    if (!sheet) return;
    setRows(sheet.rows);
    validate(toInput(sheet, sheet.rows, date, shiftId, ignored));
  }

  // ---- step 4: import
  async function upload() {
    if (!input || !validation?.valid || checking) return;
    setUploading(true);
    setCheckError(null);
    try {
      const result = await rejectApi.upload(input);
      onUploaded(result, input);
      reset();
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : "Import failed");
      validate(input);
    } finally {
      setUploading(false);
    }
  }

  const issuesByRow = new Map(validation?.rows.map((r) => [r.rowNumber, r]) ?? []);
  const badRows = validation?.rows.filter((r) => r.issues.length).length ?? 0;
  const skippedRows = validation?.rows.filter((r) => r.skipped).length ?? 0;
  const warnedRows = validation?.rows.filter((r) => !r.skipped && r.warnings.length).length ?? 0;
  const importRows = (validation?.rows.length ?? 0) - skippedRows;
  const newTypes = new Set(validation?.newRejectTypes.map((t) => t.toLowerCase()) ?? []);
  const edited = sheet ? rows.some((r, i) => JSON.stringify(r) !== JSON.stringify(sheet.rows[i])) : false;
  const shownRows = onlyProblems
    ? rows.filter((r) => !ignored.has(r.rowNumber) && (issuesByRow.get(r.rowNumber)?.issues.length ?? 0) > 0)
    : rows;
  const stepIndex = step === "file" ? 0 : step === "sheet" ? 1 : validation?.valid && !checking ? 3 : 2;

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">Upload Reject Sheet</h3>
          <p className="text-sm text-slate-500">
            One Excel sheet per shift: MC, OPERATOR, SKU, FLV, then one column per reject type.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={downloadTemplate} disabled={downloading} className={buttonStyles.secondary}>
            {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            Download Template
          </button>
          {file && (
            <button type="button" onClick={reset} disabled={uploading} className={buttonStyles.secondary}>
              <X size={16} />
              Clear
            </button>
          )}
        </div>
      </div>
      {templateError && <p className="text-sm text-red-600">{templateError}</p>}

      {/* Steps */}
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {STEPS.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2">
            <span
              className={`flex size-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                i < stepIndex ? "bg-emerald-500 text-white" : i === stepIndex ? "bg-(--brand) text-white" : "bg-slate-100 text-slate-400"
              }`}
            >
              {i < stepIndex ? "✓" : i + 1}
            </span>
            <span className={i === stepIndex ? "font-medium text-slate-900" : "text-slate-500"}>{s.label}</span>
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
                  name="reject-sheet"
                  checked={sheetName === s.name}
                  onChange={() => setSheetName(s.name)}
                  className="mt-0.5 accent-(--brand)"
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-900">{s.name}</span>
                  <span className="text-xs text-slate-500">
                    {s.rows} rows × {s.columns} columns
                    {s.looksLikeReject ? (
                      <span className="ml-1.5 text-emerald-600">· reject layout found</span>
                    ) : (
                      <span className="ml-1.5 text-amber-600">· no &quot;MC&quot; header</span>
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
      {step === "review" && sheet && input && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-0 items-center gap-2 text-sm text-slate-700">
              <FileSpreadsheet size={18} className="shrink-0 text-emerald-600" />
              <span className="truncate font-medium">{file?.name}</span>
              <span className="text-slate-400">· sheet {sheet.sheetName}</span>
            </div>
            <label className="text-xs text-slate-500">
              Production date
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  validate(toInput(sheet, rows, e.target.value, shiftId, ignored));
                }}
                className={`${inputClass} mt-1 block`}
              />
            </label>
            <label className="text-xs text-slate-500">
              Shift {sheet.shift && <span className="text-slate-400">(sheet: {sheet.shift})</span>}
              <select
                value={shiftId}
                onChange={(e) => {
                  setShiftId(e.target.value);
                  validate(toInput(sheet, rows, date, e.target.value, ignored));
                }}
                className={`${inputClass} mt-1 block`}
              >
                <option value="">Select shift</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.start}–{s.end})
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Check summary */}
          {checking && !validation ? (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 size={16} className="animate-spin" /> Checking machine numbers and SKUs...
            </p>
          ) : checkError ? (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
              <XCircle size={18} className="mt-0.5 shrink-0" />
              <p>{checkError}</p>
            </div>
          ) : validation?.valid ? (
            <div className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
              <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
              <p>{importRows} rows are valid: machine numbers and SKUs match the master data. Ready to import.</p>
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
                  Edit the red cells in the table (each change is checked again), press × to ignore a row, or register the
                  missing machine / SKU in Machine / SKU Management and press Check again.
                </p>
              </div>
            </div>
          ) : null}

          {validation && (skippedRows > 0 || warnedRows > 0 || ignored.size > 0) && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <p>
                {skippedRows > 0 && `${skippedRows} rows have no SKU and are skipped. `}
                {warnedRows > 0 && `${warnedRows} rows have warnings. `}
                {ignored.size > 0 && `${ignored.size} rows ignored by you. `}
                Warnings do not block the import; see the Check column.
              </p>
            </div>
          )}
          {validation && validation.newRejectTypes.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg bg-blue-50 px-3 py-2.5 text-sm text-blue-800">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <p>
                New reject type{validation.newRejectTypes.length > 1 ? "s" : ""} will be added:{" "}
                <strong>{validation.newRejectTypes.join(", ")}</strong>
              </p>
            </div>
          )}
          {validation && validation.replacedMachines.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <p>
                Data for this date and shift already exists for machine {validation.replacedMachines.join(", ")}. It will be
                replaced.
              </p>
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
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="w-10 px-2 py-2">
                    <span className="sr-only">Ignore</span>
                  </th>
                  <th className="px-2 py-2 font-medium">Row</th>
                  <th className="w-20 px-2 py-2 font-medium">MC</th>
                  <th className="w-32 px-2 py-2 font-medium">Operator</th>
                  <th className="w-24 px-2 py-2 font-medium">SKU</th>
                  <th className="w-48 px-2 py-2 font-medium">FLV</th>
                  {sheet.rejectTypes.map((t) => (
                    <th key={t} className="w-24 px-2 py-2 text-right font-medium whitespace-nowrap">
                      {t}
                      {newTypes.has(t.toLowerCase()) && (
                        <span className="ml-1 rounded bg-blue-100 px-1 text-[10px] text-blue-700">NEW</span>
                      )}
                    </th>
                  ))}
                  <th className="px-2 py-2 font-medium">Check</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shownRows.length === 0 && (
                  <tr>
                    <td colSpan={7 + sheet.rejectTypes.length} className="px-3 py-6 text-center text-slate-400">
                      {onlyProblems ? "No rows with problems." : "No data rows in this sheet."}
                    </td>
                  </tr>
                )}
                {shownRows.map((r) => {
                  const isIgnored = ignored.has(r.rowNumber);
                  const check = isIgnored ? undefined : issuesByRow.get(r.rowNumber);
                  const bad = !!check?.issues.length;
                  const original = sheet.rows.find((x) => x.rowNumber === r.rowNumber);
                  const changed = (v: unknown, o: unknown) => !isIgnored && String(v ?? "") !== String(o ?? "");
                  const cell = (value: string, was: string, onChange: (v: string) => void, label: string, align = "") => (
                    <input
                      value={value}
                      onChange={(e) => onChange(e.target.value)}
                      disabled={isIgnored || uploading}
                      aria-label={`${label}, row ${r.rowNumber}`}
                      className={`${cellInput} ${align} ${changed(value, was) ? "bg-blue-50/70 font-medium text-blue-900" : ""} ${
                        bad && !value ? "border-red-300" : ""
                      }`}
                    />
                  );
                  return (
                    <tr
                      key={r.rowNumber}
                      className={
                        isIgnored
                          ? "bg-slate-50 text-slate-400 [&_input]:text-slate-400"
                          : bad
                            ? "bg-red-50/60"
                            : check?.skipped
                              ? "bg-amber-50/50"
                              : undefined
                      }
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
                      <td className="px-1 py-1 font-medium">
                        {cell(r.machineNo, original?.machineNo ?? "", (v) => editRow(r.rowNumber, { machineNo: v }), "MC")}
                      </td>
                      <td className="px-1 py-1">
                        {cell(r.operator, original?.operator ?? "", (v) => editRow(r.rowNumber, { operator: v }), "Operator")}
                      </td>
                      <td className="px-1 py-1">{cell(r.sku, original?.sku ?? "", (v) => editRow(r.rowNumber, { sku: v }), "SKU")}</td>
                      <td className="px-1 py-1">
                        <div className="flex items-center gap-1">
                          {cell(r.flavor, original?.flavor ?? "", (v) => editRow(r.rowNumber, { flavor: v }), "FLV")}
                          {check?.skuId && <span className="shrink-0 text-xs text-slate-400">({check.skuId})</span>}
                        </div>
                      </td>
                      {r.quantities.map((q, i) => (
                        <td key={i} className="px-1 py-1 tabular-nums">
                          {cell(
                            q === null ? "" : String(q),
                            original?.quantities[i] == null ? "" : String(original.quantities[i]),
                            (v) => editQuantity(r.rowNumber, i, v),
                            sheet.rejectTypes[i],
                            "text-right"
                          )}
                        </td>
                      ))}
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
          {sheet.idleMachines.length > 0 && <p className="text-xs text-slate-500">Skipped (no data): {sheet.idleMachines.join(", ")}</p>}

          <div className="flex flex-wrap justify-between gap-2">
            <button type="button" onClick={() => setStep("sheet")} disabled={uploading} className={buttonStyles.secondary}>
              <ArrowLeft size={16} />
              Choose another sheet
            </button>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => validate(input)} disabled={checking || uploading} className={buttonStyles.secondary}>
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
  );
}

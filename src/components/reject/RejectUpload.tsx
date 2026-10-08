"use client";

import { useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Undo2,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { buttonStyles } from "@/components/ui/Modal";
import { machineApi } from "@/lib/machine-api";
import { rejectApi } from "@/lib/reject-api";
import { downloadRejectTemplate, parseRejectSheet, type ParsedRejectSheet } from "@/lib/reject-sheet";
import type { RejectUploadInput, RejectUploadResult, RejectValidation } from "@/types/reject";
import type { Shift } from "@/types/shift";

interface RejectUploadProps {
  shifts: Shift[];
  onUploaded: (result: RejectUploadResult, input: RejectUploadInput) => void;
}

/** Shift from the sheet's "Shift" cell: an exact name, or the number in it ("2" → "Shift 2"). */
function matchShift(raw: string | null, shifts: Shift[]) {
  if (!raw) return "";
  const exact = shifts.find((s) => s.name.toLowerCase() === raw.toLowerCase());
  if (exact) return exact.id;
  const no = raw.match(/\d+/)?.[0];
  return (no && shifts.find((s) => s.name.match(/\d+/)?.[0] === String(Number(no)))?.id) || "";
}

const inputClass =
  "h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-blue-400 focus:outline-none";

export default function RejectUpload({ shifts, onUploaded }: RejectUploadProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sheet, setSheet] = useState<ParsedRejectSheet | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [validation, setValidation] = useState<RejectValidation | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  /** Row numbers the user chose to leave out of the upload. */
  const [ignored, setIgnored] = useState<Set<number>>(new Set());
  const checkSeq = useRef(0);
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
    productionDate: string,
    shift: string,
    skip: Set<number> = ignored
  ): RejectUploadInput => ({
    productionDate,
    shiftId: shift,
    rejectTypes: s.rejectTypes,
    rows: s.rows.filter((r) => !skip.has(r.rowNumber)),
  });
  const input = sheet ? toInput(sheet, date, shiftId) : null;

  /** Leaves a row out of (or back into) the upload, then checks the sheet again. */
  function toggleIgnore(rowNumber: number) {
    if (!sheet) return;
    const next = new Set(ignored);
    if (next.has(rowNumber)) next.delete(rowNumber);
    else next.add(rowNumber);
    setIgnored(next);
    validate(toInput(sheet, date, shiftId, next));
  }

  async function readFile(f: File, sheetName?: string) {
    setFile(f);
    setValidation(null);
    setParseError(null);
    setIgnored(new Set());
    try {
      const parsed = await parseRejectSheet(f, sheetName);
      const parsedShift = matchShift(parsed.shift, shifts);
      setSheet(parsed);
      setDate(parsed.productionDate ?? "");
      setShiftId(parsedShift);
      validate(toInput(parsed, parsed.productionDate ?? "", parsedShift, new Set()));
    } catch (err) {
      setSheet(null);
      setParseError(err instanceof Error ? err.message : "Could not read the file");
    }
  }

  function reset() {
    setFile(null);
    setSheet(null);
    setParseError(null);
    setValidation(null);
    setCheckError(null);
    setIgnored(new Set());
    if (fileInput.current) fileInput.current.value = "";
  }

  /** Checks the sheet against the machine and SKU master; runs on every change of the sheet, date or shift. */
  async function validate(next: RejectUploadInput | null = input) {
    if (!next) return;
    // Only the latest check counts when the date or shift changes while one is running.
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
  }

  async function upload() {
    if (!input || !validation?.valid) return;
    setUploading(true);
    setCheckError(null);
    try {
      const result = await rejectApi.upload(input);
      onUploaded(result, input);
      reset();
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : "Upload failed");
      validate();
    } finally {
      setUploading(false);
    }
  }

  const issuesByRow = new Map(validation?.rows.map((r) => [r.rowNumber, r]) ?? []);
  const badRows = validation?.rows.filter((r) => r.issues.length).length ?? 0;
  const skippedRows = validation?.rows.filter((r) => r.skipped).length ?? 0;
  const warnedRows = validation?.rows.filter((r) => !r.skipped && r.warnings.length).length ?? 0;
  const uploadRows = (validation?.rows.length ?? 0) - skippedRows;
  const newTypes = new Set(validation?.newRejectTypes.map((t) => t.toLowerCase()) ?? []);

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
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

      <input
        ref={fileInput}
        type="file"
        accept=".xlsx,.xls,.xlsm,.csv"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])}
      />

      {!sheet && (
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
            if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]);
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

      {parseError && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
          <XCircle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">{file?.name}: {parseError}</p>
            <p>Check the sheet layout and choose the file again.</p>
          </div>
        </div>
      )}

      {sheet && input && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-0 items-center gap-2 text-sm text-slate-700">
              <FileSpreadsheet size={18} className="shrink-0 text-emerald-600" />
              <span className="truncate font-medium">{file?.name}</span>
            </div>
            {sheet.sheetNames.length > 1 && (
              <label className="text-xs text-slate-500">
                Sheet
                <select
                  value={sheet.sheetName}
                  onChange={(e) => file && readFile(file, e.target.value)}
                  className={`${inputClass} mt-1 block`}
                >
                  {sheet.sheetNames.map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="text-xs text-slate-500">
              Production date
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  validate(toInput(sheet, e.target.value, shiftId));
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
                  validate(toInput(sheet, date, e.target.value));
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

          {/* Validation summary */}
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
              <p>
                {uploadRows} rows are valid: machine numbers and SKUs match the master data. Ready to upload.
              </p>
            </div>
          ) : validation ? (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
              <XCircle size={18} className="mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="font-medium">
                  Cannot upload yet{badRows ? `: ${badRows} of ${validation.rows.length} rows have problems` : ""}.
                </p>
                {validation.errors.length > 0 && (
                  <ul className="list-disc pl-5">
                    {validation.errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                )}
                <p>
                  Fix the rows marked in red in the Excel file and choose it again, register the missing machine /
                  SKU (Machine Management, SKU Management) and press Check again, or press × on a row to ignore it.
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
                Warnings do not block the upload; see the Check column.
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
                Data for this date and shift already exists for machine {validation.replacedMachines.join(", ")}. It
                will be replaced.
              </p>
            </div>
          )}

          {/* Preview */}
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="w-10 px-2 py-2">
                    <span className="sr-only">Ignore</span>
                  </th>
                  <th className="px-3 py-2 font-medium">Row</th>
                  <th className="px-3 py-2 font-medium">MC</th>
                  <th className="px-3 py-2 font-medium">Operator</th>
                  <th className="px-3 py-2 font-medium">SKU</th>
                  <th className="px-3 py-2 font-medium">FLV</th>
                  {sheet.rejectTypes.map((t) => (
                    <th key={t} className="px-3 py-2 text-right font-medium whitespace-nowrap">
                      {t}
                      {newTypes.has(t.toLowerCase()) && (
                        <span className="ml-1 rounded bg-blue-100 px-1 text-[10px] text-blue-700">NEW</span>
                      )}
                    </th>
                  ))}
                  <th className="px-3 py-2 font-medium">Check</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sheet.rows.map((r) => {
                  const isIgnored = ignored.has(r.rowNumber);
                  const check = isIgnored ? undefined : issuesByRow.get(r.rowNumber);
                  const bad = !!check?.issues.length;
                  return (
                    <tr
                      key={r.rowNumber}
                      className={
                        isIgnored
                          ? "bg-slate-50 text-slate-400 [&_td]:text-slate-400"
                          : bad
                            ? "bg-red-50/60"
                            : check?.skipped
                              ? "bg-amber-50/50 text-slate-400"
                              : undefined
                      }
                    >
                      <td className="px-2 py-1.5">
                        <button
                          type="button"
                          onClick={() => toggleIgnore(r.rowNumber)}
                          disabled={uploading}
                          title={isIgnored ? "Include this row again" : "Ignore this row"}
                          aria-label={isIgnored ? `Include row ${r.rowNumber}` : `Ignore row ${r.rowNumber}`}
                          className={`rounded-md p-1.5 ${
                            isIgnored
                              ? "text-[#1E6FD9] hover:bg-blue-50"
                              : "text-slate-400 hover:bg-red-50 hover:text-red-600"
                          }`}
                        >
                          {isIgnored ? <Undo2 size={16} /> : <X size={16} />}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-slate-400">{r.rowNumber}</td>
                      <td className="px-3 py-2 font-medium text-slate-900">{r.machineNo || "—"}</td>
                      <td className="px-3 py-2 text-slate-700">{r.operator || "—"}</td>
                      <td className="px-3 py-2 text-slate-700">{r.sku || "—"}</td>
                      <td className="px-3 py-2 text-slate-700">
                        {r.flavor || "—"}
                        {check?.skuId && <span className="ml-1 text-xs text-slate-400">({check.skuId})</span>}
                      </td>
                      {r.quantities.map((q, i) => (
                        <td key={i} className="px-3 py-2 text-right text-slate-700 tabular-nums">
                          {q ?? ""}
                        </td>
                      ))}
                      <td className="px-3 py-2">
                        {isIgnored ? (
                          <span className="text-xs font-medium text-slate-500">Ignored</span>
                        ) : !check ? (
                          <span className="text-slate-400">—</span>
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
          {sheet.idleMachines.length > 0 && (
            <p className="text-xs text-slate-500">
              Skipped (no data): {sheet.idleMachines.join(", ")}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading} className={buttonStyles.secondary}>
              <FileSpreadsheet size={16} />
              Choose another file
            </button>
            <button type="button" onClick={() => validate()} disabled={checking || uploading} className={buttonStyles.secondary}>
              <RefreshCw size={16} className={checking ? "animate-spin" : undefined} />
              Check again
            </button>
            <button
              type="button"
              onClick={upload}
              disabled={!validation?.valid || checking || uploading}
              className={buttonStyles.primary}
            >
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              Upload {validation?.valid ? `${uploadRows} rows` : ""}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

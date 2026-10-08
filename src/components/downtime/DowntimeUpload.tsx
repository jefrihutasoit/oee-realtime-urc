"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, RefreshCw, Undo2, Upload, X, XCircle } from "lucide-react";
import { buttonStyles } from "@/components/ui/Modal";
import { minutesLabel } from "@/config/downtime";
import { downtimeApi } from "@/lib/downtime-api";
import { parseDowntimeSheet, type ParsedDowntimeSheet } from "@/lib/downtime-sheet";
import { todayYmd } from "@/lib/reject-sheet";
import type { DowntimeUploadInput, DowntimeValidation } from "@/types/downtime";
import DowntimeTable from "./DowntimeTable";

const inputClass =
  "h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-blue-400 focus:outline-none";

/** Upload of the downtime sheet (only the machine of each row is checked) and the uploaded data per date. */
export default function DowntimeUpload() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sheet, setSheet] = useState<ParsedDowntimeSheet | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [validation, setValidation] = useState<DowntimeValidation | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  /** Row numbers the user chose to leave out of the upload. */
  const [ignored, setIgnored] = useState<Set<number>>(new Set());
  const [done, setDone] = useState<{ text: string; dates: string[] } | null>(null);
  const [tableDate, setTableDate] = useState(todayYmd());
  const [reloadToken, setReloadToken] = useState(0);
  const checkSeq = useRef(0);

  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(null), 15000);
    return () => clearTimeout(timer);
  }, [done]);

  const toInput = (s: ParsedDowntimeSheet, skip: Set<number> = ignored): DowntimeUploadInput => ({
    rows: s.rows.filter((r) => !skip.has(r.rowNumber)),
  });

  async function validate(next: DowntimeUploadInput | null = sheet ? toInput(sheet) : null) {
    if (!next) return;
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
  }

  async function readFile(f: File, sheetName?: string) {
    setFile(f);
    setValidation(null);
    setParseError(null);
    setIgnored(new Set());
    try {
      const parsed = await parseDowntimeSheet(f, sheetName);
      setSheet(parsed);
      validate(toInput(parsed, new Set()));
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

  function toggleIgnore(rowNumber: number) {
    if (!sheet) return;
    const next = new Set(ignored);
    if (next.has(rowNumber)) next.delete(rowNumber);
    else next.add(rowNumber);
    setIgnored(next);
    validate(toInput(sheet, next));
  }

  async function upload() {
    if (!sheet || !validation?.valid) return;
    const input = toInput(sheet);
    setUploading(true);
    setCheckError(null);
    try {
      const result = await downtimeApi.upload(input);
      const dates = [...new Set(input.rows.flatMap((r) => (r.productionDate ? [r.productionDate] : [])))].sort();
      setDone({
        text: `${result.saved} downtime rows uploaded${result.replaced ? ` (${result.replaced} replaced)` : ""}.`,
        dates,
      });
      if (dates.length) setTableDate(dates[0]);
      setReloadToken((n) => n + 1);
      reset();
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : "Upload failed");
      validate();
    } finally {
      setUploading(false);
    }
  }

  const checkByRow = new Map(validation?.rows.map((r) => [r.rowNumber, r]) ?? []);
  const badRows = validation?.rows.filter((r) => r.issues.length).length ?? 0;
  const uploadRows = validation?.rows.length ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Upload Downtime</h2>
        <p className="text-sm text-slate-500">
          Upload the downtime sheet. Only the machine is checked; the totals per category appear on the Dashboard
          Summary.
        </p>
      </div>

      {done && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
          <CheckCircle2 size={18} className="shrink-0" />
          <span>{done.text}</span>
          {done.dates.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setTableDate(d)}
              className="font-medium text-[#1E6FD9] hover:underline"
            >
              Show {d}
            </button>
          ))}
        </div>
      )}

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900">Downtime Sheet</h3>
            <p className="text-sm text-slate-500">
              Date, Machine Packaging, Bagger, Line, SKU, Start, End, Total, Notification, Detail, Operator, Tipe
              Downtime. One machine per row, written exactly as in Machine Management (e.g. 7A, 12).
            </p>
          </div>
          {file && (
            <button type="button" onClick={reset} disabled={uploading} className={buttonStyles.secondary}>
              <X size={16} />
              Clear
            </button>
          )}
        </div>

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
              <p className="font-medium">
                {file?.name}: {parseError}
              </p>
              <p>Check the sheet layout and choose the file again.</p>
            </div>
          </div>
        )}

        {sheet && (
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
                  {uploadRows} rows are valid: every machine is registered. Ready to upload.
                  {validation.replaced > 0 && ` ${validation.replaced} rows were uploaded before and will be replaced.`}
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
                    Fix the rows marked in red in the Excel file and choose it again, register the machine in Machine
                    Management and press Check again, or press × on a row to ignore it.
                  </p>
                </div>
              </div>
            ) : null}

            {ignored.size > 0 && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                <p>{ignored.size} rows ignored by you; they are not uploaded.</p>
              </div>
            )}

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="w-10 px-2 py-2">
                      <span className="sr-only">Ignore</span>
                    </th>
                    <th className="px-3 py-2 font-medium">Row</th>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Machine</th>
                    <th className="px-3 py-2 font-medium">Bagger</th>
                    <th className="px-3 py-2 font-medium">Line</th>
                    <th className="px-3 py-2 font-medium">SKU</th>
                    <th className="px-3 py-2 font-medium">Time</th>
                    <th className="px-3 py-2 text-right font-medium">Duration</th>
                    <th className="px-3 py-2 font-medium">Detail</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Check</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sheet.rows.map((r) => {
                    const isIgnored = ignored.has(r.rowNumber);
                    const check = isIgnored ? undefined : checkByRow.get(r.rowNumber);
                    const bad = !!check?.issues.length;
                    return (
                      <tr
                        key={r.rowNumber}
                        className={
                          isIgnored ? "bg-slate-50 [&_td]:text-slate-400" : bad ? "bg-red-50/60" : undefined
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
                              isIgnored ? "text-[#1E6FD9] hover:bg-blue-50" : "text-slate-400 hover:bg-red-50 hover:text-red-600"
                            }`}
                          >
                            {isIgnored ? <Undo2 size={16} /> : <X size={16} />}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-slate-400">{r.rowNumber}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-slate-700">
                          {r.productionDate ?? "—"}
                          {r.dateFromAbove && <span className="ml-1 text-xs text-slate-400">(above)</span>}
                        </td>
                        <td className="px-3 py-2 font-medium text-slate-900">
                          {r.machineText || "—"}
                        </td>
                        <td className="px-3 py-2 text-slate-700">{r.bagger}</td>
                        <td className="px-3 py-2 text-slate-700">{r.line}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-slate-700">{r.sku}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-slate-700 tabular-nums">
                          {r.start ?? "—"}–{r.end ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap text-slate-700 tabular-nums">
                          {r.durationSeconds === null ? "—" : minutesLabel(r.durationSeconds)}
                        </td>
                        <td className="max-w-xs truncate px-3 py-2 text-slate-700" title={r.detail}>
                          {r.detail}
                        </td>
                        <td className="px-3 py-2 text-slate-700">{r.downtimeType}</td>
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

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
                className={buttonStyles.secondary}
              >
                <FileSpreadsheet size={16} />
                Choose another file
              </button>
              <button
                type="button"
                onClick={() => validate()}
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
              >
                {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                Upload {validation?.valid ? `${uploadRows} rows` : ""}
              </button>
            </div>
          </>
        )}
      </section>

      <DowntimeTable date={tableDate} onDateChange={setTableDate} reloadToken={reloadToken} />
    </div>
  );
}

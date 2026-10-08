"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  DatabaseBackup,
  Download,
  FileSpreadsheet,
  Loader2,
  RotateCcw,
  X,
  XCircle,
} from "lucide-react";
import Modal, { buttonStyles } from "@/components/ui/Modal";
import { backupApi } from "@/lib/backup-api";
import { downloadBackup, parseBackupFile } from "@/lib/settings-backup";
import type { BackupCheck, SettingsBackup as Backup } from "@/types/backup";

const INCLUDED = [
  "Machines with production and monitoring tags, OEE settings",
  "SKU master (without photos)",
  "Shifts",
  "Status definition",
  "3D layout machine positions",
  "Reject types",
];
const EXCLUDED = "Production history, tag values, reject data, uploaded photos and the layout image";

export default function SettingsBackup() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [backup, setBackup] = useState<Backup | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [check, setCheck] = useState<BackupCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      await downloadBackup(await backupApi.export());
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  function reset() {
    setFileName(null);
    setBackup(null);
    setParseErrors([]);
    setCheck(null);
    setRestoreError(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function readFile(file: File) {
    reset();
    setFileName(file.name);
    setChecking(true);
    try {
      const parsed = await parseBackupFile(file);
      setParseErrors(parsed.errors);
      if (parsed.backup) {
        setBackup(parsed.backup);
        setCheck(await backupApi.validate(parsed.backup));
      }
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : "Could not check the file");
    } finally {
      setChecking(false);
    }
  }

  async function handleRestore() {
    if (!backup) return;
    setRestoring(true);
    setRestoreError(null);
    try {
      await backupApi.restore(backup);
      setConfirming(false);
      reset();
      setToast("Settings restored from the backup");
    } catch (err) {
      setConfirming(false);
      setRestoreError(err instanceof Error ? err.message : "Restore failed");
    } finally {
      setRestoring(false);
    }
  }

  const errors = [...parseErrors, ...(check?.errors ?? [])];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Backup &amp; Restore</h2>
        <p className="text-sm text-slate-500">
          Export all system settings to one Excel file, or restore them from a backup.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-start gap-3">
            <DatabaseBackup size={22} className="mt-0.5 shrink-0 text-[#1E6FD9]" />
            <div>
              <h3 className="font-semibold text-slate-900">Export Settings</h3>
              <p className="text-sm text-slate-500">One Excel file with a sheet per section:</p>
            </div>
          </div>
          <ul className="list-disc space-y-0.5 pl-9 text-sm text-slate-700">
            {INCLUDED.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
          <p className="text-xs text-slate-500">Not included: {EXCLUDED}.</p>
          {exportError && <p className="text-sm text-red-600">{exportError}</p>}
          <button type="button" onClick={handleExport} disabled={exporting} className={buttonStyles.primary}>
            {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            Download Backup
          </button>
        </section>

        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-start gap-3">
            <RotateCcw size={22} className="mt-0.5 shrink-0 text-amber-600" />
            <div>
              <h3 className="font-semibold text-slate-900">Restore Settings</h3>
              <p className="text-sm text-slate-500">
                Replaces all current settings with the backup. Records are matched by machine No, SKU ID, shift name
                and reject type name; anything not in the backup is deleted. History is not touched.
              </p>
            </div>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={checking || restoring}
              className={buttonStyles.secondary}
            >
              <FileSpreadsheet size={16} />
              Choose Backup File
            </button>
            {fileName && (
              <>
                <span className="truncate text-sm font-medium text-slate-700">{fileName}</span>
                <button
                  type="button"
                  onClick={reset}
                  disabled={restoring}
                  className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
                  aria-label="Clear file"
                >
                  <X size={16} />
                </button>
              </>
            )}
          </div>
        </section>
      </div>

      {(checking || errors.length > 0 || check || restoreError) && (
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="font-semibold text-slate-900">Backup Check</h3>

          {checking ? (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 size={16} className="animate-spin" /> Reading and checking the backup...
            </p>
          ) : errors.length > 0 ? (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
              <XCircle size={18} className="mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="font-medium">Cannot restore: fix these problems in the file and choose it again.</p>
                <ul className="list-disc space-y-0.5 pl-5">
                  {errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : check?.valid ? (
            <div className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
              <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
              <p>
                The backup is valid
                {backup?.exportedAt ? ` (exported ${new Date(backup.exportedAt).toLocaleString("en-GB")})` : ""}. Review
                the changes below, then restore.
              </p>
            </div>
          ) : null}

          {restoreError && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
              <XCircle size={18} className="mt-0.5 shrink-0" />
              <p>{restoreError}</p>
            </div>
          )}

          {check && check.warnings.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <ul className="list-disc space-y-0.5 pl-5">
                {check.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {check && (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Section</th>
                    <th className="px-3 py-2 text-right font-medium">In backup</th>
                    <th className="px-3 py-2 text-right font-medium">Add</th>
                    <th className="px-3 py-2 text-right font-medium">Update</th>
                    <th className="px-3 py-2 text-right font-medium">Delete</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {check.summary.map((s) => (
                    <tr key={s.section}>
                      <td className="px-3 py-2 font-medium text-slate-900">{s.section}</td>
                      <td className="px-3 py-2 text-right text-slate-700 tabular-nums">{s.inBackup}</td>
                      <td className="px-3 py-2 text-right text-emerald-700 tabular-nums">{s.add || ""}</td>
                      <td className="px-3 py-2 text-right text-slate-700 tabular-nums">{s.update || ""}</td>
                      <td className="px-3 py-2 text-right text-red-600 tabular-nums">{s.remove || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {check?.valid && (
            <div className="flex justify-end">
              <button type="button" onClick={() => setConfirming(true)} className={buttonStyles.danger}>
                <RotateCcw size={16} />
                Restore Settings
              </button>
            </div>
          )}
        </section>
      )}

      {confirming && (
        <Modal
          size="sm"
          title="Restore Settings"
          onClose={() => !restoring && setConfirming(false)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={restoring}
                className={buttonStyles.secondary}
              >
                Cancel
              </button>
              <button type="button" onClick={handleRestore} disabled={restoring} className={buttonStyles.danger}>
                {restoring && <Loader2 size={16} className="animate-spin" />}
                Restore
              </button>
            </>
          }
        >
          <p className="text-sm text-slate-600">
            All machines, tags, SKUs, shifts, the status definition, layout positions and reject types are replaced by
            the backup <strong className="text-slate-900">{fileName}</strong>. Records not in the backup are deleted.
            Download a backup of the current settings first if you may need them. Continue?
          </p>
        </Modal>
      )}

      {toast && (
        <div
          role="status"
          className="fixed right-4 bottom-4 z-50 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

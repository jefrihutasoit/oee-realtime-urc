"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Database, Download, Eraser, FileArchive, Loader2, RefreshCw, RotateCcw, Upload } from "lucide-react";
import Modal, { buttonStyles } from "@/components/ui/Modal";
import { databaseApi, type ClearPreview, type DatabaseStats } from "@/lib/database-api";
import { todayYmd } from "@/lib/reject-sheet";

const fmt = new Intl.NumberFormat("en-US");
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function size(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

type Notice = { text: string; ok: boolean } | null;

function NoticeBox({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <p className={`rounded-lg px-3 py-2 text-sm ${notice.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
      {notice.text}
    </p>
  );
}

function Card({ icon, title, sub, children }: { icon: React.ReactNode; title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">{icon}</span>
        <div>
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <p className="text-sm text-slate-500">{sub}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/** Asks the user to type a word before a destructive action runs. */
function ConfirmModal({
  title,
  word,
  children,
  busy,
  onConfirm,
  onClose,
}: {
  title: string;
  word: string;
  children: React.ReactNode;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  return (
    <Modal
      size="sm"
      title={title}
      onClose={() => !busy && onClose()}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={buttonStyles.secondary}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={busy || typed !== word} className={buttonStyles.danger}>
            {busy && <Loader2 size={16} className="animate-spin" />}
            {title}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-slate-600">
        {children}
        <label className="block space-y-1.5 font-medium text-slate-700">
          Type <code className="rounded bg-slate-100 px-1 text-red-600">{word}</code> to confirm
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoFocus
            className="h-10 w-full rounded-lg border border-slate-200 px-3 font-mono text-sm focus:border-red-400 focus:outline-none"
          />
        </label>
      </div>
    </Modal>
  );
}

export default function DatabaseMaintenance() {
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"backup" | "restore" | "clear" | "preview" | "init" | null>(null);
  const [backupNotice, setBackupNotice] = useState<Notice>(null);
  const [restoreNotice, setRestoreNotice] = useState<Notice>(null);
  const [clearNotice, setClearNotice] = useState<Notice>(null);
  const [initNotice, setInitNotice] = useState<Notice>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [confirm, setConfirm] = useState<"restore" | "clear" | "init" | null>(null);
  const [from, setFrom] = useState(todayYmd());
  const [to, setTo] = useState(todayYmd());
  const [preview, setPreview] = useState<ClearPreview | null>(null);
  const [keepUsers, setKeepUsers] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadStats = useCallback(() => {
    databaseApi
      .stats()
      .then((s) => {
        setStats(s);
        setStatsError(null);
      })
      .catch((err: Error) => setStatsError(err.message));
  }, []);

  useEffect(loadStats, [loadStats]);

  const message = (err: unknown) => (err instanceof Error ? err.message : "Failed");

  async function backup() {
    setBusy("backup");
    setBackupNotice(null);
    try {
      const name = await databaseApi.backup();
      setBackupNotice({ text: `Saved ${name}`, ok: true });
    } catch (err) {
      setBackupNotice({ text: message(err), ok: false });
    } finally {
      setBusy(null);
    }
  }

  async function restore() {
    if (!restoreFile) return;
    setBusy("restore");
    setRestoreNotice(null);
    try {
      const result = await databaseApi.restore(restoreFile);
      const rows = Object.values(result.tables).reduce((s, n) => s + n, 0);
      setRestoreNotice({
        text: `Database restored: ${fmt.format(rows)} rows${result.exportedAt ? ` from the backup of ${dateTimeFmt.format(new Date(result.exportedAt))}` : ""}.`,
        ok: true,
      });
      setRestoreFile(null);
      if (fileInput.current) fileInput.current.value = "";
      loadStats();
    } catch (err) {
      setRestoreNotice({ text: message(err), ok: false });
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  }

  async function loadPreview() {
    setBusy("preview");
    setClearNotice(null);
    try {
      setPreview(await databaseApi.previewClear(from, to));
    } catch (err) {
      setPreview(null);
      setClearNotice({ text: message(err), ok: false });
    } finally {
      setBusy(null);
    }
  }

  async function clear() {
    setBusy("clear");
    try {
      const result = await databaseApi.clear(from, to);
      const rows = Object.values(result.deleted).reduce((s, n) => s + n, 0);
      setClearNotice({ text: `${fmt.format(rows)} rows deleted from ${from} to ${to}.`, ok: true });
      setPreview(null);
      loadStats();
    } catch (err) {
      setClearNotice({ text: message(err), ok: false });
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  }

  async function initialize() {
    setBusy("init");
    try {
      await databaseApi.initialize(keepUsers);
      setInitNotice({ text: "Database initialized.", ok: true });
      loadStats();
    } catch (err) {
      setInitNotice({ text: message(err), ok: false });
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  }

  const previewTotal = preview?.items.reduce((s, i) => s + i.rows, 0) ?? 0;
  const totalRows = stats?.tables.reduce((s, t) => s + t.rows, 0) ?? 0;
  const totalBytes = stats?.tables.reduce((s, t) => s + t.bytes, 0) ?? 0;
  const inputCls = "h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-blue-400 focus:outline-none";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Database</h2>
        <p className="text-sm text-slate-500">
          Backup and restore of the whole database, clearing history by date, and initializing. Engineering only.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <Card icon={<Download size={18} />} title="Backup Database" sub="Every table: settings, users, history, reject and downtime data.">
            <p className="text-xs text-slate-500">
              Saved as a compressed <code>.jsonl.gz</code> file. Uploaded photos and the layout image are not in it.
            </p>
            <NoticeBox notice={backupNotice} />
            <button type="button" onClick={backup} disabled={busy !== null} className={buttonStyles.primary}>
              {busy === "backup" ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              Download Backup
            </button>
          </Card>

          <Card icon={<Upload size={18} />} title="Restore Database" sub="Replaces everything in the database with a backup file.">
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <p>
                All current data is replaced, in one step: if the file is damaged nothing changes. The backup must come from
                the same backend version{stats?.schemaVersion ? ` (${stats.schemaVersion})` : ""}. Users not in the backup are
                signed out.
              </p>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept=".gz,application/gzip"
              onChange={(e) => {
                setRestoreFile(e.target.files?.[0] ?? null);
                setRestoreNotice(null);
              }}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
            />
            <NoticeBox notice={restoreNotice} />
            <button
              type="button"
              onClick={() => setConfirm("restore")}
              disabled={!restoreFile || busy !== null}
              className={buttonStyles.danger}
            >
              {busy === "restore" ? <Loader2 size={16} className="animate-spin" /> : <FileArchive size={16} />}
              Restore from file
            </button>
          </Card>

          <Card icon={<Eraser size={18} />} title="Clear Data by Date" sub="Deletes the history in the date range; settings and master data stay.">
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs text-slate-500">
                From
                <input
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setPreview(null);
                  }}
                  className={`${inputCls} mt-1 block`}
                />
              </label>
              <label className="text-xs text-slate-500">
                To
                <input
                  type="date"
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value);
                    setPreview(null);
                  }}
                  className={`${inputCls} mt-1 block`}
                />
              </label>
              <button type="button" onClick={loadPreview} disabled={!from || !to || busy !== null} className={buttonStyles.secondary}>
                {busy === "preview" ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                Preview
              </button>
            </div>
            {preview && (
              <div className="rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {preview.items.map((i) => (
                      <tr key={i.table}>
                        <td className="px-3 py-1.5 text-slate-700">{i.label}</td>
                        <td className="px-3 py-1.5 text-right font-medium text-slate-900 tabular-nums">{fmt.format(i.rows)}</td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50">
                      <td className="px-3 py-1.5 font-medium text-slate-700">Total rows to delete</td>
                      <td className="px-3 py-1.5 text-right font-semibold text-red-600 tabular-nums">{fmt.format(previewTotal)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            <NoticeBox notice={clearNotice} />
            <button
              type="button"
              onClick={() => setConfirm("clear")}
              disabled={!preview || previewTotal === 0 || busy !== null}
              className={buttonStyles.danger}
            >
              {busy === "clear" ? <Loader2 size={16} className="animate-spin" /> : <Eraser size={16} />}
              Delete data in range
            </button>
          </Card>

          <Card icon={<RotateCcw size={18} />} title="Initialize Database" sub="Empties the database like a new install: no machines, SKUs or history; default shifts and settings.">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={keepUsers} onChange={(e) => setKeepUsers(e.target.checked)} className="size-4 accent-[#1E6FD9]" />
              Keep user accounts and role permissions
            </label>
            {!keepUsers && (
              <p className="text-xs text-red-600">
                All users are deleted; only the Engineering account (from the backend settings) and admin / admin123 are
                created again, and everyone is signed out.
              </p>
            )}
            <p className="text-xs text-slate-500">Uploaded SKU photos and the layout image are deleted too. Download a backup first.</p>
            <NoticeBox notice={initNotice} />
            <button type="button" onClick={() => setConfirm("init")} disabled={busy !== null} className={buttonStyles.danger}>
              {busy === "init" ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
              Initialize
            </button>
          </Card>
        </div>

        <Card icon={<Database size={18} />} title="Current Database" sub={stats ? `${stats.database} · schema ${stats.schemaVersion ?? "—"}` : "Loading…"}>
          {statsError && <p className="text-sm text-red-600">{statsError}</p>}
          {stats && (
            <>
              <p className="text-sm text-slate-600">
                {fmt.format(totalRows)} rows · {size(totalBytes)}
                {stats.tagValues.oldest && (
                  <>
                    {" "}
                    · tag values {dateTimeFmt.format(new Date(stats.tagValues.oldest))} – {dateTimeFmt.format(new Date(stats.tagValues.newest!))}
                  </>
                )}
              </p>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Table</th>
                      <th className="px-3 py-2 text-right font-medium">Rows</th>
                      <th className="px-3 py-2 text-right font-medium">Size</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stats.tables.map((t) => (
                      <tr key={t.name}>
                        <td className="px-3 py-1.5 font-mono text-xs text-slate-700">{t.name}</td>
                        <td className="px-3 py-1.5 text-right text-slate-900 tabular-nums">{fmt.format(t.rows)}</td>
                        <td className="px-3 py-1.5 text-right text-slate-500 tabular-nums">{size(t.bytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={loadStats} className={buttonStyles.secondary}>
                <RefreshCw size={16} />
                Refresh
              </button>
            </>
          )}
        </Card>
      </div>

      {confirm === "restore" && (
        <ConfirmModal title="Restore" word="RESTORE" busy={busy === "restore"} onConfirm={restore} onClose={() => setConfirm(null)}>
          <p>
            Replace the whole database with <strong className="text-slate-900">{restoreFile?.name}</strong>? Current data that
            is not in the backup is lost.
          </p>
        </ConfirmModal>
      )}
      {confirm === "clear" && (
        <ConfirmModal title="Delete" word="DELETE" busy={busy === "clear"} onConfirm={clear} onClose={() => setConfirm(null)}>
          <p>
            Delete <strong className="text-slate-900">{fmt.format(previewTotal)} rows</strong> of history from {from} to {to}?
            This cannot be undone.
          </p>
        </ConfirmModal>
      )}
      {confirm === "init" && (
        <ConfirmModal title="Initialize" word="INITIALIZE" busy={busy === "init"} onConfirm={initialize} onClose={() => setConfirm(null)}>
          <p>
            Empty the database{keepUsers ? " (users are kept)" : " including all users"}? Machines, SKUs, settings and all
            history are deleted. This cannot be undone.
          </p>
        </ConfirmModal>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Database, Link2, Loader2, PlugZap, Save, XCircle } from "lucide-react";
import { buttonStyles } from "@/components/ui/Modal";
import { systemApi, type DbConfigInput, type DbConfigView, type DbTestResult } from "@/lib/system-api";
import type { SystemStatus } from "@/types/system";

const inputCls =
  "h-10 w-full rounded-lg border border-slate-200 bg-surface px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none";
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "medium" });

const toInput = (c: DbConfigView): DbConfigInput => ({
  host: c.host,
  port: c.port,
  user: c.user,
  password: null,
  database: c.database,
});

/** "mysql://user:pass@host:3306/db" → fields; null when it cannot be read. */
function parseConnectionString(text: string): Partial<DbConfigInput> | null {
  try {
    const url = new URL(text.trim());
    if (!/^(mysql|mariadb):$/.test(url.protocol)) return null;
    return {
      host: url.hostname,
      port: url.port ? Number(url.port) : 3306,
      user: decodeURIComponent(url.username),
      ...(url.password && { password: decodeURIComponent(url.password) }),
      database: decodeURIComponent(url.pathname.replace(/^\//, "")),
    };
  } catch {
    return null;
  }
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function Result({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div
      role="status"
      className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}
    >
      {ok ? <CheckCircle2 size={18} className="mt-0.5 shrink-0" /> : <XCircle size={18} className="mt-0.5 shrink-0" />}
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

/**
 * Database connection settings, saved on the server in a local file. Works while the database is down,
 * so wrong settings can always be corrected.
 */
export default function DatabaseConnection({ onStatus }: { onStatus?: (ready: boolean) => void }) {
  const [saved, setSaved] = useState<DbConfigView | null>(null);
  const [form, setForm] = useState<DbConfigInput | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [connString, setConnString] = useState("");
  const [connError, setConnError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"test" | "save" | null>(null);
  const [test, setTest] = useState<(DbTestResult & { key: string }) | null>(null);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshStatus = () =>
    systemApi
      .status()
      .then((s) => {
        setStatus(s);
        onStatus?.(s.database.ready);
      })
      .catch(() => {});

  useEffect(() => {
    systemApi
      .database()
      .then((c) => {
        setSaved(c);
        setForm(toInput(c));
      })
      .catch((err: Error) => setLoadError(err.message));
    refreshStatus();
    const timer = setInterval(refreshStatus, 10_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- poll once per mount
  }, []);

  if (!form || !saved) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
        {loadError ? <span className="text-red-600">{loadError}</span> : <><Loader2 size={16} className="animate-spin" /> Loading…</>}
      </div>
    );
  }

  const set = (patch: Partial<DbConfigInput>) => setForm((f) => f && { ...f, ...patch });
  const key = JSON.stringify(form);
  const shownTest = test?.key === key ? test : null;

  function fillFromConnectionString() {
    const parsed = parseConnectionString(connString);
    if (!parsed) return setConnError("Use the form mysql://user:password@host:3306/database");
    setConnError(null);
    set(parsed);
  }

  async function runTest() {
    setBusy("test");
    try {
      setTest({ ...(await systemApi.testDatabase(form!)), key });
    } catch (err) {
      setTest({ ok: false, message: err instanceof Error ? err.message : "Test failed", ms: 0, key });
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    const msg =
      "Save and connect with these settings?\n\nThe open OEE runs are reloaded from this database. " +
      "If it cannot connect, the system waits in setup mode until the settings are fixed.";
    if (!window.confirm(msg)) return;
    setBusy("save");
    setSaveResult(null);
    try {
      const r = await systemApi.saveDatabase(form!);
      setSaved(r.config);
      setForm(toInput(r.config));
      setSaveResult(
        r.connected
          ? { ok: true, text: "Saved and connected. The system is running on this database." }
          : { ok: false, text: `Saved, but it cannot connect: ${r.error}. Fix the settings and save again.` }
      );
      refreshStatus();
    } catch (err) {
      setSaveResult({ ok: false, text: err instanceof Error ? err.message : "Save failed" });
    } finally {
      setBusy(null);
    }
  }

  const ready = status?.database.ready;

  return (
    <div className="max-w-4xl space-y-4">
      <section className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-surface px-5 py-4">
        <span
          className={`flex size-10 items-center justify-center rounded-lg ${ready ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}
        >
          <Database size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">
            {status ? (ready ? "Connected" : "Not connected") : "Checking…"}
            <span className="ml-2 font-normal text-slate-500">
              {saved.user}@{saved.host}:{saved.port} / {saved.database}
            </span>
          </p>
          {status && !ready && <p className="text-sm text-red-600">{status.database.error}</p>}
          {status && (
            <p className="text-xs text-slate-500">
              {ready ? "Connected since" : "Down since"} {dateTimeFmt.format(new Date(status.database.since))}
              {!ready && " · retried automatically every 15 s"}
            </p>
          )}
        </div>
        <p className="text-xs text-slate-500">
          {saved.source === "env" ? "Using the .env values" : <>Saved in <code className="break-all">{saved.file}</code></>}
        </p>
      </section>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-surface px-5 py-4">
        <div>
          <h3 className="font-semibold text-slate-900">Connection settings</h3>
          <p className="text-sm text-slate-500">
            MySQL / MariaDB. The database is created on connect when it does not exist yet. XAMPP default: user
            <code className="mx-1">root</code> without a password.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="connString" className="block text-sm font-medium text-slate-700">
            Connection string (optional)
          </label>
          <div className="flex gap-2">
            <input
              id="connString"
              value={connString}
              onChange={(e) => setConnString(e.target.value)}
              placeholder="mysql://user:password@host:3306/database"
              spellCheck={false}
              autoComplete="off"
              className={`${inputCls} font-mono text-[13px]`}
            />
            <button type="button" onClick={fillFromConnectionString} disabled={!connString.trim()} className={buttonStyles.secondary}>
              <Link2 size={16} />
              Fill fields
            </button>
          </div>
          {connError && <p className="text-xs text-red-600">{connError}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
          <Field label="Host" htmlFor="dbHost" hint="IP or name of the database server, e.g. 127.0.0.1">
            <input id="dbHost" value={form.host} onChange={(e) => set({ host: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Port" htmlFor="dbPort">
            <input
              id="dbPort"
              type="number"
              min={1}
              max={65535}
              value={form.port}
              onChange={(e) => set({ port: Number(e.target.value) })}
              className={inputCls}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="User" htmlFor="dbUser">
            <input id="dbUser" value={form.user} onChange={(e) => set({ user: e.target.value })} autoComplete="off" className={inputCls} />
          </Field>
          <Field label="Password" htmlFor="dbPass" hint={saved.hasPassword ? "Leave empty to keep the saved password" : undefined}>
            <input
              id="dbPass"
              type="password"
              value={form.password ?? ""}
              onChange={(e) => set({ password: e.target.value })}
              placeholder={saved.hasPassword ? "•••••• (unchanged)" : "None"}
              autoComplete="new-password"
              className={inputCls}
            />
          </Field>
          <Field label="Database" htmlFor="dbName">
            <input id="dbName" value={form.database} onChange={(e) => set({ database: e.target.value })} className={inputCls} />
          </Field>
        </div>

        {shownTest && (
          <Result ok={shownTest.ok}>
            <p>{shownTest.message}</p>
            {shownTest.serverVersion && (
              <p className="text-xs opacity-80">
                Server version {shownTest.serverVersion} · {shownTest.ms} ms
              </p>
            )}
          </Result>
        )}
        {saveResult && <Result ok={saveResult.ok}>{saveResult.text}</Result>}

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={runTest} disabled={busy !== null} className={buttonStyles.secondary}>
            {busy === "test" ? <Loader2 size={16} className="animate-spin" /> : <PlugZap size={16} />}
            Test connection
          </button>
          <button type="button" onClick={save} disabled={busy !== null} className={buttonStyles.primary}>
            {busy === "save" ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save &amp; Connect
          </button>
        </div>
        <p className="text-xs text-slate-500">
          These settings belong to this server, so they are not part of the settings backup. If the database is
          unreachable, only an Engineering account can log in, and only this page and the system log work.
        </p>
      </section>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Download, Loader2, Power, RefreshCw } from "lucide-react";
import { buttonStyles } from "@/components/ui/Modal";
import { systemApi } from "@/lib/system-api";
import type { SystemEvent, SystemEventType, SystemInfo } from "@/types/system";

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "medium" });
const REFRESH_MS = 30_000;

const TYPE_STYLE: Record<SystemEventType, { label: string; cls: string }> = {
  SYSTEM_START: { label: "Start", cls: "bg-emerald-50 text-emerald-700" },
  SYSTEM_STOP: { label: "Stop", cls: "bg-slate-100 text-slate-600" },
  UNEXPECTED_SHUTDOWN: { label: "Unexpected shutdown", cls: "bg-red-50 text-red-700" },
  DB_CONNECTED: { label: "Database up", cls: "bg-emerald-50 text-emerald-700" },
  DB_UNAVAILABLE: { label: "Database down", cls: "bg-red-50 text-red-700" },
  DB_SETTINGS_CHANGED: { label: "DB settings", cls: "bg-blue-50 text-blue-700" },
  SETTINGS_RESTORED: { label: "Settings restored", cls: "bg-amber-50 text-amber-800" },
  DATABASE_RESTORED: { label: "Database restored", cls: "bg-amber-50 text-amber-800" },
};

const FILTERS: { label: string; types?: SystemEventType[] }[] = [
  { label: "All" },
  { label: "Start / stop", types: ["SYSTEM_START", "SYSTEM_STOP", "UNEXPECTED_SHUTDOWN"] },
  { label: "Unexpected shutdowns", types: ["UNEXPECTED_SHUTDOWN"] },
  { label: "Database", types: ["DB_CONNECTED", "DB_UNAVAILABLE", "DB_SETTINGS_CHANGED"] },
  { label: "Restores", types: ["SETTINGS_RESTORED", "DATABASE_RESTORED"] },
];

function duration(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return [d && `${d}d`, (d || h) && `${h}h`, `${m}m`].filter(Boolean).join(" ");
}

function Info({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-surface px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-semibold text-slate-900">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function toCsv(events: SystemEvent[]) {
  const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = events.map((e) => [e.at, e.type, e.message, e.detail ? JSON.stringify(e.detail) : ""].map(cell).join(","));
  return ["Time,Type,Message,Detail", ...rows].join("\r\n");
}

/** Start, stop and unexpected shutdowns (from the heartbeat), database up/down and restores. */
export default function SystemLog() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [events, setEvents] = useState<SystemEvent[] | null>(null);
  const [filter, setFilter] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(() => {
    const types = FILTERS[filter].types;
    return Promise.all([systemApi.info(), systemApi.log(500, types)])
      .then(([i, e]) => {
        setInfo(i);
        setEvents(e);
        setError(null);
        setNow(Date.now());
      })
      .catch((err: Error) => setError(err.message));
  }, [filter]);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  function download() {
    if (!events) return;
    const url = URL.createObjectURL(new Blob([toCsv(events)], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `system-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  const prev = info?.previousRun;

  return (
    <div className="space-y-4">
      {info && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Info
              label="Running since"
              value={dateTimeFmt.format(new Date(info.startedAt))}
              sub={`Up ${duration((now - Date.parse(info.startedAt)) / 1000)}`}
            />
            <Info
              label="Last heartbeat"
              value={info.lastHeartbeatAt ? dateTimeFmt.format(new Date(info.lastHeartbeatAt)) : "—"}
              sub={`Written every ${info.heartbeatSeconds} s`}
            />
            <Info
              label="Database"
              value={info.database.ready ? "Connected" : "Not connected"}
              sub={`Since ${dateTimeFmt.format(new Date(info.database.since))}`}
            />
            <Info
              label="Server"
              value={info.host}
              sub={`OS up ${duration(info.osUptimeSeconds)} · RAM free ${info.memoryFreeMb} / ${info.memoryTotalMb} MB`}
            />
          </div>

          {prev && (
            <div
              className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
                prev.clean ? "border-slate-200 bg-surface text-slate-600" : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {prev.clean ? <Power size={18} className="mt-0.5 shrink-0" /> : <AlertTriangle size={18} className="mt-0.5 shrink-0" />}
              <p>
                <span className="font-semibold">Previous run:</span> started {dateTimeFmt.format(new Date(prev.startedAt))}, last
                alive {dateTimeFmt.format(new Date(prev.lastAliveAt))} —{" "}
                {prev.clean
                  ? "stopped normally."
                  : "ended without a normal shutdown (power loss, crash, hardware failure or killed process)."}
              </p>
            </div>
          )}
        </>
      )}

      <section className="space-y-3 rounded-xl border border-slate-200 bg-surface px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-0.5 text-sm" role="tablist">
            {FILTERS.map((f, i) => (
              <button
                key={f.label}
                type="button"
                role="tab"
                aria-selected={filter === i}
                onClick={() => setFilter(i)}
                className={`rounded-md px-3 py-1.5 ${
                  filter === i ? "bg-surface font-medium text-(--brand) shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={load} className={buttonStyles.secondary}>
              <RefreshCw size={16} />
              Refresh
            </button>
            <button type="button" onClick={download} disabled={!events?.length} className={buttonStyles.secondary}>
              <Download size={16} />
              Download CSV
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="max-h-[520px] overflow-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Event</th>
                <th className="px-3 py-2 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!events ? (
                <tr>
                  <td colSpan={3} className="px-3 py-10 text-center text-slate-500">
                    <Loader2 size={18} className="mx-auto animate-spin" />
                  </td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-10 text-center text-slate-500">
                    No events.
                  </td>
                </tr>
              ) : (
                events.map((e, i) => {
                  const style = TYPE_STYLE[e.type] ?? { label: e.type, cls: "bg-slate-100 text-slate-600" };
                  return (
                    <tr key={`${e.at}-${i}`} className="align-top">
                      <td className="px-3 py-2 whitespace-nowrap text-slate-600 tabular-nums">{dateTimeFmt.format(new Date(e.at))}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap ${style.cls}`}>{style.label}</span>
                      </td>
                      <td className="px-3 py-2 text-slate-700">{e.message}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {info && <p className="text-xs text-slate-500">Stored on the server in {info.logFile}; also kept when the database is down.</p>}
      </section>
    </div>
  );
}

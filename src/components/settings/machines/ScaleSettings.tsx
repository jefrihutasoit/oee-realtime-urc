"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Loader2, PlugZap } from "lucide-react";
import { buttonStyles } from "@/components/ui/Modal";
import Toggle from "@/components/ui/Toggle";
import { YAMATO_FIELDS, YAMATO_GROUPS, scaleTagName } from "@/config/yamato";
import { machineApi } from "@/lib/machine-api";
import type { ScaleStatus, ScaleTestResult as TestResult } from "@/types/machine";
import ScaleTestResult from "./ScaleTestResult";

/** Form state of the machine's Yamato scale; the port stays text while typing. */
export interface ScaleForm {
  enabled: boolean;
  host: string;
  port: string;
  mcSide: string;
  fields: string[];
}

const inputCls =
  "h-10 w-full rounded-lg border border-slate-200 bg-surface px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none";
/** Groups of numbered entries, folded until opened. */
const FOLDED = new Set(["Histogram", "Allowable down time", "Down time"]);
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** Live connection state of a saved scale, refreshed every 2 s. */
function ConnectionState({ machineId }: { machineId: string }) {
  const [status, setStatus] = useState<ScaleStatus | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    const load = () =>
      machineApi
        .scaleStatus()
        .then((list) => alive && setStatus(list.find((s) => s.machineId === machineId) ?? null))
        .catch(() => alive && setStatus(null));
    load();
    const timer = setInterval(load, 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [machineId]);

  if (status === undefined) return null;
  if (status === null) return <p className="text-xs text-slate-500">Not polled yet: save to start the connection.</p>;
  const dot = status.state === "connected" ? "bg-emerald-500" : status.state === "error" ? "bg-red-500" : "bg-amber-400";
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
      <span className={`size-2 rounded-full ${dot}`} />
      <span className="font-medium capitalize">{status.state}</span>
      <span className="text-slate-400">{status.address}</span>
      {status.lastReadAt && <span className="text-slate-500">· last read {timeFmt.format(new Date(status.lastReadAt))}</span>}
      {status.lastError && <span className="w-full text-red-600">{status.lastError}</span>}
    </p>
  );
}

export default function ScaleSettings({
  value,
  onChange,
  machineNo,
  machineId,
}: {
  value: ScaleForm;
  onChange: (next: ScaleForm) => void;
  machineNo: string;
  /** Set when editing a saved machine, to show its connection state. */
  machineId?: string;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [test, setTest] = useState<{ running: boolean; result?: TestResult; error?: string; at?: Date } | null>(null);
  const runTest = async () => {
    const port = Number(value.port);
    if (!value.host.trim()) return setTest({ running: false, error: "Fill in the host first" });
    if (!(port >= 1 && port <= 65535)) return setTest({ running: false, error: "Port must be 1 to 65535" });
    setTest({ running: true });
    try {
      const result = await machineApi.scaleTest({ host: value.host.trim(), port, mcSide: value.mcSide });
      setTest({ running: false, result, at: new Date() });
    } catch (err) {
      setTest({ running: false, error: err instanceof Error ? err.message : "Connection test failed", at: new Date() });
    }
  };
  const set = <K extends keyof ScaleForm>(key: K, v: ScaleForm[K]) => onChange({ ...value, [key]: v });
  const chosen = new Set(value.fields);
  const setFields = (keys: string[], on: boolean) => {
    const next = new Set(chosen);
    keys.forEach((k) => (on ? next.add(k) : next.delete(k)));
    // Kept in catalog order.
    set("fields", YAMATO_FIELDS.filter((f) => next.has(f.key)).map((f) => f.key));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-slate-700">Yamato Dataweigh (TCP)</p>
          <p className="text-xs text-slate-500">
            Reads the scale&apos;s DS data every second; the ticked fields appear as realtime tags and in the trend.
          </p>
        </div>
        <Toggle label="Scale enabled" checked={value.enabled} onChange={(v) => set("enabled", v)} />
      </div>

      {value.enabled && (
        <>
          <div className="grid grid-cols-[1fr_110px_90px] gap-3">
            <label className="space-y-1.5">
              <span className="block text-sm font-medium text-slate-700">Host / IP</span>
              <input
                value={value.host}
                onChange={(e) => set("host", e.target.value)}
                placeholder="192.168.1.100"
                spellCheck={false}
                maxLength={100}
                className={`${inputCls} font-mono text-[13px]`}
              />
            </label>
            <label className="space-y-1.5">
              <span className="block text-sm font-medium text-slate-700">Port</span>
              <input
                value={value.port}
                onChange={(e) => set("port", e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                placeholder="10001"
                maxLength={5}
                className={`${inputCls} font-mono text-[13px]`}
              />
            </label>
            <label className="space-y-1.5">
              <span className="block text-sm font-medium text-slate-700">MC side</span>
              <select value={value.mcSide} onChange={(e) => set("mcSide", e.target.value)} className={inputCls}>
                <option value="1">1</option>
                <option value="2">2</option>
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={runTest} disabled={test?.running} className={buttonStyles.secondary}>
              {test?.running ? <Loader2 size={16} className="animate-spin" /> : <PlugZap size={16} />}
              Test connection
            </button>
            {test && !test.running && (
              <p className={`text-sm ${test.error ? "text-red-600" : "text-emerald-700"}`}>
                {test.error
                  ? test.error
                  : `Connected · DS read in ${test.result!.ms} ms${test.result!.source === "live" ? " (from the running connection)" : ""}`}
                {test.at && <span className="ml-1.5 text-xs text-slate-400">{timeFmt.format(test.at)}</span>}
              </p>
            )}
          </div>
          {machineId && <ConnectionState machineId={machineId} />}

          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">
              Data <span className="font-normal text-slate-500">· {chosen.size} of {YAMATO_FIELDS.length} ticked</span>
            </p>
            {YAMATO_GROUPS.map((group) => {
              const fields = YAMATO_FIELDS.filter((f) => f.group === group);
              const count = fields.filter((f) => chosen.has(f.key)).length;
              const folded = FOLDED.has(group) && !open.has(group);
              return (
                <div key={group} className="rounded-lg border border-slate-200">
                  <div className="flex items-center gap-2 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={count === fields.length}
                      ref={(el) => {
                        if (el) el.indeterminate = count > 0 && count < fields.length;
                      }}
                      onChange={(e) => setFields(fields.map((f) => f.key), e.target.checked)}
                      aria-label={`All ${group}`}
                      className="size-4 accent-(--brand)"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        FOLDED.has(group) &&
                        setOpen((s) => {
                          const next = new Set(s);
                          if (next.has(group)) next.delete(group);
                          else next.add(group);
                          return next;
                        })
                      }
                      className={`flex flex-1 items-center justify-between text-left text-sm font-medium text-slate-700 ${
                        FOLDED.has(group) ? "" : "cursor-default"
                      }`}
                    >
                      <span>
                        {group} <span className="font-normal text-slate-400">{count}/{fields.length}</span>
                      </span>
                      {FOLDED.has(group) && (
                        <ChevronDown size={16} className={`text-slate-400 transition-transform ${folded ? "" : "rotate-180"}`} />
                      )}
                    </button>
                  </div>
                  {!folded && (
                    <div className="grid grid-cols-1 gap-x-4 gap-y-1 border-t border-slate-100 px-3 py-2 sm:grid-cols-2 lg:grid-cols-3">
                      {fields.map((f) => (
                        <label
                          key={f.key}
                          className="flex cursor-pointer items-center gap-2 py-0.5 text-sm text-slate-700"
                          title={scaleTagName(machineNo || "<No>", f.key)}
                        >
                          <input
                            type="checkbox"
                            checked={chosen.has(f.key)}
                            onChange={(e) => setFields([f.key], e.target.checked)}
                            className="size-4 accent-(--brand)"
                          />
                          {f.label}
                          {f.unit && <span className="text-xs text-slate-400">{f.unit}</span>}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <p className="text-xs text-slate-500">
              Tag names: <code className="rounded bg-slate-100 px-1">{scaleTagName(machineNo || "<No>", "<FIELD>")}</code>.
              Changing the Machine No starts new tag names (older history stays under the old ones).
            </p>
          </div>

          {test?.result && (
            <div className="border-t border-slate-100 pt-4">
              <ScaleTestResult result={test.result} chosen={chosen} onTick={(key, on) => setFields([key], on)} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

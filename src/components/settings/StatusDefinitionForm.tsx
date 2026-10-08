"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { buttonStyles } from "@/components/ui/Modal";
import { statusStyles } from "@/config/oee";
import { settingsApi } from "@/lib/settings-api";
import type { MachineStatus } from "@/types/oee";
import type { StatusDefinition } from "@/types/settings";

type Lists = Record<"run" | "stop" | "off", string>;

const rows: { key: keyof Lists; status: MachineStatus; hint: string }[] = [
  { key: "run", status: "RUN", hint: "Machine is producing." },
  { key: "stop", status: "STOP", hint: "Machine is on but not producing (counts as downtime)." },
  { key: "off", status: "OFF", hint: "Machine is switched off. Optional." },
];

const inputCls =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none aria-invalid:border-red-400";

/** "1, 2 3" → [1, 2, 3]; null when any token is not a number. */
function parseList(text: string): number[] | null {
  const tokens = text.split(/[\s,;]+/).filter(Boolean);
  const values = tokens.map(Number);
  return values.every(Number.isFinite) ? values : null;
}

const toText = (values: number[]) => values.join(", ");

function resolve(value: number, def: StatusDefinition): MachineStatus {
  if (def.run.includes(value)) return "RUN";
  if (def.stop.includes(value)) return "STOP";
  if (def.off.includes(value)) return "OFF";
  return def.unmatched;
}

export default function StatusDefinitionForm() {
  const [lists, setLists] = useState<Lists | null>(null);
  const [unmatched, setUnmatched] = useState<MachineStatus>("OFF");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [testValue, setTestValue] = useState("");

  function apply(def: StatusDefinition) {
    setLists({ run: toText(def.run), stop: toText(def.stop), off: toText(def.off) });
    setUnmatched(def.unmatched);
  }

  function load() {
    settingsApi
      .getStatusDefinition()
      .then((def) => {
        apply(def);
        setLoadError(null);
      })
      .catch((err: Error) => setLoadError(err.message));
  }

  useEffect(load, []);

  if (!lists) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-sm text-slate-500">
        {loadError ? (
          <>
            <p className="text-red-600">{loadError}</p>
            <button type="button" onClick={load} className="font-medium text-[#1E6FD9] hover:underline">
              Retry
            </button>
          </>
        ) : (
          <>
            <Loader2 size={22} className="animate-spin" />
            Loading…
          </>
        )}
      </div>
    );
  }

  const parsed = { run: parseList(lists.run), stop: parseList(lists.stop), off: parseList(lists.off) };
  const draft: StatusDefinition | null =
    parsed.run && parsed.stop && parsed.off ? { run: parsed.run, stop: parsed.stop, off: parsed.off, unmatched } : null;

  // Values listed under more than one status.
  const seen = new Map<number, MachineStatus>();
  const overlaps: string[] = [];
  for (const r of rows) {
    for (const v of parsed[r.key] ?? []) {
      const other = seen.get(v);
      if (other && other !== r.status) overlaps.push(`${v} (${other} & ${r.status})`);
      seen.set(v, r.status);
    }
  }

  const testNumber = testValue.trim() === "" ? null : Number(testValue);
  const testResult = draft && testNumber !== null && Number.isFinite(testNumber) ? resolve(testNumber, draft) : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!draft) return setMessage({ text: "Values must be numbers separated by commas", tone: "error" });
    if (!draft.run.length || !draft.stop.length) {
      return setMessage({ text: "RUN and STOP need at least one value", tone: "error" });
    }
    if (overlaps.length) return setMessage({ text: `Value used twice: ${overlaps.join(", ")}`, tone: "error" });

    setSaving(true);
    try {
      apply(await settingsApi.saveStatusDefinition(draft));
      setMessage({ text: "Status definition saved. Applied from the next gateway poll.", tone: "ok" });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Failed to save", tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-4">
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {rows.map((r) => {
          const s = statusStyles[r.status];
          const invalid = parsed[r.key] === null;
          return (
            <div key={r.key} className="grid grid-cols-1 gap-2 px-5 py-4 sm:grid-cols-[180px_1fr] sm:gap-6">
              <div>
                <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-sm font-medium ${s.pill}`}>
                  <span className={`size-2 rounded-full ${s.dot}`} />
                  {s.label}
                </span>
                <p className="mt-1 text-xs text-slate-500">{r.hint}</p>
              </div>
              <div>
                <label htmlFor={`values-${r.key}`} className="sr-only">
                  {s.label} values
                </label>
                <input
                  id={`values-${r.key}`}
                  value={lists[r.key]}
                  onChange={(e) => setLists({ ...lists, [r.key]: e.target.value })}
                  placeholder={r.key === "off" ? "e.g. 3" : r.key === "run" ? "e.g. 1" : "e.g. 0, 2"}
                  aria-invalid={invalid || undefined}
                  spellCheck={false}
                  autoComplete="off"
                  className={inputCls}
                />
                <p className={`mt-1 text-xs ${invalid ? "text-red-600" : "text-slate-500"}`}>
                  {invalid ? "Use numbers only, separated by commas." : "Status tag values, separated by commas."}
                </p>
              </div>
            </div>
          );
        })}

        <div className="grid grid-cols-1 gap-2 px-5 py-4 sm:grid-cols-[180px_1fr] sm:gap-6">
          <div>
            <p className="text-sm font-medium text-slate-700">Other values</p>
            <p className="mt-1 text-xs text-slate-500">Value not listed above.</p>
          </div>
          <div>
            <select
              aria-label="Status for values not listed"
              value={unmatched}
              onChange={(e) => setUnmatched(e.target.value as MachineStatus)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-blue-400 focus:outline-none sm:w-48"
            >
              <option value="RUN">Treat as Run</option>
              <option value="STOP">Treat as Stop</option>
              <option value="OFF">Treat as Off</option>
            </select>
            <p className="mt-1 text-xs text-slate-500">A status tag that cannot be read from the gateway is always Off.</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3">
        <label htmlFor="test-value" className="text-sm font-medium text-slate-700">
          Test a value
        </label>
        <input
          id="test-value"
          type="number"
          value={testValue}
          onChange={(e) => setTestValue(e.target.value)}
          placeholder="e.g. 2"
          className="h-9 w-28 rounded-lg border border-slate-200 px-3 font-mono text-sm focus:border-blue-400 focus:outline-none"
        />
        {testResult && (
          <span className="text-sm text-slate-600">
            →{" "}
            <span
              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-medium ${statusStyles[testResult].pill}`}
            >
              <span className={`size-2 rounded-full ${statusStyles[testResult].dot}`} />
              {statusStyles[testResult].label}
            </span>
          </span>
        )}
      </div>

      {message && (
        <p
          role="status"
          className={`rounded-lg px-3 py-2 text-sm ${
            message.tone === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </p>
      )}

      <div className="flex justify-end">
        <button type="submit" disabled={saving} className={buttonStyles.primary}>
          {saving && <Loader2 size={16} className="animate-spin" />}
          Save
        </button>
      </div>
    </form>
  );
}

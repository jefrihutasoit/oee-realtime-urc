"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { buttonStyles } from "@/components/ui/Modal";
import Toggle from "@/components/ui/Toggle";
import { FINISH_SKU_OPTIONS, FINISH_STATUS_OPTIONS } from "@/lib/finish-rules";
import { applyMachineLabel } from "@/lib/machine-label";
import { settingsApi } from "@/lib/settings-api";
import type { FinishRule, OeeSettings } from "@/types/settings";

const MAX_RULES = 10;
const fieldCls =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-blue-400 focus:outline-none";

/** Radio group shown as selectable cards. */
function ChoiceGroup<T extends string>({ name, value, onChange, options }: {
  name: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; hint: string }[];
}) {
  return (
    <div className={`grid grid-cols-1 gap-2 ${options.length > 2 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
      {options.map((o) => (
        <label
          key={o.value}
          className={`flex cursor-pointer gap-2.5 rounded-lg border px-3 py-2.5 ${
            value === o.value ? "border-[#1E6FD9] bg-blue-50/60" : "border-slate-200 hover:border-slate-300"
          }`}
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="mt-0.5 accent-[#1E6FD9]"
          />
          <span>
            <span className="block text-sm font-medium text-slate-800">{o.label}</span>
            <span className="block text-xs text-slate-500">{o.hint}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

function ToggleRow({ label, hint, checked, onChange }: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <div>
        <p className="text-sm font-medium text-slate-700">{label}</p>
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      </div>
      <Toggle label={label} checked={checked} onChange={onChange} />
    </div>
  );
}

/** Global OEE calculation settings for every machine with OEE enabled. */
export default function OeeSettingsForm() {
  const [settings, setSettings] = useState<OeeSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);

  function load() {
    settingsApi
      .getOeeSettings()
      .then((s) => {
        setSettings(s);
        setLoadError(null);
      })
      .catch((err: Error) => setLoadError(err.message));
  }

  useEffect(load, []);

  if (!settings) {
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
          <Loader2 size={22} className="animate-spin" />
        )}
      </div>
    );
  }

  const set = <K extends keyof OeeSettings>(key: K, value: OeeSettings[K]) => setSettings({ ...settings, [key]: value });
  const setRules = (update: (list: FinishRule[]) => FinishRule[]) => set("finishRules", update(settings.finishRules));
  const updateRule = (index: number, patch: Partial<FinishRule>) =>
    setRules((list) => list.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!settings) return;
    if (settings.machineLabelEnabled && !settings.machineLabel.trim()) {
      return setMessage({ text: "Enter the name to use instead of Machine", tone: "error" });
    }
    if (settings.finishRules.some((r) => r.sku === "any" && r.status === "ANY")) {
      return setMessage({ text: "Each finish rule needs a SKU or a machine status condition", tone: "error" });
    }
    setSaving(true);
    try {
      const saved = await settingsApi.saveOeeSettings(settings);
      setSettings(saved);
      applyMachineLabel(saved);
      setMessage({
        text: "OEE settings saved. Applied to every machine from the next gateway poll; changes other than finish rules, reject source and machine name start a new OEE run.",
        tone: "ok",
      });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Failed to save", tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-4">
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white px-5 py-4">
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-slate-700">Start counting</p>
          <ChoiceGroup
            name="startMode"
            value={settings.startMode}
            onChange={(v) => set("startMode", v)}
            options={[
              {
                value: "sku",
                label: "When a registered SKU runs",
                hint: "Product tag must hold a SKU ID from SKU Management.",
              },
              { value: "always", label: "Always", hint: "Counts without a SKU; unknown SKUs use the default ideal rate." },
            ]}
          />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-slate-700">Output & reject tags</p>
          <ChoiceGroup
            name="counterMode"
            value={settings.counterMode}
            onChange={(v) => set("counterMode", v)}
            options={[
              {
                value: "cumulative",
                label: "Cumulative counter",
                hint: "Tag keeps increasing; OEE counts the increase since the run started.",
              },
              { value: "direct", label: "Direct total", hint: "Tag value is the total as pushed (the PLC resets it)." },
            ]}
          />
        </div>
      </div>

      <div className="space-y-1.5 rounded-xl border border-slate-200 bg-white px-5 py-4">
        <p className="text-sm font-medium text-slate-700">Reject counted in Quality</p>
        <ChoiceGroup
          name="rejectSource"
          value={settings.rejectSource}
          onChange={(v) => set("rejectSource", v)}
          options={[
            {
              value: "both",
              label: "Reject tag + Reject Input",
              hint: "PLC reject counter plus the uploaded / manual reject of the shift and SKU.",
            },
            { value: "tag", label: "Reject tag only", hint: "Only the machine's reject counter." },
            {
              value: "input",
              label: "Reject Input only",
              hint: "Only the uploaded / manual reject of the shift and SKU.",
            },
          ]}
        />
      </div>

      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        <ToggleRow
          label="Custom machine name"
          hint='Show the OEE machines as "Bagger" or another name instead of "Machine" on every dashboard. Display only; OEE keeps running.'
          checked={settings.machineLabelEnabled}
          onChange={(v) => set("machineLabelEnabled", v)}
        />
        {settings.machineLabelEnabled && (
          <div className="flex flex-wrap items-center gap-3 px-5 py-3">
            {(["Bagger", "Custom"] as const).map((choice) => {
              const custom = choice === "Custom";
              const selected = custom ? settings.machineLabel !== "Bagger" : settings.machineLabel === "Bagger";
              return (
                <label key={choice} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="machineLabel"
                    checked={selected}
                    onChange={() => set("machineLabel", custom ? "" : "Bagger")}
                    className="accent-[#1E6FD9]"
                  />
                  {choice}
                </label>
              );
            })}
            {settings.machineLabel !== "Bagger" && (
              <input
                value={settings.machineLabel}
                onChange={(e) => set("machineLabel", e.target.value)}
                maxLength={30}
                placeholder="e.g. Packer"
                aria-label="Custom machine name"
                className="h-9 w-48 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-blue-400 focus:outline-none"
              />
            )}
            <span className="text-xs text-slate-500">
              Preview: &quot;{settings.machineLabel.trim() || "…"} 1A&quot;, &quot;All {settings.machineLabel.trim() || "…"}s&quot;
            </span>
          </div>
        )}
      </div>

      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        <ToggleRow
          label="Restart OEE when SKU changes"
          hint="A new SKU starts a fresh run. Only checked while the machine is not Off."
          checked={settings.resetOnSkuChange}
          onChange={(v) => set("resetOnSkuChange", v)}
        />
        <ToggleRow
          label="Pause while machine is Off"
          hint="Off time is not counted. When disabled, Off counts as downtime in Availability."
          checked={settings.pauseWhenOff}
          onChange={(v) => set("pauseWhenOff", v)}
        />
        <ToggleRow
          label="Off during a running OEE is Breakdown"
          hint="Once the run has run and until it finishes, Off shows as Breakdown and counts as downtime, even while Off is paused. Before the first Run and after a finish, Off follows the pause setting."
          checked={settings.breakdownWhenOff}
          onChange={(v) => set("breakdownWhenOff", v)}
        />
      </div>

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white px-5 py-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-slate-700">Finish OEE run when</p>
            <p className="mt-1 text-xs text-slate-500">
              The run finishes when any rule holds: the SKU and the machine status together, for the hold time. Its
              figures stay until a new run starts: SKU valid again, machine not Off and no rule holding. The end of a
              shift also starts a new run.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRules((list) => [...list, { sku: "notInMaster", status: "OFF", holdSeconds: 0 }])}
            disabled={settings.finishRules.length >= MAX_RULES}
            className={buttonStyles.secondary}
          >
            <Plus size={16} />
            Add Rule
          </button>
        </div>

        {settings.finishRules.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 py-4 text-center text-sm text-slate-500">
            No finish rules: a run only ends at shift end{settings.resetOnSkuChange ? " or on a SKU change" : ""}.
          </p>
        ) : (
          settings.finishRules.map((rule, i) => (
            <div
              key={i}
              className="grid grid-cols-1 items-center gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-[1fr_auto_1fr_auto_auto_36px]"
            >
              <select
                value={rule.sku}
                onChange={(e) => updateRule(i, { sku: e.target.value as FinishRule["sku"] })}
                aria-label={`Rule ${i + 1} SKU condition`}
                title={FINISH_SKU_OPTIONS.find((o) => o.value === rule.sku)?.hint}
                className={fieldCls}
              >
                {FINISH_SKU_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <span className="text-center text-xs font-medium text-slate-500">AND</span>
              <select
                value={rule.status}
                onChange={(e) => updateRule(i, { status: e.target.value as FinishRule["status"] })}
                aria-label={`Rule ${i + 1} machine status`}
                className={fieldCls}
              >
                {FINISH_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.value === "ANY" ? o.label : `Machine ${o.label}`}
                  </option>
                ))}
              </select>
              <span className="text-xs text-slate-500">for</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  max={86400}
                  step={1}
                  value={rule.holdSeconds}
                  onChange={(e) =>
                    updateRule(i, { holdSeconds: Math.max(0, Math.min(86400, Math.floor(Number(e.target.value) || 0))) })
                  }
                  aria-label={`Rule ${i + 1} hold time in seconds`}
                  className={`${fieldCls} w-24 text-right`}
                />
                <span className="text-xs text-slate-500">sec</span>
              </div>
              <button
                type="button"
                onClick={() => setRules((list) => list.filter((_, j) => j !== i))}
                className="rounded-md p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"
                aria-label={`Remove rule ${i + 1}`}
              >
                <X size={16} />
              </button>
            </div>
          ))
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

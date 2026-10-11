"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import Modal, { buttonStyles } from "@/components/ui/Modal";
import type { MachineBulkInput } from "@/lib/machine-api";
import { REALTIME_MODES, TtlSelect, ttlLabel } from "@/lib/realtime-mode";
import type { MachineRegistration, RealtimeMode } from "@/types/machine";
import MachineScopePicker, { scopeIds, type MachineScope } from "./MachineScopePicker";

const inputCls =
  "h-10 w-full rounded-lg border border-slate-200 bg-surface px-3 text-sm text-slate-800 focus:border-blue-400 focus:outline-none";

/** Sets the realtime tag mode (and adaptive expiry) on all machines or the chosen ones. */
export default function MachineRealtimeModal({
  machines,
  topicExample,
  onClose,
  onSubmit,
}: {
  machines: MachineRegistration[];
  /** e.g. "urc/oee/1A", from the gateway settings; null when unknown. */
  topicExample: string | null;
  onClose: () => void;
  onSubmit: (input: MachineBulkInput) => Promise<void>;
}) {
  const [mode, setMode] = useState<RealtimeMode>("adaptive");
  const [ttl, setTtl] = useState(480);
  const [scope, setScope] = useState<MachineScope>({ kind: "all" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const machineIds = scopeIds(scope);
    if (!machineIds) return setError("Choose at least one machine");
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ machineIds, realtimeMode: mode, ...(mode === "adaptive" && { adaptiveTtlMinutes: ttl }) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply");
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Realtime Tags"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={buttonStyles.secondary}>
            Cancel
          </button>
          <button type="submit" form="realtime-form" disabled={saving} className={buttonStyles.primary}>
            {saving && <Loader2 size={16} className="animate-spin" />}
            Apply
          </button>
        </>
      }
    >
      <form id="realtime-form" onSubmit={handleSubmit} className="space-y-5">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="space-y-2">
          {REALTIME_MODES.map((m) => (
            <label
              key={m.value}
              className={`flex cursor-pointer items-start gap-2 rounded-lg border-2 p-3 text-sm ${
                mode === m.value ? "border-(--brand)" : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <input
                type="radio"
                name="mode"
                checked={mode === m.value}
                onChange={() => setMode(m.value)}
                className="mt-0.5 size-4 accent-(--brand)"
              />
              <span>
                <span className="font-medium text-slate-800">{m.label}</span>
                <span className="block text-xs text-slate-500">{m.hint}</span>
              </span>
            </label>
          ))}
        </div>

        {mode === "adaptive" && (
          <div className="space-y-2 rounded-lg bg-slate-50 p-3">
            <label htmlFor="bulkTtl" className="block text-sm font-medium text-slate-700">
              Remove a tag when not published for
            </label>
            <TtlSelect id="bulkTtl" value={ttl} onChange={setTtl} className={inputCls} />
            <p className="text-xs text-slate-500">
              One topic per machine{topicExample && <>, e.g. <code>{topicExample}</code></>}, with the usual{" "}
              <code>{'{"values": {...}}'}</code> message. Every tag other than status, output, reject and product is shown;
              add a unit after a comma in the tag name, e.g. <code>{'"12Temp Limit,C": 45'}</code>.
            </p>
          </div>
        )}

        <MachineScopePicker
          machines={machines}
          scope={scope}
          onChange={setScope}
          describe={(m) => (m.realtimeMode === "adaptive" ? `Adaptive · ${ttlLabel(m.adaptiveTtlMinutes)}` : "Registered")}
        />
      </form>
    </Modal>
  );
}

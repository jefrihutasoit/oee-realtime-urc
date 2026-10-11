"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import Modal, { buttonStyles } from "@/components/ui/Modal";
import type { MachineBulkInput } from "@/lib/machine-api";
import type { MachineRegistration } from "@/types/machine";
import MachineScopePicker, { scopeIds, type MachineScope } from "./MachineScopePicker";

interface MachineUnitsModalProps {
  machines: MachineRegistration[];
  onClose: () => void;
  onSubmit: (input: MachineBulkInput) => Promise<void>;
}

const inputCls =
  "h-10 w-full rounded-lg border border-slate-200 bg-surface px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400";

/** Applies an output and/or reject unit to all machines or the chosen ones. */
export default function MachineUnitsModal({ machines, onClose, onSubmit }: MachineUnitsModalProps) {
  const [output, setOutput] = useState({ apply: true, unit: "pcs" });
  const [reject, setReject] = useState({ apply: true, unit: "pcs" });
  const [scope, setScope] = useState<MachineScope>({ kind: "all" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!output.apply && !reject.apply) return setError("Choose an output unit or a reject unit to apply");
    const machineIds = scopeIds(scope);
    if (!machineIds) return setError("Choose at least one machine");
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        machineIds,
        ...(output.apply && { outputUnit: output.unit.trim() }),
        ...(reject.apply && { rejectUnit: reject.unit.trim() }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply units");
      setSaving(false);
    }
  }

  const unitField = (
    id: string,
    label: string,
    value: { apply: boolean; unit: string },
    set: (v: { apply: boolean; unit: string }) => void
  ) => (
    <div className="space-y-1.5">
      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <input
          type="checkbox"
          checked={value.apply}
          onChange={(e) => set({ ...value, apply: e.target.checked })}
          className="size-4 accent-(--brand)"
        />
        {label}
      </label>
      <input
        id={id}
        value={value.unit}
        onChange={(e) => set({ ...value, unit: e.target.value })}
        disabled={!value.apply}
        placeholder="e.g. pcs, pack, kg"
        maxLength={20}
        aria-label={label}
        className={inputCls}
      />
    </div>
  );

  return (
    <Modal
      title="Set Output & Reject Units"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={buttonStyles.secondary}>
            Cancel
          </button>
          <button type="submit" form="units-form" disabled={saving} className={buttonStyles.primary}>
            {saving && <Loader2 size={16} className="animate-spin" />}
            Apply
          </button>
        </>
      }
    >
      <form id="units-form" onSubmit={handleSubmit} className="space-y-5">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {unitField("outputUnit", "Output unit", output, setOutput)}
          {unitField("rejectUnit", "Reject unit", reject, setReject)}
        </div>
        <p className="-mt-2 text-xs text-slate-500">Leave a unit empty to show numbers without a unit.</p>

        <MachineScopePicker
          machines={machines}
          scope={scope}
          onChange={setScope}
          describe={(m) => `${m.outputUnit || "—"} / ${m.rejectUnit || "—"}`}
        />
      </form>
    </Modal>
  );
}

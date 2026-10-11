"use client";

import type { MachineRegistration } from "@/types/machine";

export type MachineScope = { kind: "all" } | { kind: "selected"; ids: Set<string> };

/** The `machineIds` of a bulk update, or an error when no machine is chosen. */
export function scopeIds(scope: MachineScope): string[] | "all" | null {
  if (scope.kind === "all") return "all";
  return scope.ids.size ? [...scope.ids] : null;
}

/** "All machines" or a checklist of machines, for settings applied to many machines at once. */
export default function MachineScopePicker({
  machines,
  scope,
  onChange,
  describe,
}: {
  machines: MachineRegistration[];
  scope: MachineScope;
  onChange: (scope: MachineScope) => void;
  /** Current value of the setting, shown next to each machine. */
  describe: (m: MachineRegistration) => string;
}) {
  const selected = scope.kind === "selected" ? scope.ids : new Set<string>();
  const allSelected = machines.length > 0 && selected.size === machines.length;
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ kind: "selected", ids: next });
  };

  return (
    <>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium text-slate-700">Apply to</legend>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="radio"
            name="scope"
            checked={scope.kind === "all"}
            onChange={() => onChange({ kind: "all" })}
            className="size-4 accent-(--brand)"
          />
          All machines ({machines.length})
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="radio"
            name="scope"
            checked={scope.kind === "selected"}
            onChange={() => onChange({ kind: "selected", ids: selected })}
            className="size-4 accent-(--brand)"
          />
          Selected machines {scope.kind === "selected" && `(${selected.size})`}
        </label>
      </fieldset>

      {scope.kind === "selected" && (
        <div className="rounded-lg border border-slate-200">
          <label className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => onChange({ kind: "selected", ids: allSelected ? new Set() : new Set(machines.map((m) => m.id)) })}
              className="size-4 accent-(--brand)"
            />
            Select all
          </label>
          <div className="grid max-h-60 grid-cols-2 gap-x-3 overflow-y-auto px-3 py-2 sm:grid-cols-3">
            {machines.map((m) => (
              <label key={m.id} className="flex min-w-0 items-center gap-2 py-1 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={selected.has(m.id)}
                  onChange={() => toggle(m.id)}
                  className="size-4 shrink-0 accent-(--brand)"
                />
                <span className="font-medium">{m.machineNo}</span>
                <span className="truncate text-xs text-slate-400">{describe(m)}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

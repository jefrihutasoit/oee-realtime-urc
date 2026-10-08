"use client";

import { useEffect, useRef, useState } from "react";
import { Cpu, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import Modal, { buttonStyles } from "@/components/ui/Modal";
import Toggle from "@/components/ui/Toggle";
import { machineApi } from "@/lib/machine-api";
import type { GatewayTag, MachineInput, MachineRegistration } from "@/types/machine";
import MachineFormModal from "./MachineFormModal";

type FormState = { mode: "create" } | { mode: "edit"; machine: MachineRegistration } | null;

export default function MachineManagement() {
  const [machines, setMachines] = useState<MachineRegistration[]>([]);
  const [tags, setTags] = useState<GatewayTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<FormState>(null);
  const [deleting, setDeleting] = useState<MachineRegistration | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  function showToast(text: string, tone: "ok" | "error" = "ok") {
    clearTimeout(toastTimer.current);
    setToast({ text, tone });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }

  function load() {
    return Promise.all([machineApi.list(), machineApi.gatewayTags()])
      .then(([m, t]) => {
        setMachines(m);
        setTags(t);
        setLoadError(null);
      })
      .catch((err: Error) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    return () => clearTimeout(toastTimer.current);
  }, []);

  async function handleSubmit(input: MachineInput) {
    if (form?.mode === "edit") {
      const updated = await machineApi.update(form.machine.id, input);
      setMachines((list) => list.map((m) => (m.id === updated.id ? updated : m)));
      showToast(`Machine ${updated.machineNo} updated`);
    } else {
      const created = await machineApi.create(input);
      setMachines((list) =>
        [...list, created].sort((a, b) => a.machineNo.localeCompare(b.machineNo, undefined, { numeric: true }))
      );
      showToast(`Machine ${created.machineNo} registered`);
    }
    setForm(null);
  }

  async function handleToggle(machine: MachineRegistration, key: "isActive" | "oeeEnabled", value: boolean) {
    setMachines((list) => list.map((m) => (m.id === machine.id ? { ...m, [key]: value } : m)));
    try {
      await machineApi.update(machine.id, { [key]: value });
    } catch (err) {
      setMachines((list) => list.map((m) => (m.id === machine.id ? { ...m, [key]: !value } : m)));
      showToast(err instanceof Error ? err.message : "Update failed", "error");
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setBusyDelete(true);
    try {
      await machineApi.remove(deleting.id);
      setMachines((list) => list.filter((m) => m.id !== deleting.id));
      showToast(`Machine ${deleting.machineNo} deleted`);
      setDeleting(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Delete failed", "error");
    } finally {
      setBusyDelete(false);
    }
  }

  const q = query.trim().toLowerCase();
  const filtered = machines.filter(
    (m) =>
      !q ||
      [
        m.machineNo,
        m.machineName,
        m.tagStatus,
        m.tagOutput,
        m.tagReject,
        m.tagProduct,
        ...m.monitoringTags.flatMap((t) => [t.name, t.tagName]),
      ].some((s) => s.toLowerCase().includes(q))
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">Settings / Machine Management</p>
          <h2 className="text-xl font-semibold text-slate-900">Machine Management</h2>
          <p className="text-sm text-slate-500">Register packaging machines and map their status tag from the gateway.</p>
        </div>
        <button type="button" onClick={() => setForm({ mode: "create" })} className={buttonStyles.primary}>
          <Plus size={16} />
          Add Machine
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-80">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search machine no, name, or tag..."
            className="h-10 w-full rounded-lg border border-slate-200 bg-white pr-3 pl-9 text-sm placeholder:text-slate-400 focus:border-blue-400 focus:outline-none"
          />
        </div>
        <p className="text-sm text-slate-500">
          {machines.length} registered · {machines.filter((m) => m.isActive).length} active ·{" "}
          {machines.filter((m) => m.oeeEnabled).length} OEE enabled
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Photo</th>
              <th className="px-4 py-2.5 font-medium">No</th>
              <th className="px-4 py-2.5 font-medium">Machine Name</th>
              <th className="px-4 py-2.5 font-medium">Production Tags</th>
              <th className="px-4 py-2.5 font-medium">Monitoring</th>
              <th className="px-4 py-2.5 font-medium">Active</th>
              <th className="px-4 py-2.5 font-medium">OEE</th>
              <th className="px-4 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                  <Loader2 size={20} className="mx-auto mb-2 animate-spin" />
                  Loading machines…
                </td>
              </tr>
            ) : loadError ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-red-600">
                  {loadError}
                  <button
                    type="button"
                    onClick={() => {
                      setLoading(true);
                      load();
                    }}
                    className="ml-2 font-medium text-[#1E6FD9] hover:underline"
                  >
                    Retry
                  </button>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                  {machines.length === 0 ? "No machines registered yet." : "No machines match your search."}
                </td>
              </tr>
            ) : (
              filtered.map((m) => (
                // Inactive rows are greyed out; the toggles stay usable so the machine can be re-activated.
                <tr key={m.id} className={m.isActive ? "hover:bg-slate-50" : "bg-slate-50 text-slate-400"}>
                  <td className="px-4 py-2">
                    <div
                      className={`flex h-12 w-16 items-center justify-center overflow-hidden rounded-md bg-slate-100 ${
                        m.isActive ? "" : "opacity-50 grayscale"
                      }`}
                    >
                      {m.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element -- photos can be data URLs
                        <img src={m.photo} alt={`Machine ${m.machineNo}`} className="h-full w-full object-cover" />
                      ) : (
                        <Cpu size={20} className="text-slate-400" />
                      )}
                    </div>
                  </td>
                  <td className={`px-4 py-2 font-semibold ${m.isActive ? "text-slate-900" : "text-slate-400"}`}>
                    {m.machineNo}
                    {!m.isActive && (
                      <span className="mt-0.5 block w-fit rounded bg-slate-200 px-1.5 text-[10px] font-medium text-slate-500">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">{m.machineName}</td>
                  <td className="px-4 py-2">
                    <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
                      {(
                        [
                          ["Status", m.tagStatus],
                          ["Output", m.tagOutput],
                          ["Reject", m.tagReject],
                          ["Product", m.tagProduct],
                        ] as const
                      ).map(([label, tag]) => (
                        <div key={label} className="contents">
                          <dt className="text-slate-500">{label}</dt>
                          <dd className={`font-mono ${m.isActive ? "text-slate-700" : "text-slate-400"}`}>{tag}</dd>
                        </div>
                      ))}
                    </dl>
                  </td>
                  <td className="px-4 py-2">
                    <span
                      title={m.monitoringTags.map((t) => `${t.name}: ${t.tagName}`).join("\n") || undefined}
                      className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap ${
                        m.isActive ? "bg-blue-50 text-[#1E6FD9]" : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      {m.monitoringTags.length} {m.monitoringTags.length === 1 ? "tag" : "tags"}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <Toggle
                      label={`Machine ${m.machineNo} active`}
                      checked={m.isActive}
                      onChange={(v) => handleToggle(m, "isActive", v)}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <Toggle
                      label={`Machine ${m.machineNo} OEE enabled`}
                      checked={m.oeeEnabled}
                      onChange={(v) => handleToggle(m, "oeeEnabled", v)}
                    />
                    {m.oeeEnabled && (
                      <p className="mt-1 text-[11px] whitespace-nowrap text-slate-400">
                        {m.oeeConfig.startMode === "sku" ? "Registered SKU" : "Always"} ·{" "}
                        {m.oeeConfig.counterMode === "cumulative" ? "Cumulative" : "Direct"}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setForm({ mode: "edit", machine: m })}
                        className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-[#1E6FD9]"
                        aria-label={`Edit machine ${m.machineNo}`}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(m)}
                        className="rounded-md p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"
                        aria-label={`Delete machine ${m.machineNo}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {form && (
        <MachineFormModal
          key={form.mode === "edit" ? form.machine.id : "new"}
          machine={form.mode === "edit" ? form.machine : undefined}
          tags={tags}
          onClose={() => setForm(null)}
          onSubmit={handleSubmit}
        />
      )}

      {deleting && (
        <Modal
          size="sm"
          title="Delete Machine"
          onClose={() => !busyDelete && setDeleting(null)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setDeleting(null)}
                disabled={busyDelete}
                className={buttonStyles.secondary}
              >
                Cancel
              </button>
              <button type="button" onClick={handleDelete} disabled={busyDelete} className={buttonStyles.danger}>
                {busyDelete && <Loader2 size={16} className="animate-spin" />}
                Delete
              </button>
            </>
          }
        >
          <p className="text-sm text-slate-600">
            Delete machine <strong className="text-slate-900">{deleting.machineNo}</strong> ({deleting.machineName})?
            This cannot be undone.
          </p>
        </Modal>
      )}

      {toast && (
        <div
          role="status"
          className={`fixed right-4 bottom-4 z-50 rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-lg ${
            toast.tone === "ok" ? "bg-slate-900" : "bg-red-600"
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

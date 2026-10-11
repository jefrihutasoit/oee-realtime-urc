"use client";

import { useMemo, useRef, useState } from "react";
import { ImagePlus, Loader2, Plus, Trash2 } from "lucide-react";
import Modal, { buttonStyles } from "@/components/ui/Modal";
import Toggle from "@/components/ui/Toggle";
import { REALTIME_MODES, TtlSelect } from "@/lib/realtime-mode";
import { fileToResizedDataUrl } from "@/lib/image";
import type {
  GatewayTag,
  MachineInput,
  MachineRegistration,
  ProductionTagKey,
  ProductionUnitKey,
} from "@/types/machine";

interface MachineFormModalProps {
  machine?: MachineRegistration;
  tags: GatewayTag[];
  onClose: () => void;
  onSubmit: (input: MachineInput) => Promise<void>;
}

type GeneralFields = Omit<MachineInput, "monitoringTags">;
/** `key` is a client-only row key; `id` is set for rows that already exist on the server. */
type MonitoringRow = { key: number; id?: string; name: string; tagName: string; unit: string };

const inputCls =
  "h-10 w-full rounded-lg border border-slate-200 bg-surface px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const TAG_LIST_ID = "gateway-tag-options";

const productionTags: { key: ProductionTagKey; label: string; hint: string; unitKey?: ProductionUnitKey }[] = [
  { key: "tagStatus", label: "Tag Status", hint: "Run / stop / off state" },
  { key: "tagOutput", label: "Tag Output", hint: "Good output counter", unitKey: "outputUnit" },
  { key: "tagReject", label: "Tag Reject", hint: "Reject counter", unitKey: "rejectUnit" },
  { key: "tagProduct", label: "Tag Product", hint: "Active product / SKU code" },
];

let rowSeq = 0;

function Section({ title, description, action, children }: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3 border-b border-slate-100 pb-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {description && <p className="text-xs text-slate-500">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Free-text tag input with gateway tag suggestions; shows the description when the tag is a known one. */
function TagInput({ id, value, onChange, tagMap, placeholder = "Type or pick a tag…", label }: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  tagMap: Map<string, string>;
  placeholder?: string;
  label?: string;
}) {
  const known = tagMap.get(value.trim());
  return (
    <div>
      <input
        id={id}
        list={TAG_LIST_ID}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        spellCheck={false}
        autoComplete="off"
        maxLength={200}
        className={`${inputCls} font-mono text-[13px]`}
      />
      {value.trim() && (
        <p className="mt-1 truncate text-xs text-slate-500">{known ?? "Custom tag"}</p>
      )}
    </div>
  );
}

export default function MachineFormModal({ machine, tags, onClose, onSubmit }: MachineFormModalProps) {
  const [form, setForm] = useState<GeneralFields>({
    machineNo: machine?.machineNo ?? "",
    machineName: machine?.machineName ?? "",
    tagStatus: machine?.tagStatus ?? "",
    tagOutput: machine?.tagOutput ?? "",
    tagReject: machine?.tagReject ?? "",
    tagProduct: machine?.tagProduct ?? "",
    outputUnit: machine?.outputUnit ?? "pcs",
    rejectUnit: machine?.rejectUnit ?? "pcs",
    realtimeMode: machine?.realtimeMode ?? "registered",
    adaptiveTtlMinutes: machine?.adaptiveTtlMinutes ?? 480,
    photo: machine?.photo ?? null,
    isActive: machine?.isActive ?? true,
    oeeEnabled: machine?.oeeEnabled ?? true,
  });
  const [rows, setRows] = useState<MonitoringRow[]>(
    () => machine?.monitoringTags.map((t) => ({ key: ++rowSeq, ...t })) ?? []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const tagMap = useMemo(() => new Map(tags.map((t) => [t.tag, t.description])), [tags]);

  const set = <K extends keyof GeneralFields>(key: K, value: GeneralFields[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const updateRow = (key: number, patch: Partial<MonitoringRow>) =>
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Photo must be an image file");
    if (file.size > MAX_UPLOAD_BYTES) return setError("Photo must be 5 MB or smaller");
    try {
      set("photo", await fileToResizedDataUrl(file));
      setError(null);
    } catch {
      setError("Could not read this image");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const missing = [
      !form.machineNo.trim() && "Machine No",
      !form.machineName.trim() && "Machine name",
      ...productionTags.map((t) => !form[t.key].trim() && t.label),
    ].filter(Boolean);
    if (missing.length) {
      setError(`${missing.join(", ")} ${missing.length > 1 ? "are" : "is"} required`);
      return;
    }

    const monitoringTags = rows
      .filter((r) => r.name.trim() || r.tagName.trim())
      .map(({ id, name, tagName, unit }) => ({ id, name, tagName, unit }));

    setSaving(true);
    setError(null);
    try {
      await onSubmit({ ...form, monitoringTags });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save machine");
      setSaving(false);
    }
  }

  return (
    <Modal
      size="xl"
      title={machine ? `Edit Machine ${machine.machineNo}` : "Register Machine"}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={buttonStyles.secondary}>
            Cancel
          </button>
          <button type="submit" form="machine-form" disabled={saving} className={buttonStyles.primary}>
            {saving && <Loader2 size={16} className="animate-spin" />}
            {machine ? "Save Changes" : "Register"}
          </button>
        </>
      }
    >
      <form id="machine-form" onSubmit={handleSubmit} className="space-y-6">
        <datalist id={TAG_LIST_ID}>
          {tags.map((t) => (
            <option key={t.tag} value={t.tag}>
              {t.description}
            </option>
          ))}
        </datalist>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <Section title="General">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[160px_1fr]">
            <div className="space-y-2">
              <div className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50 sm:w-40">
                {form.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- data URL preview
                  <img src={form.photo} alt="Machine photo preview" className="h-full w-full object-cover" />
                ) : (
                  <ImagePlus size={28} className="text-slate-400" />
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => fileRef.current?.click()} className={buttonStyles.secondary}>
                  {form.photo ? "Change" : "Upload photo"}
                </button>
                {form.photo && (
                  <button
                    type="button"
                    onClick={() => set("photo", null)}
                    className="text-sm font-medium text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-500">JPG or PNG, max 5 MB.</p>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[120px_1fr]">
                <div className="space-y-1.5">
                  <label htmlFor="machineNo" className="block text-sm font-medium text-slate-700">
                    Machine No
                  </label>
                  <input
                    id="machineNo"
                    value={form.machineNo}
                    onChange={(e) => set("machineNo", e.target.value)}
                    placeholder="1A"
                    className={inputCls}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="machineName" className="block text-sm font-medium text-slate-700">
                    Machine Name
                  </label>
                  <input
                    id="machineName"
                    value={form.machineName}
                    onChange={(e) => set("machineName", e.target.value)}
                    placeholder="Packing Machine 1A"
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-700">Active</p>
                    <p className="text-xs text-slate-500">Inactive machines are hidden from monitoring.</p>
                  </div>
                  <Toggle label="Active" checked={form.isActive} onChange={(v) => set("isActive", v)} />
                </div>
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-700">OEE Enabled</p>
                    <p className="text-xs text-slate-500">Include this machine in OEE calculation.</p>
                  </div>
                  <Toggle label="OEE enabled" checked={form.oeeEnabled} onChange={(v) => set("oeeEnabled", v)} />
                </div>
              </div>
            </div>
          </div>
        </Section>

        <Section
          title="Production Tags"
          description="Any tag name is allowed; suggestions come from the gateway tag list."
        >
          <div className="space-y-3">
            {productionTags.map((t) => (
              <div key={t.key} className="grid grid-cols-1 gap-1.5 sm:grid-cols-[160px_1fr] sm:gap-4">
                <label htmlFor={t.key} className="pt-2 text-sm font-medium text-slate-700">
                  {t.label}
                  <span className="block text-xs font-normal text-slate-500">{t.hint}</span>
                </label>
                <div className={t.unitKey ? "grid grid-cols-[1fr_96px] items-start gap-2" : undefined}>
                  <TagInput id={t.key} value={form[t.key]} onChange={(v) => set(t.key, v)} tagMap={tagMap} />
                  {t.unitKey && (
                    <input
                      value={form[t.unitKey]}
                      onChange={(e) => set(t.unitKey!, e.target.value)}
                      placeholder="Unit"
                      title="Unit shown with this counter, e.g. pcs"
                      aria-label={`${t.label} unit`}
                      maxLength={20}
                      className={inputCls}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Realtime Tags" description="Where the values on the machine's realtime view come from.">
          <div className="grid gap-3 sm:grid-cols-2">
            {REALTIME_MODES.map((m) => (
              <label
                key={m.value}
                className={`flex cursor-pointer items-start gap-2 rounded-lg border-2 p-3 text-sm ${
                  form.realtimeMode === m.value ? "border-(--brand)" : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <input
                  type="radio"
                  name="realtimeMode"
                  checked={form.realtimeMode === m.value}
                  onChange={() => set("realtimeMode", m.value)}
                  className="mt-0.5 size-4 accent-(--brand)"
                />
                <span>
                  <span className="font-medium text-slate-800">{m.label}</span>
                  <span className="block text-xs text-slate-500">{m.hint}</span>
                </span>
              </label>
            ))}
          </div>
          {form.realtimeMode === "adaptive" && (
            <div className="grid gap-1.5 sm:grid-cols-[220px_1fr] sm:items-center">
              <label htmlFor="adaptiveTtl" className="text-sm font-medium text-slate-700">
                Remove a tag when not published for
              </label>
              <TtlSelect
                id="adaptiveTtl"
                value={form.adaptiveTtlMinutes}
                onChange={(v) => set("adaptiveTtlMinutes", v)}
                className={inputCls}
              />
            </div>
          )}
        </Section>

        <Section
          title={`Realtime Monitoring Tags (${rows.length})`}
          description={
            form.realtimeMode === "adaptive"
              ? "Kept, but not shown while the machine uses adaptive tags."
              : "Extra values shown on the machine's realtime view, e.g. speed or seal temperature."
          }
          action={
            <button
              type="button"
              onClick={() => setRows((list) => [...list, { key: ++rowSeq, name: "", tagName: "", unit: "" }])}
              className={buttonStyles.secondary}
            >
              <Plus size={16} />
              Add Tag
            </button>
          }
        >
          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 py-6 text-center text-sm text-slate-500">
              No monitoring tags yet.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="hidden grid-cols-[1fr_1.5fr_96px_36px] gap-2 text-xs font-medium text-slate-500 sm:grid">
                <span>Name</span>
                <span>Tag Name</span>
                <span>Unit</span>
              </div>
              {rows.map((r, i) => (
                <div
                  key={r.key}
                  className="grid grid-cols-[1fr_96px_36px] items-start gap-2 rounded-lg border border-slate-100 p-2 sm:grid-cols-[1fr_1.5fr_96px_36px] sm:border-0 sm:p-0"
                >
                  <input
                    value={r.name}
                    onChange={(e) => updateRow(r.key, { name: e.target.value })}
                    placeholder="e.g. Seal Temperature"
                    aria-label={`Monitoring tag ${i + 1} name`}
                    className={inputCls}
                  />
                  <div className="col-span-3 col-start-1 row-start-2 sm:col-span-1 sm:col-start-auto sm:row-start-auto">
                    <TagInput
                      value={r.tagName}
                      onChange={(v) => updateRow(r.key, { tagName: v })}
                      tagMap={tagMap}
                      label={`Monitoring tag ${i + 1} tag name`}
                    />
                  </div>
                  <input
                    value={r.unit}
                    onChange={(e) => updateRow(r.key, { unit: e.target.value })}
                    placeholder="e.g. °C"
                    aria-label={`Monitoring tag ${i + 1} unit`}
                    maxLength={20}
                    className={`${inputCls} col-start-2 row-start-1 sm:col-start-auto sm:row-start-auto`}
                  />
                  <button
                    type="button"
                    onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))}
                    className="col-start-3 row-start-1 flex size-9 items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600 sm:col-start-auto sm:row-start-auto"
                    aria-label={`Remove monitoring tag ${i + 1}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Section>
      </form>
    </Modal>
  );
}

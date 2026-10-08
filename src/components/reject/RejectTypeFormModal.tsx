"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import Modal, { buttonStyles } from "@/components/ui/Modal";
import type { RejectType, RejectTypeInput } from "@/types/reject";

interface RejectTypeFormModalProps {
  rejectType?: RejectType;
  /** Order given to a new type: after the last one. */
  nextOrder: number;
  onClose: () => void;
  onSubmit: (input: RejectTypeInput) => Promise<void>;
}

const inputCls =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none";

export default function RejectTypeFormModal({ rejectType, nextOrder, onClose, onSubmit }: RejectTypeFormModalProps) {
  const [name, setName] = useState(rejectType?.name ?? "");
  const [order, setOrder] = useState(String(rejectType?.sortOrder ?? nextOrder));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Reject type name is required");
    const sortOrder = Number(order);
    if (!/^\d+$/.test(order.trim()) || sortOrder > 9999) return setError("Order must be a whole number from 0 to 9999");
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), sortOrder });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save reject type");
      setSaving(false);
    }
  }

  return (
    <Modal
      size="sm"
      title={rejectType ? `Edit ${rejectType.name}` : "Add Reject Type"}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={buttonStyles.secondary}>
            Cancel
          </button>
          <button type="submit" form="reject-type-form" disabled={saving} className={buttonStyles.primary}>
            {saving && <Loader2 size={16} className="animate-spin" />}
            {rejectType ? "Save Changes" : "Add Reject Type"}
          </button>
        </>
      }
    >
      <form id="reject-type-form" onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="space-y-1.5">
          <label htmlFor="rejectTypeName" className="block text-sm font-medium text-slate-700">
            Name
          </label>
          <input
            id="rejectTypeName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Pouch Bocor"
            maxLength={100}
            autoFocus
            className={inputCls}
          />
          <p className="text-xs text-slate-500">Must match the column name in the reject sheet.</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="rejectTypeOrder" className="block text-sm font-medium text-slate-700">
            Order
          </label>
          <input
            id="rejectTypeOrder"
            inputMode="numeric"
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            className={inputCls}
          />
          <p className="text-xs text-slate-500">Column order in lists and the upload template.</p>
        </div>
      </form>
    </Modal>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import Modal, { buttonStyles } from "@/components/ui/Modal";
import { rejectApi } from "@/lib/reject-api";
import type { RejectType, RejectTypeInput } from "@/types/reject";
import RejectTypeFormModal from "./RejectTypeFormModal";

type FormState = { mode: "create" } | { mode: "edit"; rejectType: RejectType } | null;

const byOrder = (a: RejectType, b: RejectType) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

export default function RejectTypeManagement() {
  const [types, setTypes] = useState<RejectType[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(null);
  const [deleting, setDeleting] = useState<RejectType | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    rejectApi
      .types()
      .then(setTypes)
      .catch((err: Error) => {
        setTypes([]);
        setLoadError(err.message);
      });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function handleSubmit(input: RejectTypeInput) {
    if (form?.mode === "edit") {
      const updated = await rejectApi.updateType(form.rejectType.id, input);
      setTypes((list) => (list ?? []).map((t) => (t.id === updated.id ? updated : t)).sort(byOrder));
      setToast(`${updated.name} updated`);
    } else {
      const created = await rejectApi.createType(input);
      setTypes((list) => [...(list ?? []), created].sort(byOrder));
      setToast(`${created.name} added`);
    }
    setForm(null);
  }

  async function handleDelete() {
    if (!deleting) return;
    setBusyDelete(true);
    setDeleteError(null);
    try {
      await rejectApi.removeType(deleting.id);
      setTypes((list) => (list ?? []).filter((t) => t.id !== deleting.id));
      setToast(`${deleting.name} deleted`);
      setDeleting(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyDelete(false);
    }
  }

  const nextOrder = (types ?? []).reduce((max, t) => Math.max(max, t.sortOrder), 0) + 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Reject Types</h2>
          <p className="text-sm text-slate-500">
            Reject categories used by manual input and the upload template. Uploaded sheets add new columns here
            automatically.
          </p>
        </div>
        <button type="button" onClick={() => setForm({ mode: "create" })} className={buttonStyles.primary}>
          <Plus size={16} />
          Add Reject Type
        </button>
      </div>

      {loadError && <p className="text-sm text-red-600">{loadError}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[480px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="w-24 px-4 py-2.5 font-medium">Order</th>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {types === null ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                  <Loader2 size={18} className="mx-auto animate-spin" />
                </td>
              </tr>
            ) : types.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                  No reject types registered yet.
                </td>
              </tr>
            ) : (
              types.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-2.5 text-slate-500 tabular-nums">{t.sortOrder}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-900">{t.name}</td>
                  <td className="px-4 py-1.5">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setForm({ mode: "edit", rejectType: t })}
                        className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-[#1E6FD9]"
                        aria-label={`Edit ${t.name}`}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteError(null);
                          setDeleting(t);
                        }}
                        className="rounded-md p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"
                        aria-label={`Delete ${t.name}`}
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
        <RejectTypeFormModal
          key={form.mode === "edit" ? form.rejectType.id : "new"}
          rejectType={form.mode === "edit" ? form.rejectType : undefined}
          nextOrder={nextOrder}
          onClose={() => setForm(null)}
          onSubmit={handleSubmit}
        />
      )}

      {deleting && (
        <Modal
          size="sm"
          title="Delete Reject Type"
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
          {deleteError && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{deleteError}</p>}
          <p className="text-sm text-slate-600">
            Delete reject type <strong className="text-slate-900">{deleting.name}</strong>? Types already used in reject
            data cannot be deleted.
          </p>
        </Modal>
      )}

      {toast && (
        <div
          role="status"
          className="fixed right-4 bottom-4 z-50 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

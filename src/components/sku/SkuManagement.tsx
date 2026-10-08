"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Package, Pencil, Plus, Search, Trash2 } from "lucide-react";
import Modal, { buttonStyles } from "@/components/ui/Modal";
import { assetUrl } from "@/lib/api";
import { skuApi } from "@/lib/sku-api";
import type { SkuInput, SkuMaster } from "@/types/sku";
import SkuFormModal from "./SkuFormModal";

type FormState = { mode: "create" } | { mode: "edit"; sku: SkuMaster } | null;

const rateFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const bySkuId = (a: SkuMaster, b: SkuMaster) => a.skuId.localeCompare(b.skuId, undefined, { numeric: true });

export default function SkuManagement() {
  const [skus, setSkus] = useState<SkuMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<FormState>(null);
  const [deleting, setDeleting] = useState<SkuMaster | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  function showToast(text: string, tone: "ok" | "error" = "ok") {
    clearTimeout(toastTimer.current);
    setToast({ text, tone });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }

  function load() {
    return skuApi
      .list()
      .then((list) => {
        setSkus(list);
        setLoadError(null);
      })
      .catch((err: Error) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    return () => clearTimeout(toastTimer.current);
  }, []);

  async function handleSubmit(input: SkuInput) {
    if (form?.mode === "edit") {
      const updated = await skuApi.update(form.sku.id, input);
      setSkus((list) => list.map((s) => (s.id === updated.id ? updated : s)).sort(bySkuId));
      showToast(`SKU ${updated.skuId} updated`);
    } else {
      const created = await skuApi.create(input);
      setSkus((list) => [...list, created].sort(bySkuId));
      showToast(`SKU ${created.skuId} added`);
    }
    setForm(null);
  }

  async function handleDelete() {
    if (!deleting) return;
    setBusyDelete(true);
    try {
      await skuApi.remove(deleting.id);
      setSkus((list) => list.filter((s) => s.id !== deleting.id));
      showToast(`SKU ${deleting.skuId} deleted`);
      setDeleting(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Delete failed", "error");
    } finally {
      setBusyDelete(false);
    }
  }

  const q = query.trim().toLowerCase();
  const filtered = skus.filter(
    (s) => !q || [s.skuId, s.productName, s.sku].some((v) => v.toLowerCase().includes(q))
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">SKU Management</h2>
          <p className="text-sm text-slate-500">Products that run on the packaging machines and their ideal output rate.</p>
        </div>
        <button type="button" onClick={() => setForm({ mode: "create" })} className={buttonStyles.primary}>
          <Plus size={16} />
          Add SKU
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-80">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search SKU ID, product, or SKU..."
            className="h-10 w-full rounded-lg border border-slate-200 bg-white pr-3 pl-9 text-sm placeholder:text-slate-400 focus:border-blue-400 focus:outline-none"
          />
        </div>
        <p className="text-sm text-slate-500">{skus.length} SKU registered</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Photo</th>
              <th className="px-4 py-2.5 font-medium">SKU ID</th>
              <th className="px-4 py-2.5 font-medium">Product Name</th>
              <th className="px-4 py-2.5 font-medium">SKU</th>
              <th className="px-4 py-2.5 text-right font-medium">Output / min (packs)</th>
              <th className="px-4 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  <Loader2 size={20} className="mx-auto mb-2 animate-spin" />
                  Loading SKUs…
                </td>
              </tr>
            ) : loadError ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-red-600">
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
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  {skus.length === 0 ? "No SKU registered yet." : "No SKU matches your search."}
                </td>
              </tr>
            ) : (
              filtered.map((s) => {
                const photo = assetUrl(s.photo);
                return (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <div className="flex size-12 items-center justify-center overflow-hidden rounded-md bg-slate-100">
                        {photo ? (
                          // eslint-disable-next-line @next/next/no-img-element -- photo served by the backend
                          <img src={photo} alt={s.productName} className="h-full w-full object-contain" />
                        ) : (
                          <Package size={20} className="text-slate-400" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 font-mono font-semibold text-slate-900">{s.skuId}</td>
                    <td className="px-4 py-2 text-slate-700">{s.productName}</td>
                    <td className="px-4 py-2 text-slate-600">{s.sku}</td>
                    <td className="px-4 py-2 text-right text-slate-700 tabular-nums">{rateFmt.format(s.outputPerMinute)}</td>
                    <td className="px-4 py-2">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setForm({ mode: "edit", sku: s })}
                          className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-[#1E6FD9]"
                          aria-label={`Edit SKU ${s.skuId}`}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(s)}
                          className="rounded-md p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"
                          aria-label={`Delete SKU ${s.skuId}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {form && (
        <SkuFormModal
          key={form.mode === "edit" ? form.sku.id : "new"}
          sku={form.mode === "edit" ? form.sku : undefined}
          onClose={() => setForm(null)}
          onSubmit={handleSubmit}
        />
      )}

      {deleting && (
        <Modal
          size="sm"
          title="Delete SKU"
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
            Delete SKU <strong className="text-slate-900">{deleting.skuId}</strong> ({deleting.productName})? Its photo
            file is deleted too. This cannot be undone.
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

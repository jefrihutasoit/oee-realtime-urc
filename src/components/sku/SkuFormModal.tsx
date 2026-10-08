"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import Modal, { buttonStyles } from "@/components/ui/Modal";
import { assetUrl } from "@/lib/api";
import { fileToResizedDataUrl } from "@/lib/image";
import type { SkuInput, SkuMaster } from "@/types/sku";

interface SkuFormModalProps {
  sku?: SkuMaster;
  onClose: () => void;
  onSubmit: (input: SkuInput) => Promise<void>;
}

const inputCls =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none aria-invalid:border-red-400";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const SKU_ID_PATTERN = /^[A-Za-z0-9]*$/;

export default function SkuFormModal({ sku, onClose, onSubmit }: SkuFormModalProps) {
  const [skuId, setSkuId] = useState(sku?.skuId ?? "");
  const [productName, setProductName] = useState(sku?.productName ?? "");
  const [skuText, setSkuText] = useState(sku?.sku ?? "");
  const [outputPerMinute, setOutputPerMinute] = useState(sku ? String(sku.outputPerMinute) : "");
  /** Existing backend path, a new data URL, or null. */
  const [photo, setPhoto] = useState<string | null>(sku?.photo ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const skuIdInvalid = !SKU_ID_PATTERN.test(skuId);

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Photo must be an image file");
    if (file.size > MAX_UPLOAD_BYTES) return setError("Photo must be 5 MB or smaller");
    try {
      setPhoto(await fileToResizedDataUrl(file));
      setError(null);
    } catch {
      setError("Could not read this image");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const rate = Number(outputPerMinute);
    if (!skuId.trim() || !productName.trim() || !skuText.trim() || !outputPerMinute.trim()) {
      return setError("All fields except photo are required");
    }
    if (skuIdInvalid) return setError("SKU ID may only contain letters and numbers");
    if (!Number.isFinite(rate) || rate <= 0) return setError("Output per minute must be greater than 0");

    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        skuId: skuId.trim(),
        productName,
        sku: skuText,
        outputPerMinute: rate,
        // Only send the photo when it changed; omitting it keeps the stored file.
        ...(photo !== (sku?.photo ?? null) && { photo }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save SKU");
      setSaving(false);
    }
  }

  const preview = assetUrl(photo);

  return (
    <Modal
      title={sku ? `Edit SKU ${sku.skuId}` : "Add SKU"}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={buttonStyles.secondary}>
            Cancel
          </button>
          <button type="submit" form="sku-form" disabled={saving} className={buttonStyles.primary}>
            {saving && <Loader2 size={16} className="animate-spin" />}
            {sku ? "Save Changes" : "Add SKU"}
          </button>
        </>
      }
    >
      <form id="sku-form" onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="flex items-center gap-4">
          <div className="flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- backend file or data URL preview
              <img src={preview} alt="SKU photo preview" className="h-full w-full object-contain" />
            ) : (
              <ImagePlus size={28} className="text-slate-400" />
            )}
          </div>
          <div className="space-y-2">
            <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => fileRef.current?.click()} className={buttonStyles.secondary}>
                {photo ? "Change" : "Upload photo"}
              </button>
              {photo && (
                <button
                  type="button"
                  onClick={() => setPhoto(null)}
                  className="text-sm font-medium text-red-600 hover:underline"
                >
                  Remove
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500">JPG or PNG, max 5 MB. Optional.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="skuId" className="block text-sm font-medium text-slate-700">
              SKU ID
            </label>
            <input
              id="skuId"
              value={skuId}
              onChange={(e) => setSkuId(e.target.value)}
              placeholder="e.g. 1001 or CHZ60"
              maxLength={30}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={skuIdInvalid || undefined}
              className={`${inputCls} font-mono`}
            />
            <p className={`text-xs ${skuIdInvalid ? "text-red-600" : "text-slate-500"}`}>
              Letters and numbers only, must be unique.
            </p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="outputPerMinute" className="block text-sm font-medium text-slate-700">
              Output per Minute (Packs)
            </label>
            <input
              id="outputPerMinute"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              value={outputPerMinute}
              onChange={(e) => setOutputPerMinute(e.target.value)}
              placeholder="60"
              className={inputCls}
            />
            <p className="text-xs text-slate-500">Ideal rate, used for OEE performance.</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="productName" className="block text-sm font-medium text-slate-700">
            Product Name
          </label>
          <input
            id="productName"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="Cheese Ring 60g"
            maxLength={150}
            className={inputCls}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="sku" className="block text-sm font-medium text-slate-700">
            SKU
          </label>
          <input
            id="sku"
            value={skuText}
            onChange={(e) => setSkuText(e.target.value)}
            placeholder="SNK-CHS-60"
            maxLength={100}
            className={inputCls}
          />
        </div>
      </form>
    </Modal>
  );
}

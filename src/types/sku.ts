// Keep in sync with be-realtime-urc/src/types/sku.ts

export interface SkuMaster {
  id: string;
  /** User-defined alphanumeric code, unique (case-insensitive). */
  skuId: string;
  productName: string;
  sku: string;
  /** Ideal output rate in packs per minute. */
  outputPerMinute: number;
  /** Backend path of the photo file, e.g. "/uploads/skus/<file>.jpg"; null when none. */
  photo: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * `photo` on input: a data URL uploads a new photo, null removes it,
 * and omitting it keeps the existing one.
 */
export type SkuInput = Pick<SkuMaster, "skuId" | "productName" | "sku" | "outputPerMinute"> & {
  photo?: string | null;
};

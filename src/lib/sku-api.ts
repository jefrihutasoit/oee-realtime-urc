import { apiRequest } from "@/lib/api";
import type { SkuInput, SkuMaster } from "@/types/sku";

export const skuApi = {
  list: () => apiRequest<SkuMaster[]>("/skus"),
  create: (input: SkuInput) => apiRequest<SkuMaster>("/skus", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, input: Partial<SkuInput>) =>
    apiRequest<SkuMaster>(`/skus/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) }),
  remove: (id: string) => apiRequest<{ ok: true }>(`/skus/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

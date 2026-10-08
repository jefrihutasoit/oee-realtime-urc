import { apiRequest } from "@/lib/api";
import type { TagPush, TagReading } from "@/types/tag";

export const tagApi = {
  latest: () => apiRequest<TagReading[]>("/tag-values/latest"),
  recent: (limit = 20) => apiRequest<TagReading[]>(`/tag-values/recent?limit=${limit}`),
  push: (push: TagPush) => apiRequest<TagReading>("/tag-values", { method: "POST", body: JSON.stringify(push) }),
};

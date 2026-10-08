import { apiRequest } from "@/lib/api";
import type { StatusDefinition } from "@/types/settings";

export const settingsApi = {
  getStatusDefinition: () => apiRequest<StatusDefinition>("/settings/status-definition"),
  saveStatusDefinition: (def: StatusDefinition) =>
    apiRequest<StatusDefinition>("/settings/status-definition", { method: "PUT", body: JSON.stringify(def) }),
};

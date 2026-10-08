import { apiRequest } from "@/lib/api";
import type { OeeSettings, StatusDefinition } from "@/types/settings";

export const settingsApi = {
  getStatusDefinition: () => apiRequest<StatusDefinition>("/settings/status-definition"),
  saveStatusDefinition: (def: StatusDefinition) =>
    apiRequest<StatusDefinition>("/settings/status-definition", { method: "PUT", body: JSON.stringify(def) }),
  getOeeSettings: () => apiRequest<OeeSettings>("/settings/oee"),
  saveOeeSettings: (settings: OeeSettings) =>
    apiRequest<OeeSettings>("/settings/oee", { method: "PUT", body: JSON.stringify(settings) }),
};

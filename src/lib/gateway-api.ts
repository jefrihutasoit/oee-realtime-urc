import { apiRequest } from "@/lib/api";
import type {
  GatewayLogEntry,
  GatewayPublish,
  GatewaySettings,
  GatewaySettingsView,
  GatewayStatus,
  MqttTestResult,
} from "@/types/gateway";

/** Settings to save; `mqtt.password` null keeps the stored password. */
export type GatewaySettingsInput = Omit<GatewaySettings, "mqtt"> & {
  mqtt: Omit<GatewaySettings["mqtt"], "password"> & { password: string | null };
};

/** Topic of one machine: the subscription filter's base plus the machine No ("urc/oee/#" → "urc/oee/1A"). */
export function machineTopic(filter: string, machineNo: string) {
  if (filter.includes("+")) return filter.replace("+", machineNo).replace(/\/#$/, "");
  return `${filter.replace(/\/?#$/, "")}/${machineNo}`;
}

export const gatewayApi = {
  getSettings: () => apiRequest<GatewaySettingsView>("/gateway/settings"),
  saveSettings: (input: GatewaySettingsInput) =>
    apiRequest<GatewaySettingsView>("/gateway/settings", { method: "PUT", body: JSON.stringify(input) }),
  regenerateApiKey: () => apiRequest<GatewaySettingsView>("/gateway/settings/api-key", { method: "POST" }),
  status: () => apiRequest<GatewayStatus>("/gateway/status"),
  /** Console entries newer than `after` (a seq); `last` is the newest seq on the server. */
  messages: (after: number) => apiRequest<{ entries: GatewayLogEntry[]; last: number }>(`/gateway/messages?after=${after}`),
  clearMessages: () => apiRequest<{ ok: true }>("/gateway/messages", { method: "DELETE" }),
  /** Tries the MQTT settings as filled in (not saved); password null = the stored one. */
  testMqtt: (mqtt: GatewaySettingsInput["mqtt"]) =>
    apiRequest<MqttTestResult>("/gateway/mqtt/test", { method: "POST", body: JSON.stringify(mqtt) }),
  publish: (input: GatewayPublish) =>
    apiRequest<{ ok: true }>("/gateway/publish", { method: "POST", body: JSON.stringify(input) }),
};

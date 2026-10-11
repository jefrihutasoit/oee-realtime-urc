import { apiRequest } from "@/lib/api";
import type { SystemEvent, SystemEventType, SystemInfo, SystemStatus } from "@/types/system";

/** Database connection as shown in System Management (no password). */
export interface DbConfigView {
  host: string;
  port: number;
  user: string;
  database: string;
  hasPassword: boolean;
  /** "env": still the .env values; "file": saved from System Management. */
  source: "file" | "env";
  file: string;
}

/** Settings to test or save. `password` null keeps the saved one; `connectionString` may replace the fields. */
export interface DbConfigInput {
  host: string;
  port: number;
  user: string;
  password: string | null;
  database: string;
  connectionString?: string;
}

export interface DbTestResult {
  ok: boolean;
  message: string;
  ms: number;
  serverVersion?: string;
  databaseExists?: boolean;
}

export const systemApi = {
  status: () => apiRequest<SystemStatus>("/system/status"),
  info: () => apiRequest<SystemInfo>("/system/info"),
  log: (limit = 300, types?: SystemEventType[]) =>
    apiRequest<SystemEvent[]>(`/system/log?limit=${limit}${types?.length ? `&types=${types.join(",")}` : ""}`),
  database: () => apiRequest<DbConfigView>("/system/database"),
  testDatabase: (input: DbConfigInput) =>
    apiRequest<DbTestResult>("/system/database/test", { method: "POST", body: JSON.stringify(input) }),
  saveDatabase: (input: DbConfigInput) =>
    apiRequest<{ connected: boolean; error: string | null; config: DbConfigView }>("/system/database", {
      method: "PUT",
      body: JSON.stringify(input),
    }),
};

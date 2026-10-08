import { apiDownload, apiRequest } from "@/lib/api";

export interface DatabaseStats {
  database: string;
  schemaVersion: string | null;
  tables: { name: string; rows: number; bytes: number }[];
  tagValues: { oldest: string | null; newest: string | null };
}

export interface ClearPreview {
  from: string;
  to: string;
  items: { table: string; label: string; rows: number }[];
}

const json = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

export const databaseApi = {
  stats: () => apiRequest<DatabaseStats>("/database/stats"),
  backup: () => apiDownload("/database/backup", "oee-db-backup.jsonl.gz"),
  restore: (file: File) =>
    apiRequest<{ exportedAt: string | null; tables: Record<string, number> }>("/database/restore", {
      method: "POST",
      body: file,
      headers: { "Content-Type": "application/gzip" },
    }),
  previewClear: (from: string, to: string) => apiRequest<ClearPreview>("/database/clear/preview", json({ from, to })),
  clear: (from: string, to: string) =>
    apiRequest<{ deleted: Record<string, number> }>("/database/clear", json({ from, to, confirm: "DELETE" })),
  initialize: (keepUsers: boolean) =>
    apiRequest<{ keepUsers: boolean }>("/database/initialize", json({ confirm: "INITIALIZE", keepUsers })),
};

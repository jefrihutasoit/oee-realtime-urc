import { apiRequest } from "@/lib/api";
import type { BackupCheck, SettingsBackup } from "@/types/backup";

export const backupApi = {
  export: () => apiRequest<SettingsBackup>("/backup"),
  validate: (backup: SettingsBackup) =>
    apiRequest<BackupCheck>("/backup/validate", { method: "POST", body: JSON.stringify(backup) }),
  restore: (backup: SettingsBackup) =>
    apiRequest<BackupCheck>("/backup/restore", { method: "POST", body: JSON.stringify(backup) }),
};

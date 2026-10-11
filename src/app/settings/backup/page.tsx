import { redirect } from "next/navigation";

// Moved into System Management.
export default function SettingsBackupPage() {
  redirect("/settings/system?tab=backup");
}

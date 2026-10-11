"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import SettingsBackup from "@/components/settings/backup/SettingsBackup";
import DatabaseMaintenance from "@/components/settings/database/DatabaseMaintenance";
import { useAuth } from "@/lib/auth";
import { systemApi } from "@/lib/system-api";
import type { Permission } from "@/types/auth";
import AppearanceForm from "./AppearanceForm";
import DatabaseConnection from "./DatabaseConnection";
import SystemLog from "./SystemLog";

type TabKey = "backup" | "database" | "connection" | "log" | "theme";

const TABS: { key: TabKey; label: string; permission: Permission; /** Works while the database is down. */ setup?: boolean }[] = [
  { key: "backup", label: "Backup & Restore", permission: "backup.manage" },
  { key: "database", label: "Database", permission: "database.manage" },
  { key: "connection", label: "Database Connection", permission: "database.manage", setup: true },
  { key: "log", label: "System Log", permission: "database.manage", setup: true },
  { key: "theme", label: "Theme", permission: "appearance.manage" },
];

export default function SystemManagement() {
  const { user } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [dbReady, setDbReady] = useState(true);

  useEffect(() => {
    systemApi
      .status()
      .then((s) => setDbReady(s.database.ready))
      .catch(() => {});
  }, []);

  const tabs = TABS.filter((t) => user?.permissions.includes(t.permission));
  const requested = tabs.find((t) => t.key === params.get("tab"));
  // Without a database only the connection and the log work, so open the connection first.
  const tab = requested ?? (dbReady ? tabs[0] : (tabs.find((t) => t.key === "connection") ?? tabs[0]));
  const open = (key: TabKey) => router.replace(`${pathname}?tab=${key}`, { scroll: false });

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-slate-500">Settings / System Management</p>
        <h2 className="text-xl font-semibold text-slate-900">System Management</h2>
        <p className="text-sm text-slate-500">
          Backup &amp; restore, database maintenance and connection, the system event log, and the theme.
        </p>
      </div>

      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab?.key === t.key}
            onClick={() => open(t.key)}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap ${
              tab?.key === t.key
                ? "border-(--brand) text-(--brand)"
                : "border-transparent text-slate-500 hover:text-slate-700"
            } ${!dbReady && !t.setup ? "opacity-50" : ""}`}
            title={!dbReady && !t.setup ? "Needs the database" : undefined}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab?.key === "backup" && <SettingsBackup />}
      {tab?.key === "database" && <DatabaseMaintenance />}
      {tab?.key === "connection" && <DatabaseConnection onStatus={setDbReady} />}
      {tab?.key === "log" && <SystemLog />}
      {tab?.key === "theme" && <AppearanceForm />}
    </div>
  );
}

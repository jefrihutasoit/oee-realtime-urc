"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DatabaseZap, Loader2, Lock, LogOut } from "lucide-react";
import LicensePanel from "@/components/license/LicensePanel";
import { canOpen, isPublicPath } from "@/config/access";
import { useAppearance } from "@/lib/appearance";
import { logout, useAuth } from "@/lib/auth";
import { useLicense } from "@/lib/license";
import { systemApi } from "@/lib/system-api";
import type { LicenseStatus } from "@/types/license";
import type { SystemStatus } from "@/types/system";
import Sidebar from "./Sidebar";
import Header from "./Header";

const LOGIN_PATH = "/login";

function FullScreenLoader() {
  return (
    <div className="flex h-screen items-center justify-center text-slate-500">
      <Loader2 size={24} className="animate-spin" />
    </div>
  );
}

const STATUS_POLL_MS = 15_000;

/** Red bar while the backend cannot reach its database; links to the connection settings when allowed. */
function DatabaseBanner() {
  const { user } = useAuth();
  const [status, setStatus] = useState<SystemStatus | null>(null);

  useEffect(() => {
    let alive = true;
    const check = () =>
      systemApi
        .status()
        .then((s) => alive && setStatus(s))
        .catch(() => {});
    check();
    const timer = setInterval(check, STATUS_POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  if (!status || status.database.ready) return null;
  const canFix = user?.permissions.includes("database.manage");
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-red-600 px-4 py-2 text-sm text-white">
      <DatabaseZap size={16} className="shrink-0" />
      <span className="font-medium">Database not connected.</span>
      <span className="min-w-0 flex-1 opacity-90">{status.database.error}</span>
      {canFix ? (
        <Link href="/settings/system?tab=connection" className="font-semibold underline">
          Fix the connection
        </Link>
      ) : (
        <span className="opacity-90">Data is not saved or shown until it is back. Ask Engineering to check it.</span>
      )}
    </div>
  );
}

/** Full-screen lock while the system has no valid license. */
function LicenseScreen({ data }: { data: LicenseStatus }) {
  const { user } = useAuth();
  return (
    <div className="min-h-screen overflow-y-auto bg-(--app-bg) px-4 py-10">
      <div className="mx-auto max-w-xl space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">OEE Monitoring</p>
            <h1 className="text-2xl font-semibold text-slate-900">License required</h1>
            <p className="mt-1 text-sm text-slate-500">A valid license is required to use this application.</p>
          </div>
          {user && (
            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900"
            >
              <LogOut size={15} /> Sign out
            </button>
          )}
        </div>
        {user && <p className="text-xs text-slate-500">Signed in as {user.name}</p>}
        <LicensePanel data={data} />
      </div>
    </div>
  );
}

/** Machine monitoring pages: the menu folds away on its own there, to give the machines the room. */
const isMonitoringPath = (path: string) => path === "/dashboard/machine" || path.startsWith("/dashboard/machine/");

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const monitoring = isMonitoringPath(pathname);
  // The menu state elsewhere is kept; on the machine pages it starts collapsed each time they are opened
  // and can still be expanded with the menu button.
  const [collapsed, setCollapsed] = useState(false);
  const [monitorCollapsed, setMonitorCollapsed] = useState(true);
  const [wasMonitoring, setWasMonitoring] = useState(monitoring);
  if (wasMonitoring !== monitoring) {
    setWasMonitoring(monitoring);
    if (monitoring) setMonitorCollapsed(true);
  }
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuCollapsed = monitoring ? monitorCollapsed : collapsed;

  function toggleMenu() {
    if (!window.matchMedia("(min-width: 768px)").matches) setMobileOpen(true);
    else if (monitoring) setMonitorCollapsed((v) => !v);
    else setCollapsed((v) => !v);
  }

  return (
    <div className="flex h-screen">
      <Sidebar collapsed={menuCollapsed} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <DatabaseBanner />
        <Header onMenuClick={toggleMenu} />
        <main className="flex-1 overflow-y-auto p-4 md:p-5">{children}</main>
      </div>
    </div>
  );
}

/**
 * Guests may open the dashboards; other pages send them to the login page. Signed-in users only see
 * the pages their role can open.
 */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { status, user } = useAuth();
  const license = useLicense();
  const unlicensed = license.status === "ready" && !license.data.licensed;
  // Loads the saved theme and keeps <html data-theme> in step with it.
  useAppearance();
  const pathname = usePathname();
  const router = useRouter();
  const onLogin = pathname === LOGIN_PATH;
  const guestAllowed = isPublicPath(pathname);

  useEffect(() => {
    if (status === "anon" && !onLogin && !guestAllowed && !unlicensed) {
      router.replace(`${LOGIN_PATH}?next=${encodeURIComponent(pathname)}`);
    }
    if (status === "user" && onLogin) router.replace("/");
  }, [status, onLogin, guestAllowed, unlicensed, pathname, router]);

  if (onLogin) return status === "user" ? <FullScreenLoader /> : children;
  if (status === "loading" || license.status === "loading") return <FullScreenLoader />;
  // Without a license the backend blocks everything: only the hardware ID and the license import are shown.
  if (license.status === "ready" && !license.data.licensed) return <LicenseScreen data={license.data} />;
  if (status === "anon" && !guestAllowed) return <FullScreenLoader />;

  return (
    <Shell>
      {canOpen(user, pathname) ? (
        children
      ) : (
        <div className="flex flex-col items-center gap-3 py-24 text-center text-sm text-slate-500">
          <Lock size={28} className="text-slate-400" />
          <p className="font-medium text-slate-700">You do not have access to this page.</p>
          <Link href="/dashboard/machine" className="font-medium text-(--brand) hover:underline">
            Back to dashboard
          </Link>
        </div>
      )}
    </Shell>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  // The path and the session are only known in the browser.
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <AuthGate>{children}</AuthGate>
    </Suspense>
  );
}

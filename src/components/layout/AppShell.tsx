"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DatabaseZap, Loader2, Lock } from "lucide-react";
import { canOpen, isPublicPath } from "@/config/access";
import { useAppearance } from "@/lib/appearance";
import { useAuth } from "@/lib/auth";
import { systemApi } from "@/lib/system-api";
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

function Shell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  function toggleMenu() {
    if (window.matchMedia("(min-width: 768px)").matches) setCollapsed((v) => !v);
    else setMobileOpen(true);
  }

  return (
    <div className="flex h-screen">
      <Sidebar collapsed={collapsed} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
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
  // Loads the saved theme and keeps <html data-theme> in step with it.
  useAppearance();
  const pathname = usePathname();
  const router = useRouter();
  const onLogin = pathname === LOGIN_PATH;
  const guestAllowed = isPublicPath(pathname);

  useEffect(() => {
    if (status === "anon" && !onLogin && !guestAllowed) {
      router.replace(`${LOGIN_PATH}?next=${encodeURIComponent(pathname)}`);
    }
    if (status === "user" && onLogin) router.replace("/");
  }, [status, onLogin, guestAllowed, pathname, router]);

  if (onLogin) return status === "user" ? <FullScreenLoader /> : children;
  if (status === "loading" || (status === "anon" && !guestAllowed)) return <FullScreenLoader />;

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

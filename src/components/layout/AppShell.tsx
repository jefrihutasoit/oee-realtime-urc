"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { canOpen, isPublicPath } from "@/config/access";
import { useAuth } from "@/lib/auth";
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
          <Link href="/dashboard/machine" className="font-medium text-[#1E6FD9] hover:underline">
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

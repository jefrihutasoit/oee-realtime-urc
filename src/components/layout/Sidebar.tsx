"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { navigation, type NavItem } from "@/config/navigation";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

const base =
  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-blue-400";

function NavGroup({ item, pathname, collapsed }: { item: NavItem; pathname: string; collapsed: boolean }) {
  const Icon = item.icon;
  const childActive = item.children?.some((c) => isActive(pathname, c.href)) ?? false;
  const [open, setOpen] = useState(childActive);

  // Collapsed sidebar has no room for a submenu, so a group links straight to its first child.
  if (!item.children || collapsed) {
    const href = item.href ?? item.children![0].href;
    const active = item.children ? childActive : isActive(pathname, href);
    return (
      <Link
        href={href}
        title={collapsed ? item.label : undefined}
        className={`${base} ${collapsed ? "justify-center" : ""} ${
          active ? "bg-[#1E6FD9] text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"
        }`}
      >
        <Icon size={18} className="shrink-0" />
        {!collapsed && item.label}
      </Link>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`${base} ${childActive ? "text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}
      >
        <Icon size={18} className="shrink-0" />
        <span className="flex-1 text-left">{item.label}</span>
        <ChevronDown
          size={16}
          className={`transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <ul className="mt-1 ml-[1.35rem] border-l border-white/10 pl-3">
          {item.children.map((child) => {
            const active = isActive(pathname, child.href);
            return (
              <li key={child.href}>
                <Link
                  href={child.href}
                  className={`block rounded-md px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-blue-400 ${
                    active ? "font-medium text-blue-400" : "text-slate-400 hover:text-white"
                  }`}
                >
                  {child.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onClose: () => void;
}

function NavItems({ pathname, collapsed }: { pathname: string; collapsed: boolean }) {
  return navigation.map((item) => <NavGroup key={item.label} item={item} pathname={pathname} collapsed={collapsed} />);
}

function ActiveNavItems({ collapsed }: { collapsed: boolean }) {
  return <NavItems pathname={usePathname()} collapsed={collapsed} />;
}

export default function Sidebar({ collapsed, mobileOpen, onClose }: SidebarProps) {
  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={onClose} />}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-60 flex-col bg-[#0E1B2C] transition-[transform,width] motion-reduce:transition-none md:static md:translate-x-0 ${
          collapsed ? "md:w-[72px]" : ""
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="relative flex h-20 shrink-0 items-center justify-center border-b border-white/10 px-4">
          {collapsed ? (
            <span className="hidden text-2xl font-bold text-[#E4002B] md:block">UR</span>
          ) : null}
          <div className={`text-center ${collapsed ? "md:hidden" : ""}`}>
            <p className="flex items-baseline justify-center gap-1.5 leading-none">
              <span className="text-2xl font-bold text-[#E4002B]">UR</span>
              <span className="text-left text-[13px] leading-tight font-semibold text-[#E4002B]">
                Universal
                <br />
                Robina
              </span>
            </p>
            <p className="mt-1.5 text-xs text-slate-400">PT. URC Indonesia</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 text-slate-400 hover:text-white md:hidden"
            aria-label="Close navigation"
          >
            <X size={20} />
          </button>
        </div>

        <nav
          className="flex-1 space-y-1 overflow-y-auto p-3"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a")) onClose();
          }}
        >
          {/* The pathname of a dynamic route is only known at request time, so it must suspend. */}
          <Suspense fallback={<NavItems pathname="" collapsed={collapsed} />}>
            <ActiveNavItems collapsed={collapsed} />
          </Suspense>
        </nav>
      </aside>
    </>
  );
}

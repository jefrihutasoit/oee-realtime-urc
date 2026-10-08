"use client";

import { useSyncExternalStore } from "react";
import { Bell, ChevronDown, Menu } from "lucide-react";

// Snapshot is the current minute so the clock re-renders at most once per minute.
const currentMinute = () => Math.floor(Date.now() / 60_000);

function subscribe(onChange: () => void) {
  const id = setInterval(onChange, 5_000);
  return () => clearInterval(id);
}

function useNow() {
  const minute = useSyncExternalStore(subscribe, currentMinute, () => null);
  return minute === null ? null : new Date(minute * 60_000);
}

export default function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const now = useNow();

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 md:px-5">
      <button
        type="button"
        onClick={onMenuClick}
        className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
        aria-label="Toggle navigation"
      >
        <Menu size={20} />
      </button>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg leading-tight font-semibold text-slate-900">OEE Monitoring</h1>
        <p className="truncate text-xs text-slate-500">Real-time monitoring packaging machines</p>
      </div>

      <div className="hidden items-center gap-4 text-sm text-slate-600 tabular-nums sm:flex">
        {now && (
          <>
            <span>
              {now.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
            </span>
            <span>{now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
          </>
        )}
      </div>

      <button
        type="button"
        className="relative rounded-md p-2 text-slate-600 hover:bg-slate-100"
        aria-label="Notifications"
      >
        <Bell size={20} />
        <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-red-500" />
      </button>

      <button type="button" className="flex items-center gap-2.5 rounded-md py-1 pr-1 pl-1 hover:bg-slate-100">
        <span className="flex size-9 items-center justify-center rounded-full bg-[#1E3A5F] text-sm font-medium text-white">
          A
        </span>
        <span className="hidden text-left md:block">
          <span className="block text-sm leading-tight font-medium text-slate-900">Admin</span>
          <span className="block text-xs text-slate-500">Administrator</span>
        </span>
        <ChevronDown size={16} className="hidden text-slate-500 md:block" />
      </button>
    </header>
  );
}

"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { oeeBarColor, oeeWaitLabel, statusStyles } from "@/config/oee";
import { dashboardStatus, type LiveMachine } from "@/hooks/useLiveMachines";
import type { LiveStatus } from "@/types/oee";
import MachineInfoCard from "./MachineInfoCard";
import SkuImage from "./SkuImage";

const SHOW_DELAY_MS = 250;
const HIDE_DELAY_MS = 180;
/** Size of MachineInfoCard, to keep it inside the window. */
const POPOVER = { width: 256, height: 340 };

/**
 * Shows MachineInfoCard next to the dashboard card on hover, placed where it fits in the window.
 * The card is outside the card's link, so its own "Open machine details" link works.
 */
function useHoverPopover() {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [placement, setPlacement] = useState<{ right: boolean; above: boolean } | null>(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const show = (e: MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setPlacement({
        right: rect.left + POPOVER.width > window.innerWidth - 8,
        above: window.innerHeight - rect.bottom < POPOVER.height && rect.top > POPOVER.height,
      });
    }, SHOW_DELAY_MS);
  };
  const hide = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setPlacement(null), HIDE_DELAY_MS);
  };
  return [placement, show, hide] as const;
}

/** Status badge; `inactive` overrides the status for machines that are switched off in the registry. */
export function StatusPill({ status, inactive = false }: { status: LiveStatus | null; inactive?: boolean }) {
  if (inactive || !status) {
    return (
      <span className="inline-flex items-center rounded-md bg-slate-200/70 px-2 py-0.5 text-xs font-medium text-slate-500">
        {inactive ? "Inactive" : "No data"}
      </span>
    );
  }
  const s = statusStyles[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${s.pill}`}>
      <span className={`size-2 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export function OeeBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${oeeBarColor(value)}`} style={{ width: `${Math.min(value, 100)}%` }} />
    </div>
  );
}

/** OEE text for a machine with OEE enabled: the percentage, or a dash before the first calculation. */
export function oeeLabel(m: LiveMachine) {
  return m.live ? `${m.live.oee.toFixed(1)}%` : "—";
}

export default function MachineCard({ machine }: { machine: LiveMachine }) {
  const { live } = machine;
  const waitLabel = oeeWaitLabel(live);
  const [popover, showPopover, hidePopover] = useHoverPopover();

  const header = (
    <div className="flex items-center gap-2">
      <span className="truncate text-base font-semibold text-slate-900">{machine.machineNo}</span>
      <StatusPill status={dashboardStatus(machine.status)} inactive={!machine.isActive} />
      {machine.isActive && (
        <ChevronRight size={18} className="ml-auto text-slate-400 group-hover:text-[#1E6FD9]" aria-hidden />
      )}
    </div>
  );

  // Inactive machines are disabled everywhere: greyed out and not clickable.
  if (!machine.isActive) {
    return (
      <div
        aria-disabled="true"
        title={`${machine.machineName} – inactive`}
        className="cursor-not-allowed rounded-xl border border-dashed border-slate-300 bg-slate-100 p-3 opacity-60 grayscale"
      >
        {header}
        <p className="mt-2 truncate text-xs text-slate-500">{machine.machineName}</p>
        <p className="text-xs text-slate-400">Machine disabled</p>
      </div>
    );
  }

  return (
    <div className="relative" onMouseEnter={showPopover} onMouseLeave={hidePopover}>
      <Link
        href={`/dashboard/machine/${encodeURIComponent(machine.id)}`}
        className="group block rounded-xl border border-slate-200 bg-white p-3 transition-shadow hover:border-blue-200 hover:shadow-md focus-visible:outline-2 focus-visible:outline-blue-500"
      >
        {header}

        {machine.oeeEnabled ? (
          <div className="mt-2 flex items-end gap-3">
            <div className="min-w-0 flex-1">
              <p
                className={`font-semibold tabular-nums ${live ? "text-lg text-slate-900" : "py-0.5 text-sm text-slate-400"}`}
              >
                {oeeLabel(machine)}
              </p>
              <div className="mt-1.5">
                <OeeBar value={live?.oee ?? 0} />
              </div>
              {waitLabel && <p className="mt-1 truncate text-[11px] font-medium text-amber-600">{waitLabel}</p>}
            </div>
            <SkuImage sku={live?.sku} className="h-10 w-10" />
          </div>
        ) : (
          // Status-only machine: no OEE figures at all.
          <div className="mt-2">
            <p className="truncate text-sm text-slate-600">{machine.machineName}</p>
            <p className="text-xs text-slate-400">Status only</p>
          </div>
        )}
      </Link>
      {popover && (
        <div
          className={`absolute z-30 ${popover.right ? "right-0" : "left-0"} ${
            popover.above ? "bottom-full pb-2" : "top-full pt-2"
          }`}
        >
          <MachineInfoCard machine={{ ...machine, status: dashboardStatus(machine.status) }} />
        </div>
      )}
    </div>
  );
}

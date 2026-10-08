import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { oeeBarColor, oeeWaitLabels, statusStyles } from "@/config/oee";
import type { LiveMachine } from "@/hooks/useLiveMachines";
import { assetUrl } from "@/lib/api";
import type { MachineStatus, Sku } from "@/types/oee";

const DEFAULT_PRODUCT_IMAGE = "/products/sku-1.svg";

/** SKU photo from the backend, or the local placeholder pack. */
export function SkuImage({ sku, className }: { sku: Sku | undefined; className: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- photos are served by the backend
    <img
      src={assetUrl(sku?.image ?? null) ?? DEFAULT_PRODUCT_IMAGE}
      alt={sku?.name ?? "No active SKU"}
      title={sku && sku.code !== "-" ? `${sku.code} · ${sku.name}` : sku?.name}
      className={`shrink-0 object-contain ${className}`}
    />
  );
}

/** Status badge; `inactive` overrides the status for machines that are switched off in the registry. */
export function StatusPill({ status, inactive = false }: { status: MachineStatus | null; inactive?: boolean }) {
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

  const header = (
    <div className="flex items-center gap-2">
      <span className="truncate text-base font-semibold text-slate-900">{machine.machineNo}</span>
      <StatusPill status={machine.status} inactive={!machine.isActive} />
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
    <Link
      href={`/dashboard/machine/${encodeURIComponent(machine.id)}`}
      title={`${machine.machineName} – open details`}
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
            {live?.waitingFor && (
              <p className="mt-1 truncate text-[11px] font-medium text-amber-600">{oeeWaitLabels[live.waitingFor]}</p>
            )}
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
  );
}

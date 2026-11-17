import { Factory, Package, X } from "lucide-react";
import { OEE_TARGET, statusStyles } from "@/config/oee";
import { dashboardStatus, type LiveMachine } from "@/hooks/useLiveMachines";
import { withUnit } from "@/lib/production-units";
import type { LiveStatus } from "@/types/oee";

const fmt = new Intl.NumberFormat("en-US");

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-3 rounded-xl border border-slate-200 bg-surface px-4 py-3 ${className}`}>
      {children}
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xl leading-tight font-semibold text-slate-900 tabular-nums">{value}</p>
      <p className="truncate text-xs text-slate-500">{label}</p>
    </div>
  );
}

function OeeRing({ value }: { value: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 44 44" className="size-11 shrink-0 -rotate-90" aria-hidden>
      <circle cx="22" cy="22" r={r} fill="none" style={{ stroke: "var(--color-slate-200)" }} strokeWidth="5" />
      <circle
        cx="22"
        cy="22"
        r={r}
        fill="none"
        stroke="#22A447"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(value, 100) / 100)}
      />
    </svg>
  );
}

/**
 * Run / Stop / Off counts of the machines given; the machine status is shown for both categories together.
 * Machines with OEE disabled are left out.
 */
export function StatusCounts({ machines }: { machines: LiveMachine[] }) {
  const included = machines.filter((m) => m.isActive && m.oeeEnabled);
  const count = (st: LiveStatus) => included.filter((m) => dashboardStatus(m.status) === st).length;
  return (
    <Card className="justify-around divide-x divide-slate-200">
      <p className="pr-3 text-xs font-medium text-slate-500">
        Machine Status
        <span className="block font-normal text-slate-400">all categories · {included.length}</span>
      </p>
      {(["RUN", "STOP", "OFF"] as const).map((st) => (
        <div key={st} className="flex-1 px-2 text-center">
          <p className="flex items-center justify-center gap-1.5 text-sm text-slate-600">
            <span className={`size-2.5 rounded-full ${statusStyles[st].dot}`} />
            {statusStyles[st].label}
          </p>
          <p className="text-xl font-semibold text-slate-900 tabular-nums">{count(st)}</p>
        </div>
      ))}
    </Card>
  );
}

/**
 * Live totals of one machine category (Bagger or Machine Packaging; `machines` holds only that category):
 * machine count, OEE, output and reject. Only active machines with OEE enabled count. The status counts are
 * shown once for both categories (`StatusCounts`).
 */
export default function SummaryCards({ machines, label }: { machines: LiveMachine[]; label: string }) {
  const included = machines.filter((m) => m.isActive && m.oeeEnabled);
  const notCounted = machines.length - included.length;
  const live = included.flatMap((m) => (m.live ? [m.live] : []));
  // Machines that have not counted anything yet (e.g. waiting for a SKU) would pull the average to 0.
  const counted = live.filter((m) => m.countedSeconds > 0);
  const avgOee = counted.length ? counted.reduce((s, m) => s + m.oee, 0) / counted.length : 0;
  const output = live.reduce((s, m) => s + m.output, 0);
  const reject = live.reduce((s, m) => s + m.reject, 0);
  // A total shows a unit only when every machine in it uses the same one.
  const withLive = included.filter((m) => m.live);
  const common = (units: string[]) => (units.length && units.every((u) => u === units[0]) ? units[0] : "");
  const outputUnit = common(withLive.map((m) => m.outputUnit));
  const rejectUnit = common(withLive.map((m) => m.rejectUnit));

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1.4fr_1.3fr_1.3fr]">
      <Card>
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-(--brand)">
          <Factory size={24} />
        </span>
        <Metric
          value={String(included.length)}
          label={notCounted ? `Active ${label} · ${notCounted} not counted` : `Active ${label}`}
        />
      </Card>

      <Card>
        <OeeRing value={avgOee} />
        <Metric value={`${avgOee.toFixed(1)}%`} label={`OEE (${counted.length} ${counted.length === 1 ? "machine" : "machines"})`} />
        <div className="ml-auto border-l border-slate-200 pl-3 text-center">
          <p className="text-xs text-slate-500">Target</p>
          <p className="text-sm font-medium text-slate-700">{OEE_TARGET}%</p>
          <span className="mx-auto mt-0.5 block h-3 w-0.5 rounded bg-emerald-500" />
        </div>
      </Card>

      <Card>
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-(--brand)">
          <Package size={24} />
        </span>
        <Metric value={withUnit(fmt.format(output), outputUnit)} label="Total Output (Shift)" />
      </Card>

      <Card>
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-red-500 text-white">
          <X size={24} strokeWidth={3} />
        </span>
        <Metric value={withUnit(fmt.format(reject), rejectUnit)} label="Total Reject (Shift)" />
      </Card>
    </div>
  );
}

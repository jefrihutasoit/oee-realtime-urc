"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { OEE_TARGET, oeeWaitLabels, statusStyles } from "@/config/oee";
import { SkuImage, StatusPill } from "@/components/dashboard/MachineCard";
import { useMachineDetail } from "@/hooks/useMachineDetail";
import type { MachineHistory } from "@/types/oee";
import OperationTimeline, { duration } from "./OperationTimeline";

const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function Card({
  title,
  aside,
  children,
  className = "",
}: {
  title?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`overflow-hidden rounded-xl border border-slate-200 bg-white ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {aside && <span className="text-xs text-slate-400">{aside}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

function Ring({ label, value, color }: { label: string; value: number; color: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative size-16">
        <svg viewBox="0 0 64 64" className="size-16 -rotate-90" aria-hidden>
          <circle cx="32" cy="32" r={r} fill="none" stroke="#E2E8F0" strokeWidth="6" />
          <circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - Math.min(value, 100) / 100)}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-slate-900 tabular-nums">
          {value.toFixed(1)}%
        </span>
      </div>
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  );
}

function Stat({ label, value, sub, tone = "text-slate-900" }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-base font-semibold tabular-nums ${tone}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
    </div>
  );
}

/** Output & reject log and status event log. Status-only machines get the event log alone. */
function Logs({ history, showProduction }: { history: MachineHistory | null; showProduction: boolean }) {
  const [selected, setSelected] = useState<"production" | "events">("production");
  const tab = showProduction ? selected : "events";
  const tabs = (
    [
      ["production", "Output & Reject Log"],
      ["events", "Event Log"],
    ] as const
  ).filter(([key]) => showProduction || key === "events");
  const empty = (text: string) => <p className="px-4 py-6 text-center text-sm text-slate-500">{text}</p>;
  const th = "sticky top-0 bg-slate-50 px-4 py-2 font-medium";

  return (
    <Card>
      <div role="tablist" className="flex gap-1 border-b border-slate-100 px-2">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setSelected(key)}
            className={`border-b-2 px-3 py-2.5 text-sm font-medium ${
              tab === key ? "border-[#1E6FD9] text-[#1E6FD9]" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="max-h-72 overflow-auto">
        {!history ? (
          empty("Loading…")
        ) : tab === "production" ? (
          history.production.length === 0 ? (
            empty("No output or reject readings yet.")
          ) : (
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className={th}>Time</th>
                  <th className={th}>Type</th>
                  <th className={`${th} text-right`}>Quantity (pcs)</th>
                  <th className={`${th} text-right`}>Counter</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {history.production.map((e) => (
                  <tr key={`${e.type}-${e.id}`}>
                    <td className="px-4 py-1.5 text-slate-600">{dateTimeFmt.format(new Date(e.timestamp))}</td>
                    <td className="px-4 py-1.5">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          e.type === "OUTPUT" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                        }`}
                      >
                        {e.type === "OUTPUT" ? "Output" : "Reject"}
                      </span>
                    </td>
                    <td className="px-4 py-1.5 text-right font-medium text-slate-900">+{fmt.format(e.quantity)}</td>
                    <td className="px-4 py-1.5 text-right text-slate-500">{fmt.format(e.counter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : history.events.length === 0 ? (
          empty("No status changes yet.")
        ) : (
          <table className="w-full min-w-[400px] text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className={th}>Time</th>
                <th className={th}>Status</th>
                <th className={`${th} text-right`}>Tag value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {history.events.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-1.5 text-slate-600">{dateTimeFmt.format(new Date(e.timestamp))}</td>
                  <td className="px-4 py-1.5">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusStyles[e.status].pill}`}>
                      {statusStyles[e.status].label}
                    </span>
                  </td>
                  <td className="px-4 py-1.5 text-right font-mono text-slate-700">{e.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}

export default function MachineDetail({ id }: { id: string }) {
  const { machine, error, live, monitoring, history, timeline, skus, connected, reload } = useMachineDetail(id);

  if (!machine) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-sm text-slate-500">
        {error ? (
          <>
            <p className="text-red-600">{error}</p>
            <div className="flex gap-4">
              <button type="button" onClick={reload} className="font-medium text-[#1E6FD9] hover:underline">
                Retry
              </button>
              <Link href="/dashboard/machine" className="font-medium text-[#1E6FD9] hover:underline">
                Back to machines
              </Link>
            </div>
          </>
        ) : (
          <>
            <Loader2 size={22} className="animate-spin" />
            Loading machine…
          </>
        )}
      </div>
    );
  }

  const { isActive, oeeEnabled } = machine;
  const status = isActive ? (live?.status ?? null) : null;
  // OEE figures only exist for active machines with OEE enabled.
  const oee = isActive && oeeEnabled && live?.oeeEnabled ? live : null;
  const showOee = isActive && oeeEnabled;
  const productCode = oee && oee.sku.code !== "-" ? oee.sku.code : null;
  const sku = productCode ? skus.find((s) => s.skuId.toLowerCase() === productCode.toLowerCase()) : undefined;
  const oeeColor = oee ? (oee.oee >= OEE_TARGET ? "#22A447" : oee.oee >= 60 ? "#F5A524" : "#E5484D") : "#94A3B8";

  const realtimeTags = (
    <Card
      title="Realtime Tags"
      aside={monitoring ? `Updated ${timeFmt.format(new Date(monitoring.updatedAt))}` : undefined}
      className="h-fit"
    >
      {machine.monitoringTags.length === 0 ? (
        <p className="px-4 py-4 text-sm text-slate-500">
          No realtime tags registered.{" "}
          <Link href="/settings/machines" className="text-[#1E6FD9] hover:underline">
            Add in Machine Management
          </Link>
        </p>
      ) : (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            {machine.monitoringTags.map((t) => {
              const v = isActive ? monitoring?.values.find((x) => x.id === t.id)?.value : undefined;
              return (
                <tr key={t.id} title={t.tagName} className="hover:bg-slate-50">
                  <td className="px-4 py-2 text-slate-600">{t.name}</td>
                  <td className="px-4 py-2 text-right font-mono font-semibold text-slate-900 tabular-nums">
                    {v === null || v === undefined ? "—" : fmt.format(v)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );

  const timelineCard = (
    <Card
      title="Timeline Operation"
      aside={timeline ? `${timeline.shift.name} · ${timeline.shift.startLabel}–${timeline.shift.endLabel}` : undefined}
    >
      <div className="px-4 py-3">
        <OperationTimeline data={timeline} />
      </div>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link
          href="/dashboard/machine"
          aria-label="Back to machines"
          className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-[#1E6FD9]"
        >
          <ArrowLeft size={18} />
        </Link>
        <h2 className={`text-xl font-semibold ${isActive ? "text-[#1E3A5F]" : "text-slate-400"}`}>{machine.machineNo}</h2>
        <span className="text-sm text-slate-500">{machine.machineName}</span>
        <StatusPill status={status} inactive={!isActive} />
        {isActive && (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
              connected ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
            }`}
          >
            <span className={`size-1.5 rounded-full ${connected ? "animate-pulse bg-emerald-500" : "bg-slate-400"}`} />
            {connected ? "Live" : "Offline"}
          </span>
        )}
        {isActive && !oeeEnabled && (
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Status only · OEE disabled</span>
        )}
      </div>

      {!isActive && (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-600">
          This machine is <strong>inactive</strong>: it is not monitored and does not count in any total.{" "}
          <Link href="/settings/machines" className="font-medium text-[#1E6FD9] hover:underline">
            Activate it in Machine Management
          </Link>
        </p>
      )}

      {/* Inactive machines are shown greyed out and cannot be interacted with. */}
      <div inert={!isActive} className={`space-y-4 ${isActive ? "" : "opacity-50 grayscale"}`}>
        {showOee ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            {realtimeTags}

            <div className="space-y-4">
              <Card>
                <div className="flex items-center gap-4 p-4">
                  <div className="flex size-20 shrink-0 items-center justify-center rounded-lg bg-slate-50 p-1.5">
                    <SkuImage sku={oee?.sku} className="h-full w-full" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-500">Current product</p>
                    <p className="truncate font-semibold text-slate-900">
                      {sku?.productName ?? oee?.sku.name ?? "No active SKU"}
                    </p>
                    <dl className="mt-1.5 grid grid-cols-3 gap-3 text-sm">
                      <div className="min-w-0">
                        <dt className="text-xs text-slate-500">SKU ID</dt>
                        <dd className="truncate font-mono text-slate-900">{productCode ?? "—"}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-xs text-slate-500">SKU</dt>
                        <dd className="truncate text-slate-900">{sku?.sku ?? "—"}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-xs text-slate-500">Target</dt>
                        <dd className="truncate text-slate-900">
                          {sku ? `${fmt.format(sku.outputPerMinute)}/min` : "—"}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
                <div className="grid grid-cols-2 divide-slate-100 border-t border-slate-100 sm:grid-cols-4 sm:divide-x">
                  <Stat
                    label="Output"
                    value={oee ? `${fmt.format(oee.output)} pcs` : "—"}
                    sub={oee ? `Ideal ${fmt.format(oee.idealOutput)} pcs` : undefined}
                  />
                  <Stat label="Reject" value={oee ? `${fmt.format(oee.reject)} pcs` : "—"} tone="text-red-600" />
                  <Stat label="Uptime" value={oee ? duration(oee.uptimeSeconds) : "—"} tone="text-emerald-700" />
                  <Stat
                    label="Stop (breakdown)"
                    value={oee ? duration(oee.stopSeconds) : "—"}
                    sub={oee ? `${oee.stopCount}× stopped` : undefined}
                    tone="text-amber-600"
                  />
                </div>
              </Card>

              <Card
                title="OEE (Current Calculation)"
                aside={
                  oee?.runStart
                    ? `Since ${timeFmt.format(new Date(oee.runStart))}${oee.runSku ? ` · SKU ${oee.runSku}` : ""} · Target ${OEE_TARGET}%`
                    : `Target ${OEE_TARGET}%`
                }
              >
                {oee?.waitingFor && (
                  <p className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-700">
                    Not counting: {oeeWaitLabels[oee.waitingFor]}
                    {oee.waitingFor === "UNREGISTERED_SKU" && ` (${oee.sku.code}) – add it in SKU Management`}
                  </p>
                )}
                {oee ? (
                  <div className="grid grid-cols-4 gap-2 px-4 py-4">
                    <Ring label="Availability" value={oee.availability} color="#22A447" />
                    <Ring label="Performance" value={oee.performance} color="#1E6FD9" />
                    <Ring label="Quality" value={oee.quality} color="#F5A524" />
                    <Ring label="OEE" value={oee.oee} color={oeeColor} />
                  </div>
                ) : (
                  <p className="px-4 py-5 text-center text-sm text-slate-500">Waiting for the first OEE calculation…</p>
                )}
              </Card>

              {timelineCard}
            </div>
          </div>
        ) : (
          <>
            {realtimeTags}
            {timelineCard}
          </>
        )}

        <Logs history={history} showProduction={showOee} />
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, Box, Factory, FileSpreadsheet, Loader2, RefreshCw, X } from "lucide-react";
import { buttonStyles } from "@/components/ui/Modal";
import { downtimeTypeColors, downtimeTypeLabel, minutesLabel } from "@/config/downtime";
import { OEE_TARGET, statusStyles } from "@/config/oee";
import { useLiveMachines } from "@/hooks/useLiveMachines";
import { useMachineLabel } from "@/lib/machine-label";
import { todayYmd } from "@/lib/reject-sheet";
import { summaryApi } from "@/lib/summary-api";
import { useProductionUnits, withUnit } from "@/lib/production-units";
import type { DailySummary } from "@/types/summary";
import { Donut, OeeTrendChart, OutputRejectChart } from "./SummaryCharts";

const fmt = new Intl.NumberFormat("en-US");
const dateFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** Today's summary is fetched again this often; other dates once. */
const LIVE_REFRESH_MS = 30_000;
const STATUS_COLORS = { RUN: "#22c55e", STOP: "#f59e0b", OFF: "#64748b" } as const;
const RANK_COLORS = ["#E5484D", "#F59E0B", "#EAB308"];
const KPI_LABEL = "text-sm font-medium tracking-wide text-slate-500 uppercase";
const KPI_VALUE = "text-3xl leading-tight font-bold text-slate-900 tabular-nums";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-slate-200 bg-surface p-4 ${className}`}>{children}</div>;
}

function Title({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-base font-semibold text-slate-900">{children}</h3>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

/** Marks figures that come from the uploaded downtime file. */
function FromUpload() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-(--brand)">
      <FileSpreadsheet size={11} />
      From upload
    </span>
  );
}

/** Top-3 ranking with a bar per item, sized against the largest. */
function Ranking({
  items,
  empty,
}: {
  items: { label: string; value: string; amount: number; share: number; color?: string }[];
  empty: string;
}) {
  if (!items.length) return <p className="py-6 text-center text-sm text-slate-400">{empty}</p>;
  const max = Math.max(...items.map((i) => i.amount), 1);
  return (
    <ol className="space-y-3">
      {items.map((it, i) => (
        <li key={it.label} className="grid grid-cols-[26px_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-3 text-[15px]">
          <span
            className="flex size-[26px] items-center justify-center rounded-full text-xs font-bold text-white"
            style={{ background: it.color ?? RANK_COLORS[i] }}
          >
            {i + 1}
          </span>
          <span className="truncate text-slate-700" title={it.label}>
            {it.label}
          </span>
          <span className="h-2.5 rounded-full bg-slate-100">
            <span
              className="block h-full rounded-full"
              style={{ width: `${(it.amount / max) * 100}%`, background: it.color ?? RANK_COLORS[i] }}
            />
          </span>
          <span className="text-right whitespace-nowrap tabular-nums">
            <span className="text-base font-bold text-slate-900">{it.value}</span>
            <span className="ml-2 text-xs text-slate-500">{it.share.toFixed(1)}%</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function Summary() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const today = todayYmd();
  const date = params.get("date") || today;
  const isToday = date === today;

  const [data, setData] = useState<DailySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { machines } = useLiveMachines();
  const name = useMachineLabel();
  const unitsOf = useProductionUnits();

  // One request per date; today's is repeated every LIVE_REFRESH_MS.
  const load = useCallback(() => {
    summaryApi
      .daily(date)
      .then((s) => {
        setData(s);
        setError(null);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [date]);

  useEffect(() => {
    load();
    if (!isToday) return;
    const timer = setInterval(load, LIVE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [load, isToday]);

  const setDate = (d: string) => router.replace(d && d !== today ? `${pathname}?date=${d}` : pathname);


  // Live machine status (today only). Breakdown is the Off of the status tag here.
  const live = useMemo(() => {
    const active = (machines ?? []).filter((m) => m.isActive && m.status);
    const count = (st: "RUN" | "STOP" | "OFF") =>
      active.filter((m) => (m.status === "BREAKDOWN" ? "OFF" : m.status) === st).length;
    return { RUN: count("RUN"), STOP: count("STOP"), OFF: count("OFF"), total: active.length };
  }, [machines]);

  const colorOf = useMemo(() => downtimeTypeColors(data?.downtime.byType.map((t) => t.type) ?? []), [data]);

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Summary</h2>
        <p className="text-sm text-slate-500">
          {dateFmt.format(new Date(`${date}T00:00:00`))}
          {data && ` · production day ${timeFmt.format(new Date(data.dayStart)).slice(0, 5)} – ${timeFmt.format(new Date(data.dayEnd)).slice(0, 5)}`}
          {isToday && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" /> Realtime
            </span>
          )}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {!isToday && (
          <button type="button" onClick={() => setDate(today)} className={buttonStyles.secondary}>
            Today
          </button>
        )}
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Production date"
          className="h-9 rounded-lg border border-slate-200 bg-surface px-3 text-sm focus:border-blue-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            load();
          }}
          disabled={loading}
          className={`${buttonStyles.secondary} w-9 px-0`}
          aria-label="Refresh"
          title={data ? `Updated ${timeFmt.format(new Date(data.generatedAt))}` : "Refresh"}
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : undefined} />
        </button>
      </div>
    </div>
  );

  if (!data || data.date !== date) {
    return (
      <div className="space-y-4">
        {header}
        <div className="flex flex-col items-center gap-3 py-24 text-sm text-slate-500">
          {error ? (
            <>
              <p className="text-red-600">{error}</p>
              <button type="button" onClick={load} className="font-medium text-(--brand) hover:underline">
                Retry
              </button>
            </>
          ) : (
            <>
              <Loader2 size={22} className="animate-spin" />
              Loading summary…
            </>
          )}
        </div>
      </div>
    );
  }

  // Common unit of the machines in this summary; "" when they use different units.
  const units = unitsOf(data.machines.map((m) => m.machineId));
  const rejectPct = data.output > 0 ? (data.reject / data.output) * 100 : 0;
  const rejectTotal = data.rejectByType.reduce((s, r) => s + r.quantity, 0);
  const ranked = data.machines.filter((m) => m.oee !== null).sort((a, b) => a.oee! - b.oee!);
  const lowest = ranked[0];
  const top = ranked.at(-1);
  const statusSlices = isToday
    ? (["RUN", "STOP", "OFF"] as const).map((st) => ({ label: statusStyles[st].label, value: live[st], color: STATUS_COLORS[st] }))
    : (["RUN", "STOP", "OFF"] as const).map((st) => ({
        label: statusStyles[st].label,
        value: data.statusSeconds[st],
        color: STATUS_COLORS[st],
      }));
  const statusTotal = statusSlices.reduce((s, x) => s + x.value, 0);
  const oee = data.oee.oee;

  return (
    <div className="space-y-4">
      {header}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1.3fr_1.3fr_1.3fr_1.6fr]">
        <Card className="flex items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-(--brand)">
            <Factory size={30} />
          </span>
          <div>
            <p className={KPI_LABEL}>Total {name.many}</p>
            <p className={KPI_VALUE}>{data.activeMachines}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-4">
          <Donut
            className="size-20"
            slices={[
              { label: "OEE", value: oee ?? 0, color: (oee ?? 0) >= OEE_TARGET ? "#22A447" : (oee ?? 0) >= 60 ? "#F5A524" : "#E5484D" },
              { label: "Rest", value: 100 - Math.min(oee ?? 0, 100), color: "#f1f5f9" },
            ]}
            center=""
            sub=""
          />
          <div className="min-w-0">
            <p className={KPI_LABEL}>OEE (All {name.many})</p>
            <p className={KPI_VALUE}>{oee === null ? "—" : `${oee.toFixed(1)}%`}</p>
            <p className="text-xs text-slate-500">
              Target {OEE_TARGET}% · {data.oee.machines} {name.many.toLowerCase()}
            </p>
            {oee !== null && (
              <p className="text-xs font-medium text-slate-600 tabular-nums">
                A {data.oee.availability}% · P {data.oee.performance}% · Q {data.oee.quality}%
              </p>
            )}
          </div>
        </Card>
        <Card className="flex items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-(--brand)">
            <Box size={30} />
          </span>
          <div className="min-w-0">
            <p className={KPI_LABEL}>Total Output</p>
            <p className={KPI_VALUE}>
              {fmt.format(data.output)}
              {units.output && <span className="ml-1.5 text-base font-medium text-slate-500">{units.output}</span>}
            </p>
          </div>
        </Card>
        <Card className="flex items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-red-500 text-white">
            <X size={30} strokeWidth={3} />
          </span>
          <div className="min-w-0">
            <p className={KPI_LABEL}>Total Reject</p>
            <p className={KPI_VALUE}>
              {fmt.format(data.reject)}
              {units.reject && <span className="ml-1.5 text-base font-medium text-slate-500">{units.reject}</span>}
            </p>
            <p className="text-xs font-medium text-red-600">
              {rejectPct.toFixed(1)}% of total output
              <span className="ml-1 text-slate-400">
                (tag {fmt.format(data.rejectTag)} · input {fmt.format(data.rejectInput)})
              </span>
            </p>
          </div>
        </Card>
        <Card className="sm:col-span-2 xl:col-span-1">
          <p className={`mb-2 ${KPI_LABEL}`}>
            {name.one} Status{" "}
            <span className="font-normal normal-case text-slate-400">{isToday ? "now" : "time share"}</span>
          </p>
          <div className="flex justify-around divide-x divide-slate-200">
            {statusSlices.map((s) => (
              <div key={s.label} className="flex-1 px-2 text-center">
                <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-slate-600">
                  <span className="size-3 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </p>
                <p className="text-3xl font-bold text-slate-900 tabular-nums">
                  {isToday ? s.value : statusTotal ? `${Math.round((s.value / statusTotal) * 100)}%` : "—"}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Trends */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Card>
          <Title sub={`Per hour, all ${name.many.toLowerCase()}`}>OEE Trend</Title>
          <OeeTrendChart data={data.hourly} />
        </Card>
        <Card>
          <Title sub="Per hour; reject input is spread over its shift by output">Output vs Reject</Title>
          <OutputRejectChart data={data.hourly} units={units} />
        </Card>
      </div>

      {/* Rankings */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr_0.9fr]">
        <Card>
          <Title sub="Top 3 reject types (Reject Input)">Top Reject</Title>
          <Ranking
            empty="No reject input for this date"
            items={data.rejectByType.slice(0, 3).map((r) => ({
              label: r.name,
              value: withUnit(fmt.format(r.quantity), units.reject),
              amount: r.quantity,
              share: rejectTotal ? (r.quantity / rejectTotal) * 100 : 0,
            }))}
          />
        </Card>
        <Card>
          <Title sub={`${name.one} status vs downtime file`}>Downtime</Title>
          <div className="space-y-4">
            {/* Two sources side by side on one scale; they are compared, not added. */}
            <div className="space-y-2.5">
              {[
                {
                  key: "machines",
                  label: `From ${name.many.toLowerCase()}`,
                  hint: "Stop / Breakdown status",
                  seconds: data.machineDowntimeSeconds,
                  parts: [{ key: "machines", seconds: data.machineDowntimeSeconds, color: STATUS_COLORS.STOP, title: "Stop / Breakdown" }],
                },
                {
                  key: "upload",
                  label: "From upload",
                  hint: "Downtime file",
                  seconds: data.downtime.totalSeconds,
                  parts: data.downtime.byType.map((t) => ({
                    key: t.type,
                    seconds: t.seconds,
                    color: colorOf(t.type),
                    title: downtimeTypeLabel(t.type),
                  })),
                },
              ].map((src) => {
                const scale = Math.max(data.machineDowntimeSeconds, data.downtime.totalSeconds, 1);
                return (
                  <div key={src.key}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="text-slate-600">
                        <span className="font-medium text-slate-800">{src.label}</span> · {src.hint}
                      </span>
                      <span className="text-xl font-bold text-slate-900 tabular-nums">{minutesLabel(src.seconds)}</span>
                    </div>
                    <div className="mt-1 h-3 rounded-full bg-slate-100">
                      <div className="flex h-full gap-0.5 overflow-hidden rounded-full" style={{ width: `${(src.seconds / scale) * 100}%` }}>
                        {src.parts.map((p) => (
                          <div
                            key={p.key}
                            title={`${p.title}: ${minutesLabel(p.seconds)}`}
                            style={{ width: `${(p.seconds / (src.seconds || 1)) * 100}%`, background: p.color }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
              {data.downtime.byType.length > 0 && (
                <div className="flex flex-wrap gap-x-3 text-[11px] text-slate-600">
                  {data.downtime.byType.map((t) => (
                    <span key={t.type} className="inline-flex items-center gap-1">
                      <span className="size-2 rounded-full" style={{ background: colorOf(t.type) }} />
                      {t.type || "Other"} ({Math.round((t.seconds / (data.downtime.totalSeconds || 1)) * 100)}%)
                    </span>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-slate-400">Two sources of the same downtime, compared, not added.</p>
            </div>

            <div className="border-t border-slate-100 pt-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs text-slate-500">Top Downtime by category</p>
                <FromUpload />
              </div>
              <Ranking
                empty="No downtime uploaded for this date"
                items={data.downtime.byType.slice(0, 3).map((t) => ({
                  label: downtimeTypeLabel(t.type),
                  value: minutesLabel(t.seconds),
                  amount: t.seconds,
                  share: (t.seconds / (data.downtime.totalSeconds || 1)) * 100,
                  color: colorOf(t.type),
                }))}
              />
            </div>
          </div>
        </Card>
        <Card className="flex flex-col">
          <Title sub={isToday ? `${name.many} by current status` : `Status time of all ${name.many.toLowerCase()}`}>
            {name.one} Status Distribution
          </Title>
          <div className="flex flex-1 flex-wrap items-center justify-center gap-x-6 gap-y-4">
            <Donut
              className="size-44"
              slices={statusSlices}
              center={isToday ? String(live.total) : minutesLabel(statusTotal / (data.activeMachines || 1))}
              sub={isToday ? name.many : `avg / ${name.one.toLowerCase()}`}
            />
            <ul className="min-w-44 flex-1 space-y-3">
              {statusSlices.map((s) => {
                const share = statusTotal ? (s.value / statusTotal) * 100 : 0;
                return (
                  <li key={s.label}>
                    <div className="flex items-baseline gap-2">
                      <span className="size-3 shrink-0 self-center rounded-full" style={{ background: s.color }} />
                      <span className="text-[15px] font-medium text-slate-700">{s.label}</span>
                      <span className="ml-auto text-2xl font-bold text-slate-900 tabular-nums">
                        {isToday ? s.value : minutesLabel(s.value)}
                      </span>
                      <span className="w-12 text-right text-sm font-medium text-slate-500 tabular-nums">
                        {statusTotal ? `${share.toFixed(0)}%` : ""}
                      </span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-slate-100">
                      <div className="h-full rounded-full" style={{ width: `${share}%`, background: s.color }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </Card>
      </div>

      {/* Lowest / top machine */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {[
          { label: `Lowest OEE ${name.one}`, m: lowest, icon: <ArrowDown size={22} />, color: "#E5484D" },
          { label: `Top OEE ${name.one}`, m: top, icon: <ArrowUp size={22} />, color: "#22A447" },
        ].map(({ label, m, icon, color }) => (
          <Card key={label} className="flex items-center gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-full text-white" style={{ background: color }}>
              {icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className={KPI_LABEL}>{label}</p>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-3xl font-bold text-slate-900">{m?.machineNo ?? "—"}</p>
                <p className="text-2xl font-bold text-slate-900 tabular-nums">{m ? `${m.oee!.toFixed(1)}%` : ""}</p>
              </div>
              <div className="mt-1.5 h-2.5 rounded-full bg-slate-100">
                <div className="h-full rounded-full" style={{ width: `${Math.min(m?.oee ?? 0, 100)}%`, background: color }} />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

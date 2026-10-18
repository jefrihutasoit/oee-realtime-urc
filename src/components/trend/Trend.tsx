"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, ChartLine, Layers, LayoutGrid, Loader2, RefreshCw, RotateCcw, X } from "lucide-react";
import { buttonStyles } from "@/components/ui/Modal";
import { machineApi } from "@/lib/machine-api";
import { useMachineLabel } from "@/lib/machine-label";
import type { MachineRegistration } from "@/types/machine";
import type { MachineTrend, TrendSignal } from "@/types/trend";
import TrendChart, {
  STATUS_FILL,
  formatTime,
  formatValue,
  statusAt,
  statusLabel,
  valueAt,
  type ChartAxis,
  type ChartSeries,
} from "./TrendChart";

// Trend of one machine's signals: Combined (the default) puts every chosen signal in one chart — one Y axis
// per unit, or every signal scaled to its own range when there are more units than axes — and Individual
// gives every chosen signal its own chart. Preset ranges end now and refresh while open;
// dragging across a chart zooms into that part. Machine, range, view and signals are kept in the URL.

type View = "combined" | "individual";
type RangeKey = "15m" | "1h" | "4h" | "8h" | "24h" | "7d" | "custom";

const MIN = 60_000;
const HOUR = 60 * MIN;
const PRESETS: { key: Exclude<RangeKey, "custom">; label: string; ms: number; refreshMs: number }[] = [
  { key: "15m", label: "15 min", ms: 15 * MIN, refreshMs: 5000 },
  { key: "1h", label: "1 h", ms: HOUR, refreshMs: 5000 },
  { key: "4h", label: "4 h", ms: 4 * HOUR, refreshMs: 10_000 },
  { key: "8h", label: "8 h", ms: 8 * HOUR, refreshMs: 15_000 },
  { key: "24h", label: "24 h", ms: 24 * HOUR, refreshMs: 30_000 },
  { key: "7d", label: "7 days", ms: 168 * HOUR, refreshMs: 60_000 },
];
/** Series colors in their fixed order (see --series-* in globals.css). */
const SERIES = Array.from({ length: 8 }, (_, i) => `var(--series-${i + 1})`);
/** Past the colors, series reuse them with these dashes. */
const DASHES = [undefined, "6 3", "2 3", "8 3 2 3"];
/** One chart can carry this many units (two axes on each side); with more, Combined is normalized. */
const MAX_AXES = 4;
const INDIVIDUAL_COLOR = SERIES[0];

const inputClass =
  "h-9 rounded-lg border border-slate-200 bg-surface px-3 text-sm text-slate-800 focus:border-blue-400 focus:outline-none";

const pad = (n: number) => String(n).padStart(2, "0");
/** Epoch ms → value of a datetime-local input (local time). */
const localInput = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const bucketLabel = (s: number) => (s < 60 ? `${s} s` : s < 3600 ? `${s / 60} min` : `${s / 3600} h`);

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-slate-200 bg-surface p-4 ${className}`}>{children}</div>;
}

/** Lowest, highest and current value of a signal in the range. */
function stats(s: TrendSignal) {
  let lo = s.start ?? Infinity;
  let hi = s.start ?? -Infinity;
  for (const p of s.points) {
    lo = Math.min(lo, p[2]);
    hi = Math.max(hi, p[3]);
  }
  const last = s.points.at(-1)?.[1] ?? s.start;
  return Number.isFinite(lo) ? { lo, hi, last } : { lo: null, hi: null, last };
}

function StatusLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
      Status band:
      {(["RUN", "STOP", "OFF"] as const).map((s) => (
        <span key={s} className="inline-flex items-center gap-1">
          <span className="h-2 w-3 rounded-sm" style={{ background: STATUS_FILL[s] }} />
          {statusLabel(s)}
        </span>
      ))}
      <span className="inline-flex items-center gap-1">
        <span className="h-2 w-3 rounded-sm bg-[repeating-linear-gradient(135deg,var(--color-slate-200)_0_3px,var(--color-slate-300)_3px_6px)]" />
        No data
      </span>
    </div>
  );
}

export default function Trend() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const name = useMachineLabel();

  const [machines, setMachines] = useState<MachineRegistration[] | null>(null);
  const [data, setData] = useState<MachineTrend | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hoverT, setHoverT] = useState<number | null>(null);
  /** Chosen signals of one machine and their color slot. A slot stays with its signal while it is chosen. */
  const [slots, setSlots] = useState<{ machineId: string; byKey: Record<string, number> } | null>(null);
  /** Signal names to choose again after switching to `machineId`. */
  const [carry, setCarry] = useState<{ machineId: string; names: string[] } | null>(null);
  const request = useRef(0);

  const machineId = params.get("machine") ?? "";
  const view: View = params.get("view") === "individual" ? "individual" : "combined";
  const rangeKey = (PRESETS.some((p) => p.key === params.get("range")) || params.get("range") === "custom"
    ? params.get("range")
    : "1h") as RangeKey;
  const preset = PRESETS.find((p) => p.key === rangeKey);
  const customFrom = Number(params.get("from"));
  const customTo = Number(params.get("to"));
  const custom = rangeKey === "custom" && customFrom > 0 && customTo > customFrom;
  const back = PRESETS.find((p) => p.key === params.get("back"));

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) next.delete(k);
        else next.set(k, v);
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router]
  );

  useEffect(() => {
    machineApi
      .list()
      .then((list) =>
        setMachines(
          list
            .filter((m) => m.isActive)
            .sort((a, b) => a.machineNo.localeCompare(b.machineNo, undefined, { numeric: true }))
        )
      )
      .catch((err: Error) => setError(err.message));
  }, []);

  // Without a machine in the URL, open the first one.
  useEffect(() => {
    if (machines?.length && !machines.some((m) => m.id === machineId)) setParams({ machine: machines[0].id, signals: null });
  }, [machines, machineId, setParams]);

  const load = useCallback(() => {
    if (!machineId) return;
    const now = Date.now();
    const from = preset ? now - preset.ms : custom ? customFrom : now - HOUR;
    const to = preset ? now : custom ? customTo : now;
    const id = ++request.current;
    machineApi
      .trend(machineId, from, to)
      .then((t) => {
        if (id !== request.current) return;
        setData(t);
        setError(null);
      })
      .catch((err: Error) => id === request.current && setError(err.message))
      .finally(() => id === request.current && setLoading(false));
  }, [machineId, preset, custom, customFrom, customTo]);

  useEffect(() => {
    load();
    if (!preset) return;
    const timer = setInterval(load, preset.refreshMs);
    return () => clearInterval(timer);
  }, [load, preset]);

  const current = data && data.machineId === machineId ? data : null;

  // Until signals are picked on this machine: the names carried over from the last machine, the URL, or all.
  const signalsParam = params.get("signals");
  const byKey = useMemo(() => {
    if (!current) return null;
    if (slots?.machineId === current.machineId) return slots.byKey;
    const keys = current.signals.map((s) => s.key);
    const carried =
      carry?.machineId === current.machineId
        ? current.signals.filter((s) => carry.names.includes(s.name)).map((s) => s.key)
        : [];
    const fromUrl = signalsParam?.split(",").filter((k) => keys.includes(k)) ?? [];
    const chosen = carried.length ? carried : fromUrl.length ? fromUrl : keys;
    return Object.fromEntries(chosen.map((k, i) => [k, i])) as Record<string, number>;
  }, [current, slots, carry, signalsParam]);

  const writeSlots = (next: Record<string, number>) => {
    setSlots({ machineId, byKey: next });
    const keys = Object.keys(next).sort((a, b) => next[a] - next[b]);
    setParams({ signals: current && keys.length === current.signals.length ? null : keys.join(",") || null });
  };
  const toggle = (key: string) => {
    if (!byKey) return;
    const next = { ...byKey };
    if (key in next) delete next[key];
    else {
      const used = new Set(Object.values(next));
      let slot = 0;
      while (used.has(slot)) slot++;
      next[key] = slot;
    }
    writeSlots(next);
  };

  const changeMachine = (id: string) => {
    if (current && byKey) setCarry({ machineId: id, names: current.signals.filter((s) => s.key in byKey).map((s) => s.name) });
    setParams({ machine: id, signals: null });
  };
  const zoom = (a: number, b: number) =>
    setParams({
      range: "custom",
      from: String(Math.round(a)),
      to: String(Math.round(b)),
      back: preset?.key ?? params.get("back"),
    });

  // ---- what each view draws
  const chosen = useMemo(
    () => (current && byKey ? current.signals.filter((s) => s.key in byKey) : []),
    [current, byKey]
  );
  const combined = useMemo(() => {
    const series: ChartSeries[] = [];
    const axes: (ChartAxis & { key: string })[] = [];
    if (!byKey) return { series, axes, normalized: false };
    for (const signal of [...chosen].sort((a, b) => byKey[a.key] - byKey[b.key])) {
      const slot = byKey[signal.key];
      const axisKey = signal.unit || `#${signal.key}`;
      let axis = axes.findIndex((a) => a.key === axisKey);
      if (axis < 0) axis = axes.push({ key: axisKey, label: signal.unit || signal.name }) - 1;
      series.push({
        signal,
        color: SERIES[slot % SERIES.length],
        dash: DASHES[Math.floor(slot / SERIES.length) % DASHES.length],
        axis,
      });
    }
    return { series, axes, normalized: axes.length > MAX_AXES };
  }, [chosen, byKey]);

  const machine = machines?.find((m) => m.id === machineId);
  const from = current ? Date.parse(current.from) : 0;
  const to = current ? Date.parse(current.to) : 0;
  const bucketMs = (current?.bucketSeconds ?? 1) * 1000;
  const span = to - from;
  const statusLine = (t: number) => {
    const st = current ? statusAt(current.status, t) : null;
    return { value: formatTime(t, span), label: st ? statusLabel(st) : "" };
  };
  const valueText = (s: TrendSignal, t: number) => {
    const { value, range } = valueAt(s, t, bucketMs);
    return range ? `${formatValue(value, s.unit)} (${formatValue(range[0])}–${formatValue(range[1])})` : formatValue(value, s.unit);
  };

  // ---- controls
  const controls = (
    <div className="flex flex-wrap items-end gap-3">
      <label className="min-w-40">
        <span className="mb-1 block text-xs font-medium text-slate-600">{name.one}</span>
        <select
          value={machineId}
          onChange={(e) => changeMachine(e.target.value)}
          className={`${inputClass} w-full`}
          disabled={!machines?.length}
        >
          {machines?.map((m) => (
            <option key={m.id} value={m.id}>
              {m.machineNo}
              {m.machineName ? ` · ${m.machineName}` : ""}
            </option>
          ))}
        </select>
      </label>
      <div>
        <span className="mb-1 block text-xs font-medium text-slate-600">Range</span>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex h-9 rounded-lg border border-slate-200 bg-surface p-0.5">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setParams({ range: p.key, from: null, to: null, back: null })}
                className={`rounded-md px-2.5 text-sm font-medium ${
                  rangeKey === p.key ? "bg-(--brand) text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() =>
                current &&
                setParams({ range: "custom", from: String(from), to: String(to), back: preset?.key ?? params.get("back") })
              }
              className={`rounded-md px-2.5 text-sm font-medium ${
                rangeKey === "custom" ? "bg-(--brand) text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Custom
            </button>
          </div>
          {rangeKey === "custom" && (
            <>
              <input
                type="datetime-local"
                aria-label="From"
                value={custom ? localInput(customFrom) : ""}
                max={custom ? localInput(customTo) : undefined}
                onChange={(e) => e.target.value && setParams({ from: String(new Date(e.target.value).getTime()) })}
                className={inputClass}
              />
              <span className="text-slate-400">~</span>
              <input
                type="datetime-local"
                aria-label="To"
                value={custom ? localInput(customTo) : ""}
                min={custom ? localInput(customFrom) : undefined}
                onChange={(e) => e.target.value && setParams({ to: String(new Date(e.target.value).getTime()) })}
                className={inputClass}
              />
            </>
          )}
          {rangeKey === "custom" && back && (
            <button type="button" onClick={() => setParams({ range: back.key, from: null, to: null, back: null })} className={buttonStyles.secondary}>
              <RotateCcw size={14} /> Last {back.label}
            </button>
          )}
        </div>
      </div>
      <div>
        <span className="mb-1 block text-xs font-medium text-slate-600">View</span>
        <div className="inline-flex h-9 rounded-lg border border-slate-200 bg-surface p-0.5">
          {(
            [
              { v: "combined", label: "Combined", icon: <Layers size={14} /> },
              { v: "individual", label: "Individual", icon: <LayoutGrid size={14} /> },
            ] as const
          ).map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => setParams({ view: o.v === "combined" ? null : o.v })}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 text-sm font-medium ${
                view === o.v ? "bg-(--brand) text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {o.icon}
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          setLoading(true);
          load();
        }}
        disabled={loading || !machineId}
        className={`${buttonStyles.secondary} w-9 px-0`}
        aria-label="Refresh"
        title="Refresh"
      >
        <RefreshCw size={16} className={loading ? "animate-spin" : undefined} />
      </button>
    </div>
  );

  // ---- signal picker
  const picker = current && byKey && (
    <Card className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">
          Signals <span className="font-normal text-slate-500">· {chosen.length} of {current.signals.length}</span>
        </p>
        <div className="flex gap-3 text-xs font-medium">
          <button type="button" className="text-(--brand) hover:underline" onClick={() => writeSlots(Object.fromEntries(current.signals.map((s, i) => [s.key, i])))}>
            All
          </button>
          <button type="button" className="text-(--brand) hover:underline" onClick={() => writeSlots({})}>
            None
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {current.signals.map((s) => {
          const on = s.key in byKey;
          const color = combined.series.find((c) => c.signal.key === s.key)?.color;
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(s.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                on ? "border-slate-300 bg-slate-50 text-slate-800" : "border-slate-200 text-slate-400 hover:text-slate-600"
              }`}
            >
              {view === "combined" && on ? (
                <span className="size-2 rounded-full" style={{ background: color }} />
              ) : (
                <span className={`size-2 rounded-full ${on ? "bg-slate-500" : "border border-slate-300"}`} />
              )}
              {s.name}
              {s.unit && <span className="font-normal text-slate-400">{s.unit}</span>}
            </button>
          );
        })}
      </div>
    </Card>
  );

  // ---- body
  let body: React.ReactNode;
  if (!current || !byKey) {
    body = (
      <div className="flex flex-col items-center gap-3 py-24 text-sm text-slate-500">
        {error ? (
          <>
            <p className="text-red-600">{error}</p>
            <button type="button" onClick={load} className="font-medium text-(--brand) hover:underline">
              Retry
            </button>
          </>
        ) : machines && !machines.length ? (
          <p>No active {name.many.toLowerCase()}.</p>
        ) : (
          <>
            <Loader2 size={22} className="animate-spin" />
            Loading trend…
          </>
        )}
      </div>
    );
  } else if (!chosen.length) {
    body = <p className="py-16 text-center text-sm text-slate-500">Choose one or more signals above.</p>;
  } else if (view === "combined") {
    body = (
      <Card>
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1.5">
          {combined.series.map((s) => (
            <span key={s.signal.key} className="inline-flex items-center gap-1.5 text-sm">
              <svg width={16} height={4} className="shrink-0" aria-hidden>
                <line x1={1} x2={15} y1={2} y2={2} stroke={s.color} strokeWidth={2} strokeDasharray={s.dash} strokeLinecap="round" />
              </svg>
              <span className="text-slate-600">{s.signal.name}</span>
              <span className="font-semibold text-slate-900 tabular-nums">
                {formatValue(hoverT !== null ? valueAt(s.signal, hoverT, bucketMs).value : stats(s.signal).last, s.signal.unit)}
              </span>
              <button
                type="button"
                onClick={() => toggle(s.signal.key)}
                aria-label={`Remove ${s.signal.name}`}
                className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <TrendChart
          series={combined.series}
          axes={combined.axes}
          from={from}
          to={to}
          bucketMs={bucketMs}
          status={current.status}
          height={420}
          normalized={combined.normalized}
          hoverT={hoverT}
          onHover={setHoverT}
          onZoom={zoom}
          label={`${current.machineNo} combined trend`}
          tooltip={(t) => [statusLine(t), ...combined.series.map((s) => ({ color: s.color, value: valueText(s.signal, t), label: s.signal.name }))]}
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <StatusLegend />
          {combined.normalized && (
            <p className="text-xs text-slate-500">
              {combined.axes.length} units in one chart: each signal is scaled from its lowest (0%) to its highest (100%) value
              in the range. Hover for the real values, or use Individual.
            </p>
          )}
        </div>
      </Card>
    );
  } else {
    body = (
      <div className="space-y-2">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {chosen.map((s) => {
            const st = stats(s);
            const shown = hoverT !== null ? valueAt(s, hoverT, bucketMs).value : st.last;
            const empty = s.start === null && !s.points.length;
            return (
              <Card key={s.key} className="p-3">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900" title={s.tagName}>
                      {s.name}
                    </p>
                    <p className="text-[11px] text-slate-500 tabular-nums">
                      {st.lo === null ? "No readings" : `Min ${formatValue(st.lo)} · Max ${formatValue(st.hi)}`}
                    </p>
                  </div>
                  <p className="shrink-0 text-lg font-bold text-slate-900 tabular-nums">{formatValue(shown, s.unit)}</p>
                </div>
                {empty ? (
                  <p className="flex h-[150px] items-center justify-center text-xs text-slate-400">No readings in this range</p>
                ) : (
                  <TrendChart
                    series={[{ signal: s, color: INDIVIDUAL_COLOR, axis: 0 }]}
                    axes={[{ label: s.unit }]}
                    from={from}
                    to={to}
                    bucketMs={bucketMs}
                    status={current.status}
                    height={150}
                    hoverT={hoverT}
                    onHover={setHoverT}
                    onZoom={zoom}
                    label={`${s.name} trend`}
                    tooltip={(t) => [statusLine(t), { value: valueText(s, t), label: s.name }]}
                  />
                )}
              </Card>
            );
          })}
        </div>
        <StatusLegend />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
            <ChartLine size={20} className="text-(--brand)" /> Trend
          </h2>
          <p className="text-sm text-slate-500">
            {machine ? `${machine.machineNo}${machine.machineName ? ` · ${machine.machineName}` : ""}` : "—"}
            {current && ` · ${formatTime(from, span)} – ${formatTime(to, span)} · 1 point = ${bucketLabel(current.bucketSeconds)}`}
            {preset && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700">
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" /> Live
              </span>
            )}
          </p>
        </div>
        {machine && (
          <Link href={`/dashboard/machine/${machine.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-(--brand) hover:underline">
            {name.one} detail <ArrowUpRight size={14} />
          </Link>
        )}
      </div>
      {controls}
      {error && current && <p className="text-sm text-red-600">{error}</p>}
      {picker}
      <div className={loading && current ? "opacity-60 transition-opacity" : undefined}>{body}</div>
      {current && <p className="text-xs text-slate-400">Drag across a chart to zoom in. Shaded bands show the lowest and highest value inside one point.</p>}
    </div>
  );
}

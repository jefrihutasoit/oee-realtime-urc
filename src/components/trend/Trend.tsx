"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, ChartLine, ChevronDown, Layers, LayoutGrid, Loader2, Plus, RefreshCw, RotateCcw, X } from "lucide-react";
import { buttonStyles } from "@/components/ui/Modal";
import { machineApi } from "@/lib/machine-api";
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

// Trend of machine signals, for one machine (the default) or several compared. Every machine has its own
// signal list: a dropdown under the machine checks and unchecks its signals. Combined (the default) puts every
// checked signal in one chart — one Y axis per unit, or every signal scaled to its own range when there are
// more units than axes — and Individual gives every checked signal its own chart. One machine shows its status
// band; compared machines show their status in the tooltip. Preset ranges end now and refresh while open;
// dragging across a chart zooms into that part. Machines, range, view and checked signals are kept in the URL
// (`machine=id1,id2`, `signals=id1~key.key;id2~key`).

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
const MAX_MACHINES = 8;
/** Signals checked when a machine is opened: the basic output counter (the status is always shown). */
const DEFAULT_SIGNALS = ["output"];

const inputClass =
  "h-9 rounded-lg border border-slate-200 bg-surface px-3 text-sm text-slate-800 focus:border-blue-400 focus:outline-none";

const pad = (n: number) => String(n).padStart(2, "0");
/** Epoch ms → value of a datetime-local input (local time). */
const localInput = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const bucketLabel = (s: number) => (s < 60 ? `${s} s` : s < 3600 ? `${s / 60} min` : `${s / 3600} h`);
const machineText = (m: Pick<MachineRegistration, "machineNo" | "machineName">) =>
  `${m.machineNo}${m.machineName ? ` · ${m.machineName}` : ""}`;

/** Checked signal keys per machine, in the URL: `id1~key.key;id2~key` (parts URI-encoded). */
type Picks = Record<string, string[]>;
const enc = encodeURIComponent;
function parsePicks(text: string | null): Picks {
  const out: Picks = {};
  for (const part of (text ?? "").split(";")) {
    const [id, keys] = part.split("~");
    if (id && keys !== undefined) out[decodeURIComponent(id)] = keys ? keys.split(".").map(decodeURIComponent) : [];
  }
  return out;
}
const writePicks = (p: Picks) =>
  Object.entries(p)
    .map(([id, keys]) => `${enc(id)}~${keys.map(enc).join(".")}`)
    .join(";");

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

/** Dropdown with a checkbox per signal of one machine. */
function SignalMenu({
  signals,
  checked,
  colorOf,
  onChange,
}: {
  signals: TrendSignal[] | null;
  checked: Set<string>;
  colorOf: (key: string) => string | undefined;
  onChange: (keys: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const count = signals ? signals.filter((s) => checked.has(s.key)).length : 0;
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={!signals}
        aria-expanded={open}
        className="inline-flex h-7 w-full items-center justify-between gap-1.5 rounded-md border border-slate-200 bg-surface px-2 text-xs text-slate-600 hover:border-slate-300 disabled:opacity-50"
      >
        <span>
          Signals{" "}
          <span className="font-semibold text-slate-900 tabular-nums">
            {signals ? `${count}/${signals.length}` : "…"}
          </span>
        </span>
        <ChevronDown size={14} className={open ? "rotate-180" : undefined} />
      </button>
      {open && signals && (
        <div className="absolute top-full left-0 z-30 mt-1 w-64 rounded-lg border border-slate-200 bg-surface p-1 shadow-lg">
          <div className="flex justify-between border-b border-slate-100 px-2 pt-1 pb-1.5 text-xs font-medium">
            <button type="button" className="text-(--brand) hover:underline" onClick={() => onChange(signals.map((s) => s.key))}>
              Check all
            </button>
            <button type="button" className="text-(--brand) hover:underline" onClick={() => onChange([])}>
              Uncheck all
            </button>
          </div>
          <ul className="max-h-72 overflow-y-auto py-1">
            {signals.map((s) => {
              const on = checked.has(s.key);
              const color = colorOf(s.key);
              return (
                <li key={s.key}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        onChange(on ? [...checked].filter((k) => k !== s.key) : [...checked, s.key])
                      }
                      className="size-4 accent-(--brand)"
                    />
                    <span className="min-w-0 flex-1 truncate" title={s.tagName}>
                      {s.name}
                    </span>
                    {s.unit && <span className="text-xs text-slate-400">{s.unit}</span>}
                    {on && color && <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />}
                  </label>
                </li>
              );
            })}
            {!signals.length && <li className="px-2 py-2 text-xs text-slate-400">No signals on this machine.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

/** A drawn line: one checked signal of one machine. */
type Line = ChartSeries & { trend: MachineTrend; label: string };

export default function Trend() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [machines, setMachines] = useState<MachineRegistration[] | null>(null);
  const [data, setData] = useState<{ key: string; trends: MachineTrend[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hoverT, setHoverT] = useState<number | null>(null);
  /** For an added machine: the signal names to check once its signals are known. */
  const [nameHints, setNameHints] = useState<Record<string, string[]>>({});
  const request = useRef(0);

  const machineParam = params.get("machine") ?? "";
  const machineIds = useMemo(() => machineParam.split(",").filter(Boolean), [machineParam]);
  const compare = machineIds.length > 1;
  const view: View = params.get("view") === "individual" ? "individual" : "combined";
  const rangeKey = (PRESETS.some((p) => p.key === params.get("range")) || params.get("range") === "custom"
    ? params.get("range")
    : "1h") as RangeKey;
  const preset = PRESETS.find((p) => p.key === rangeKey);
  const customFrom = Number(params.get("from"));
  const customTo = Number(params.get("to"));
  const custom = rangeKey === "custom" && customFrom > 0 && customTo > customFrom;
  const back = PRESETS.find((p) => p.key === params.get("back"));
  const signalsParam = params.get("signals");
  const urlPicks = useMemo(() => parsePicks(signalsParam), [signalsParam]);

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

  // Keep only machines that exist (at most MAX_MACHINES); without any, open the first one.
  useEffect(() => {
    if (!machines?.length) return;
    const valid = [...new Set(machineIds)].filter((id) => machines.some((m) => m.id === id)).slice(0, MAX_MACHINES);
    if (!valid.length) setParams({ machine: machines[0].id });
    else if (valid.join(",") !== machineParam) setParams({ machine: valid.join(",") });
  }, [machines, machineIds, machineParam, setParams]);

  const load = useCallback(() => {
    if (!machineIds.length) return;
    // One range for every machine, so their lines share the time axis.
    const now = Date.now();
    const from = preset ? now - preset.ms : custom ? customFrom : now - HOUR;
    const to = preset ? now : custom ? customTo : now;
    const id = ++request.current;
    Promise.all(machineIds.map((m) => machineApi.trend(m, from, to)))
      .then((trends) => {
        if (id !== request.current) return;
        setData({ key: machineParam, trends });
        setError(null);
      })
      .catch((err: Error) => id === request.current && setError(err.message))
      .finally(() => id === request.current && setLoading(false));
  }, [machineIds, machineParam, preset, custom, customFrom, customTo]);

  useEffect(() => {
    load();
    if (!preset) return;
    const timer = setInterval(load, preset.refreshMs);
    return () => clearInterval(timer);
  }, [load, preset]);

  const current = data && data.key === machineParam ? data.trends : null;
  const primary = current?.[0] ?? null;
  const trendOf = (id: string) => current?.find((t) => t.machineId === id) ?? null;

  /**
   * Checked signal keys of a machine: as checked (URL); for an added machine, the signals named like the
   * ones checked on the first machine; else the basic one, Output (the status is always shown as a band).
   */
  const checkedOf = (t: MachineTrend): string[] => {
    const keys = t.signals.map((s) => s.key);
    const picked = urlPicks[t.machineId];
    if (picked) return picked.filter((k) => keys.includes(k));
    const hint = nameHints[t.machineId];
    if (hint) {
      const named = t.signals.filter((s) => hint.includes(s.name)).map((s) => s.key);
      if (named.length) return named;
    }
    return keys.filter((k) => DEFAULT_SIGNALS.includes(k));
  };

  const setChecked = (machineId: string, keys: string[]) => {
    const next: Picks = {};
    for (const t of current ?? []) next[t.machineId] = t.machineId === machineId ? keys : checkedOf(t);
    setParams({ signals: writePicks(next) });
  };

  const setMachineIds = (ids: string[]) => {
    // Checked signals of machines no longer shown are dropped from the URL.
    const kept = Object.fromEntries(Object.entries(urlPicks).filter(([id]) => ids.includes(id)));
    setParams({ machine: ids.join(","), signals: Object.keys(kept).length ? writePicks(kept) : null });
  };
  const changePrimary = (id: string) => setMachineIds([id, ...machineIds.slice(1).filter((m) => m !== id)]);
  const addMachine = (id: string) => {
    if (!id) return;
    const first = primary;
    if (first) {
      const names = first.signals.filter((s) => checkedOf(first).includes(s.key)).map((s) => s.name);
      setNameHints((h) => ({ ...h, [id]: names }));
    }
    setMachineIds([...machineIds, id]);
  };
  const removeMachine = (id: string) => setMachineIds(machineIds.filter((m) => m !== id));

  const zoom = (a: number, b: number) =>
    setParams({
      range: "custom",
      from: String(Math.round(a)),
      to: String(Math.round(b)),
      back: preset?.key ?? params.get("back"),
    });

  // ---- what each view draws: every checked signal of every machine, machine by machine
  const lines = useMemo(() => {
    const out: Line[] = [];
    for (const t of current ?? []) {
      const checked = new Set(checkedOf(t));
      for (const signal of t.signals) {
        if (!checked.has(signal.key)) continue;
        const i = out.length;
        out.push({
          signal,
          trend: t,
          id: `${t.machineId}:${signal.key}`,
          axis: 0,
          color: SERIES[i % SERIES.length],
          dash: DASHES[Math.floor(i / SERIES.length) % DASHES.length],
          label: compare ? `${t.machineNo} · ${signal.name}` : signal.name,
        });
      }
    }
    return out;
    // checkedOf reads urlPicks and nameHints.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, urlPicks, nameHints, compare]);

  const combined = useMemo(() => {
    const axes: (ChartAxis & { key: string })[] = [];
    const series = lines.map((l) => {
      const axisKey = l.signal.unit || `#${l.id}`;
      let axis = axes.findIndex((a) => a.key === axisKey);
      if (axis < 0) axis = axes.push({ key: axisKey, label: l.signal.unit || l.signal.name }) - 1;
      return { ...l, axis };
    });
    return { series, axes, normalized: axes.length > MAX_AXES };
  }, [lines]);

  const selected = machineIds.map((id) => machines?.find((m) => m.id === id)).filter((m): m is MachineRegistration => !!m);
  const from = primary ? Date.parse(primary.from) : 0;
  const to = primary ? Date.parse(primary.to) : 0;
  const bucketMs = (primary?.bucketSeconds ?? 1) * 1000;
  const span = to - from;
  const valueText = (s: TrendSignal, t: number) => {
    const { value, range } = valueAt(s, t, bucketMs);
    return range ? `${formatValue(value, s.unit)} (${formatValue(range[0])}–${formatValue(range[1])})` : formatValue(value, s.unit);
  };
  // A single machine shows its status band; compared machines show their status in the tooltip.
  const band = !compare && primary ? primary.status : [];
  const tooltipHead = (t: number) => {
    if (!compare) {
      const st = primary ? statusAt(primary.status, t) : null;
      return [{ value: formatTime(t, span), label: st ? statusLabel(st) : "" }];
    }
    return [
      { value: formatTime(t, span), label: "" },
      ...(current ?? []).map((tr) => {
        const st = statusAt(tr.status, t);
        return { value: st ? statusLabel(st) : "—", label: tr.machineNo };
      }),
    ];
  };

  // ---- machines, each with its signal dropdown
  const remaining = (machines ?? []).filter((m) => !machineIds.includes(m.id));
  const signalMenu = (id: string) => {
    const t = trendOf(id);
    return (
      <SignalMenu
        signals={t?.signals ?? null}
        checked={new Set(t ? checkedOf(t) : [])}
        colorOf={(key) => lines.find((l) => l.id === `${id}:${key}`)?.color}
        onChange={(keys) => setChecked(id, keys)}
      />
    );
  };
  const machinePicker = (
    <div>
      <span className="mb-1 block text-xs font-medium text-slate-600">
        Machine
        {compare && <span className="font-normal text-slate-400"> · comparing {machineIds.length}</span>}
      </span>
      <div className="flex flex-wrap items-start gap-2">
        <div className="w-52 space-y-1">
          <select
            value={machineIds[0] ?? ""}
            onChange={(e) => changePrimary(e.target.value)}
            className={`${inputClass} w-full`}
            disabled={!machines?.length}
            aria-label="Machine"
          >
            {machines?.map((m) => (
              <option key={m.id} value={m.id}>
                {machineText(m)}
              </option>
            ))}
          </select>
          {machineIds[0] && signalMenu(machineIds[0])}
        </div>
        {selected.slice(1).map((m) => (
          <div key={m.id} className="w-44 space-y-1">
            <span className="flex h-9 items-center justify-between gap-1.5 rounded-lg border border-slate-200 bg-surface pr-1 pl-2.5 text-sm text-slate-800">
              <span className="truncate" title={machineText(m)}>
                {m.machineNo}
              </span>
              <button
                type="button"
                onClick={() => removeMachine(m.id)}
                aria-label={`Remove ${m.machineNo} from the comparison`}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={14} />
              </button>
            </span>
            {signalMenu(m.id)}
          </div>
        ))}
        {machineIds.length < MAX_MACHINES && remaining.length > 0 && (
          <label className="relative inline-flex h-9 cursor-pointer items-center gap-1 rounded-lg border border-dashed border-slate-300 px-2.5 text-sm font-medium text-(--brand) hover:border-(--brand)">
            <Plus size={14} /> Add machine
            <select
              value=""
              onChange={(e) => addMachine(e.target.value)}
              aria-label="Add a machine to compare"
              className="absolute inset-0 cursor-pointer opacity-0"
            >
              <option value="">Compare with…</option>
              {remaining.map((m) => (
                <option key={m.id} value={m.id}>
                  {machineText(m)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </div>
  );

  // ---- range, view, refresh
  const controls = (
    <div className="flex flex-wrap items-end gap-3">
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
                primary &&
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
        disabled={loading || !machineIds.length}
        className={`${buttonStyles.secondary} w-9 px-0`}
        aria-label="Refresh"
        title="Refresh"
      >
        <RefreshCw size={16} className={loading ? "animate-spin" : undefined} />
      </button>
    </div>
  );

  // ---- body
  let body: React.ReactNode;
  if (!current || !primary) {
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
          <p>No active machines.</p>
        ) : (
          <>
            <Loader2 size={22} className="animate-spin" />
            Loading trend…
          </>
        )}
      </div>
    );
  } else if (!lines.length) {
    body = <p className="py-16 text-center text-sm text-slate-500">Check one or more signals under a machine.</p>;
  } else if (view === "combined") {
    body = (
      <Card>
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1.5">
          {combined.series.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1.5 text-sm">
              <svg width={16} height={4} className="shrink-0" aria-hidden>
                <line x1={1} x2={15} y1={2} y2={2} stroke={s.color} strokeWidth={2} strokeDasharray={s.dash} strokeLinecap="round" />
              </svg>
              <span className="text-slate-600">{s.label}</span>
              <span className="font-semibold text-slate-900 tabular-nums">
                {formatValue(hoverT !== null ? valueAt(s.signal, hoverT, bucketMs).value : stats(s.signal).last, s.signal.unit)}
              </span>
              <button
                type="button"
                onClick={() =>
                  setChecked(
                    s.trend.machineId,
                    checkedOf(s.trend).filter((k) => k !== s.signal.key)
                  )
                }
                aria-label={`Uncheck ${s.label}`}
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
          status={band}
          // Compared: a status band per machine, labelled with its number.
          statusRows={compare ? current.map((t) => ({ label: t.machineNo, segments: t.status })) : undefined}
          height={420 + (compare ? (current.length - 1) * 10 : 0)}
          normalized={combined.normalized}
          hoverT={hoverT}
          onHover={setHoverT}
          onZoom={zoom}
          label={`${selected.map((m) => m.machineNo).join(", ")} combined trend`}
          tooltip={(t) => [
            ...tooltipHead(t),
            ...combined.series.map((s) => ({ color: s.color, value: valueText(s.signal, t), label: s.label })),
          ]}
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
          {lines.map((l) => {
            const s = l.signal;
            const st = stats(s);
            const shown = hoverT !== null ? valueAt(s, hoverT, bucketMs).value : st.last;
            const empty = s.start === null && !s.points.length;
            return (
              <Card key={l.id} className="p-3">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900" title={s.tagName}>
                      {l.label}
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
                    series={[{ ...l, axis: 0, dash: undefined }]}
                    axes={[{ label: s.unit }]}
                    from={from}
                    to={to}
                    bucketMs={bucketMs}
                    // Each chart is one machine: it shows that machine's status band.
                    status={l.trend.status}
                    height={150}
                    hoverT={hoverT}
                    onHover={setHoverT}
                    onZoom={zoom}
                    label={`${l.label} trend`}
                    tooltip={(t) => {
                      const stt = statusAt(l.trend.status, t);
                      return [
                        { value: formatTime(t, span), label: stt ? statusLabel(stt) : "" },
                        { color: l.color, value: valueText(s, t), label: l.label },
                      ];
                    }}
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

  const first = selected[0];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
            <ChartLine size={20} className="text-(--brand)" /> Trend
          </h2>
          <p className="text-sm text-slate-500">
            {compare ? `Comparing ${selected.map((m) => m.machineNo).join(", ")}` : first ? machineText(first) : "—"}
            {primary && ` · ${formatTime(from, span)} – ${formatTime(to, span)} · 1 point = ${bucketLabel(primary.bucketSeconds)}`}
            {preset && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700">
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" /> Live
              </span>
            )}
          </p>
        </div>
        {first && !compare && (
          <Link href={`/dashboard/machine/${first.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-(--brand) hover:underline">
            Machine detail <ArrowUpRight size={14} />
          </Link>
        )}
      </div>
      <Card className="space-y-4">
        {machinePicker}
        {controls}
      </Card>
      {error && current && <p className="text-sm text-red-600">{error}</p>}
      <div className={loading && current ? "opacity-60 transition-opacity" : undefined}>{body}</div>
      {current && <p className="text-xs text-slate-400">Drag across a chart to zoom in. Shaded bands show the lowest and highest value inside one point.</p>}
    </div>
  );
}

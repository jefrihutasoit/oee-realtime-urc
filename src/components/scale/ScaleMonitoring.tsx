"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Loader2, Plus, RefreshCw, RotateCcw, Scale, X } from "lucide-react";
import { SignalMenu, parsePicks, writePicks } from "@/components/trend/Trend";
import TrendChart, {
  STATUS_FILL,
  formatTime,
  formatValue,
  statusAt,
  statusLabel,
  valueAt,
  type ChartAxis,
  type ChartSeries,
} from "@/components/trend/TrendChart";
import { buttonStyles } from "@/components/ui/Modal";
import { machineApi } from "@/lib/machine-api";
import type { MachineRegistration } from "@/types/machine";
import type { ScaleMonitor } from "@/types/scale";
import type { TrendSignal } from "@/types/trend";

// Scale monitoring: the fields of the weight scale of one machine or several, as a trend. Every machine has a
// dropdown to check the scale fields it shows; the chart draws only the checked fields (one Y axis per unit).
// Above the chart a strip per machine shows the SKU on the product tag, and below it every SKU run is listed
// with the SKU weight and the average of each checked field. Only machines with an active scale can be chosen.
// Machines, checked fields and range are kept in the URL (`machine=id1,id2`, `signals=id1~key.key`).

type RangeKey = "1h" | "4h" | "8h" | "24h" | "7d" | "custom";
const MIN = 60_000;
const HOUR = 60 * MIN;
const PRESETS: { key: Exclude<RangeKey, "custom">; label: string; ms: number; refreshMs: number }[] = [
  { key: "1h", label: "1 h", ms: HOUR, refreshMs: 5000 },
  { key: "4h", label: "4 h", ms: 4 * HOUR, refreshMs: 10_000 },
  { key: "8h", label: "8 h", ms: 8 * HOUR, refreshMs: 15_000 },
  { key: "24h", label: "24 h", ms: 24 * HOUR, refreshMs: 30_000 },
  { key: "7d", label: "7 days", ms: 168 * HOUR, refreshMs: 60_000 },
];
/** Line colors in their fixed order (see --series-* in globals.css); past them, lines reuse them dashed. */
const SERIES = Array.from({ length: 8 }, (_, i) => `var(--series-${i + 1})`);
const DASHES = [undefined, "6 3", "2 3", "8 3 2 3"];
const MAX_AXES = 4;
const MAX_MACHINES = 8;
/** Checked when a machine is opened: the scale's average weight. */
const DEFAULT_FIELD = "yamato:AVERAGE_WEIGHT";
/** Plot edges of the trend chart: one axis is 46 px wide; without a right axis the right edge is 14 px. */
const AXIS_W = 46;
const SKU_COLORS = ["#3987e5", "#c98500", "#199e70", "#d55181", "#9085e9", "#d95926", "#008300", "#e66767"];

const inputClass =
  "h-9 rounded-lg border border-slate-200 bg-surface px-3 text-sm text-slate-800 focus:border-blue-400 focus:outline-none";
const pad = (n: number) => String(n).padStart(2, "0");
const localInput = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const num = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const fieldName = (s: TrendSignal) => s.name.replace(/^Scale · /, "");
const machineText = (m: Pick<MachineRegistration, "machineNo" | "machineName">) =>
  `${m.machineNo}${m.machineName ? ` · ${m.machineName}` : ""}`;

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-slate-200 bg-surface p-4 ${className}`}>{children}</div>;
}

/** Average of a signal's chart points (last value per point) from `a` to `b`; null without points there. */
function avgBetween(s: TrendSignal, a: number, b: number) {
  const pts = s.points.filter((p) => p[0] >= a && p[0] < b);
  return pts.length ? pts.reduce((sum, p) => sum + p[1], 0) / pts.length : null;
}

type Line = ChartSeries & { data: ScaleMonitor; label: string };

export default function ScaleMonitoring() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [machines, setMachines] = useState<MachineRegistration[] | null>(null);
  const [data, setData] = useState<{ key: string; list: ScaleMonitor[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hoverT, setHoverT] = useState<number | null>(null);
  const request = useRef(0);

  const machineParam = params.get("machine") ?? "";
  const machineIds = useMemo(() => machineParam.split(",").filter(Boolean), [machineParam]);
  const compare = machineIds.length > 1;
  const rangeKey = (PRESETS.some((p) => p.key === params.get("range")) || params.get("range") === "custom"
    ? params.get("range")
    : "8h") as RangeKey;
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

  // Only machines with an active weight scale.
  useEffect(() => {
    machineApi
      .list()
      .then((list) =>
        setMachines(
          list
            .filter((m) => m.isActive && m.scale?.enabled)
            .sort((a, b) => a.machineNo.localeCompare(b.machineNo, undefined, { numeric: true }))
        )
      )
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!machines?.length) return;
    const valid = [...new Set(machineIds)].filter((id) => machines.some((m) => m.id === id)).slice(0, MAX_MACHINES);
    if (!valid.length) setParams({ machine: machines[0].id });
    else if (valid.join(",") !== machineParam) setParams({ machine: valid.join(",") });
  }, [machines, machineIds, machineParam, setParams]);

  const load = useCallback(() => {
    if (!machineIds.length) return;
    const now = Date.now();
    const from = preset ? now - preset.ms : custom ? customFrom : now - 8 * HOUR;
    const to = preset ? now : custom ? customTo : now;
    const id = ++request.current;
    Promise.all(machineIds.map((m) => machineApi.scaleMonitor(m, from, to)))
      .then((list) => {
        if (id !== request.current) return;
        setData({ key: machineParam, list });
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

  const current = data && data.key === machineParam ? data.list : null;
  const primary = current?.[0] ?? null;
  const from = primary ? Date.parse(primary.from) : 0;
  const to = primary ? Date.parse(primary.to) : 0;
  const span = to - from;
  const bucketMs = (primary?.bucketSeconds ?? 1) * 1000;

  /** Checked fields of a machine: as checked (URL), else the average weight (or the first field). */
  const checkedOf = useCallback(
    (d: ScaleMonitor): string[] => {
      const keys = d.signals.map((s) => s.key);
      const picked = urlPicks[d.machineId];
      if (picked) return picked.filter((k) => keys.includes(k));
      return keys.includes(DEFAULT_FIELD) ? [DEFAULT_FIELD] : keys.slice(0, 1);
    },
    [urlPicks]
  );
  const setChecked = (machineId: string, keys: string[]) => {
    const next: Record<string, string[]> = {};
    for (const d of current ?? []) next[d.machineId] = d.machineId === machineId ? keys : checkedOf(d);
    setParams({ signals: writePicks(next) });
  };

  // Every checked field of every machine is a line; one Y axis per unit.
  const chart = useMemo(() => {
    const lines: Line[] = [];
    const axes: (ChartAxis & { key: string })[] = [];
    for (const d of current ?? []) {
      const checked = new Set(checkedOf(d));
      for (const signal of d.signals) {
        if (!checked.has(signal.key)) continue;
        const axisKey = signal.unit || `#${signal.key}`;
        let axis = axes.findIndex((a) => a.key === axisKey);
        if (axis < 0) axis = axes.push({ key: axisKey, label: signal.unit || fieldName(signal) }) - 1;
        const i = lines.length;
        lines.push({
          signal,
          data: d,
          id: `${d.machineId}:${signal.key}`,
          axis,
          color: SERIES[i % SERIES.length],
          dash: DASHES[Math.floor(i / SERIES.length) % DASHES.length],
          label: compare ? `${d.machineNo} · ${fieldName(signal)}` : fieldName(signal),
        });
      }
    }
    const normalized = axes.length > MAX_AXES;
    // Plot edges, so the SKU strips line up with the chart.
    const shown = normalized ? 1 : Math.max(axes.length, 1);
    const left = Math.ceil(shown / 2) * AXIS_W;
    const right = Math.floor(shown / 2) ? Math.floor(shown / 2) * AXIS_W : 14;
    return { lines, axes, normalized, left, right };
  }, [current, checkedOf, compare]);

  const skuColor = useMemo(() => {
    const codes = [...new Set((current ?? []).flatMap((d) => d.skus.map((s) => s.skuCode)).filter((c) => c !== "-"))];
    return (code: string) => (code === "-" ? "var(--color-slate-300)" : SKU_COLORS[codes.indexOf(code) % SKU_COLORS.length]);
  }, [current]);

  const zoom = (a: number, b: number) =>
    setParams({ range: "custom", from: String(Math.round(a)), to: String(Math.round(b)), back: preset?.key ?? params.get("back") });

  // ---- machines, each with its field dropdown
  const selected = machineIds.map((id) => machines?.find((m) => m.id === id)).filter((m): m is MachineRegistration => !!m);
  const remaining = (machines ?? []).filter((m) => !machineIds.includes(m.id));
  const setMachineIds = (ids: string[]) => {
    const kept = Object.fromEntries(Object.entries(urlPicks).filter(([id]) => ids.includes(id)));
    setParams({ machine: ids.join(","), signals: Object.keys(kept).length ? writePicks(kept) : null });
  };
  const fieldMenu = (id: string) => {
    const d = current?.find((x) => x.machineId === id) ?? null;
    return (
      <SignalMenu
        signals={d ? d.signals.map((s) => ({ ...s, name: fieldName(s) })) : null}
        checked={new Set(d ? checkedOf(d) : [])}
        colorOf={(key) => chart.lines.find((l) => l.id === `${id}:${key}`)?.color}
        onChange={(keys) => setChecked(id, keys)}
      />
    );
  };

  const controls = (
    <Card className="space-y-4">
      <div>
        <span className="mb-1 block text-xs font-medium text-slate-600">
          Machine with weight scale
          {compare && <span className="font-normal text-slate-400"> · comparing {machineIds.length}</span>}
        </span>
        <div className="flex flex-wrap items-start gap-2">
          <div className="w-52 space-y-1">
            <select
              value={machineIds[0] ?? ""}
              onChange={(e) => setMachineIds([e.target.value, ...machineIds.slice(1).filter((m) => m !== e.target.value)])}
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
            {machineIds[0] && fieldMenu(machineIds[0])}
          </div>
          {selected.slice(1).map((m) => (
            <div key={m.id} className="w-44 space-y-1">
              <span className="flex h-9 items-center justify-between gap-1.5 rounded-lg border border-slate-200 bg-surface pr-1 pl-2.5 text-sm text-slate-800">
                <span className="truncate" title={machineText(m)}>
                  {m.machineNo}
                </span>
                <button
                  type="button"
                  onClick={() => setMachineIds(machineIds.filter((id) => id !== m.id))}
                  aria-label={`Remove ${m.machineNo} from the comparison`}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X size={14} />
                </button>
              </span>
              {fieldMenu(m.id)}
            </div>
          ))}
          {machineIds.length < MAX_MACHINES && remaining.length > 0 && (
            <label className="relative inline-flex h-9 cursor-pointer items-center gap-1 rounded-lg border border-dashed border-slate-300 px-2.5 text-sm font-medium text-(--brand) hover:border-(--brand)">
              <Plus size={14} /> Add machine
              <select
                value=""
                onChange={(e) => e.target.value && setMachineIds([...machineIds, e.target.value])}
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
                  className={`rounded-md px-2.5 text-sm font-medium ${rangeKey === p.key ? "bg-(--brand) text-white" : "text-slate-600 hover:bg-slate-100"}`}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => primary && setParams({ range: "custom", from: String(from), to: String(to), back: preset?.key ?? params.get("back") })}
                className={`rounded-md px-2.5 text-sm font-medium ${rangeKey === "custom" ? "bg-(--brand) text-white" : "text-slate-600 hover:bg-slate-100"}`}
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
    </Card>
  );

  // ---- SKU runs of one machine, with the average of its checked fields
  const skuTable = (d: ScaleMonitor) => {
    const checked = d.signals.filter((s) => checkedOf(d).includes(s.key));
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: 560 + checked.length * 110 }}>
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">SKU</th>
              <th className="px-4 py-2 font-medium">Time</th>
              <th className="px-4 py-2 text-right font-medium">SKU weight</th>
              {checked.map((s) => (
                <th key={s.key} className="px-4 py-2 text-right font-medium" title="Average of the chart points in this run">
                  Avg {fieldName(s)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 tabular-nums">
            {d.skus.length === 0 ? (
              <tr>
                <td colSpan={3 + checked.length} className="px-4 py-6 text-center text-slate-400">
                  No product tag readings in this range.
                </td>
              </tr>
            ) : (
              [...d.skus].reverse().map((r) => (
                <tr key={r.start}>
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-sm" style={{ background: skuColor(r.skuCode) }} />
                      <span className="font-mono font-medium text-slate-900">{r.skuCode === "-" ? "No SKU" : r.skuCode}</span>
                    </span>
                    <span className="block max-w-56 truncate text-xs text-slate-500">{r.productName}</span>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-slate-600">
                    {formatTime(Date.parse(r.start), span)} – {formatTime(Date.parse(r.end), span)}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-700">{r.target === null ? "—" : num.format(r.target)}</td>
                  {checked.map((s) => {
                    const v = avgBetween(s, Date.parse(r.start), Date.parse(r.end));
                    return (
                      <td key={s.key} className="px-4 py-2 text-right text-slate-900">
                        {v === null ? "—" : formatValue(Math.round(v * 100) / 100, s.unit)}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    );
  };

  // ---- body
  let body: React.ReactNode;
  if (machines && !machines.length) {
    body = (
      <Card className="py-12 text-center text-sm text-slate-500">
        No machine has an active weight scale. Set up the scale of a machine in{" "}
        <Link href="/settings/machines" className="font-medium text-(--brand) hover:underline">
          Machine Management
        </Link>
        .
      </Card>
    );
  } else if (!current || !primary) {
    body = (
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
            Loading…
          </>
        )}
      </div>
    );
  } else {
    body = (
      <div className="space-y-4">
        <Card>
          {chart.lines.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-500">Check one or more scale fields under a machine.</p>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1.5">
                {chart.lines.map((l) => (
                  <span key={l.id} className="inline-flex items-center gap-1.5 text-sm">
                    <svg width={16} height={4} className="shrink-0" aria-hidden>
                      <line x1={1} x2={15} y1={2} y2={2} stroke={l.color} strokeWidth={2} strokeDasharray={l.dash} strokeLinecap="round" />
                    </svg>
                    <span className="text-slate-600">{l.label}</span>
                    <span className="font-semibold text-slate-900 tabular-nums">
                      {formatValue(
                        hoverT !== null ? valueAt(l.signal, hoverT, bucketMs).value : (l.signal.points.at(-1)?.[1] ?? l.signal.start),
                        l.signal.unit
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => setChecked(l.data.machineId, checkedOf(l.data).filter((k) => k !== l.signal.key))}
                      aria-label={`Uncheck ${l.label}`}
                      className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
              {/* SKU on the product tag, one strip per machine */}
              <div className="mb-1 space-y-0.5" style={{ marginLeft: chart.left, marginRight: chart.right }}>
                {current.map((d) => (
                  <div key={d.machineId} className="flex items-center gap-1">
                    <div className="relative h-4 flex-1 overflow-hidden rounded bg-slate-100">
                      {d.skus.map((s) => {
                        const left = ((Date.parse(s.start) - from) / (span || 1)) * 100;
                        const width = ((Date.parse(s.end) - Date.parse(s.start)) / (span || 1)) * 100;
                        return (
                          <div
                            key={s.start}
                            title={`${d.machineNo} · ${s.skuCode === "-" ? "No SKU" : `${s.skuCode} · ${s.productName}`} · ${formatTime(Date.parse(s.start), span)}–${formatTime(Date.parse(s.end), span)}`}
                            className="absolute inset-y-0 flex items-center justify-center overflow-hidden border-r border-white/70 text-[10px] font-medium whitespace-nowrap text-white"
                            style={{ left: `${left}%`, width: `${width}%`, background: skuColor(s.skuCode) }}
                          >
                            {width > 6 ? (s.skuCode === "-" ? "No SKU" : s.skuCode) : ""}
                          </div>
                        );
                      })}
                    </div>
                    {compare && <span className="w-10 shrink-0 truncate text-[10px] text-slate-500">{d.machineNo}</span>}
                  </div>
                ))}
              </div>
              <TrendChart
                series={chart.lines}
                axes={chart.axes}
                from={from}
                to={to}
                bucketMs={bucketMs}
                status={compare ? [] : primary.status}
                statusRows={compare ? current.map((d) => ({ label: d.machineNo, segments: d.status })) : undefined}
                height={420 + (compare ? (current.length - 1) * 10 : 0)}
                normalized={chart.normalized}
                hoverT={hoverT}
                onHover={setHoverT}
                onZoom={zoom}
                label={`Scale fields of ${current.map((d) => d.machineNo).join(", ")}`}
                tooltip={(t) => [
                  { value: formatTime(t, span), label: "" },
                  ...current.map((d) => {
                    const st = statusAt(d.status, t);
                    const sku = d.skus.find((s) => Date.parse(s.start) <= t && t < Date.parse(s.end));
                    return {
                      value: sku ? (sku.skuCode === "-" ? "No SKU" : sku.skuCode) : "—",
                      label: `${compare ? `${d.machineNo} · ` : ""}${st ? statusLabel(st) : ""}`,
                    };
                  }),
                  ...chart.lines.map((l) => {
                    const { value, range } = valueAt(l.signal, t, bucketMs);
                    return {
                      color: l.color,
                      value: range ? `${formatValue(value, l.signal.unit)} (${formatValue(range[0])}–${formatValue(range[1])})` : formatValue(value, l.signal.unit),
                      label: l.label,
                    };
                  }),
                ]}
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  Status band:
                  {(["RUN", "STOP", "OFF"] as const).map((s) => (
                    <span key={s} className="inline-flex items-center gap-1">
                      <span className="h-2 w-3 rounded-sm" style={{ background: STATUS_FILL[s] }} />
                      {statusLabel(s)}
                    </span>
                  ))}
                </span>
                {chart.normalized && <span>{chart.axes.length} units: each field is scaled to its own range. Hover for the values.</span>}
              </div>
            </>
          )}
        </Card>

        {/* SKU runs */}
        {compare ? (
          current.map((d, i) => (
            <details key={d.machineId} open={i === 0} className="group rounded-xl border border-slate-200 bg-surface">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3">
                <span className="font-semibold text-slate-900">{d.machineNo}</span>
                <span className="text-xs text-slate-500">SKU runs · {d.skus.length}</span>
                <ChevronDown size={16} className="ml-auto text-slate-400 transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t border-slate-100">{skuTable(d)}</div>
            </details>
          ))
        ) : (
          <Card className="p-0">
            <div className="px-4 py-3">
              <h3 className="font-semibold text-slate-900">SKU Runs</h3>
            </div>
            <div className="border-t border-slate-100">{skuTable(primary)}</div>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
          <Scale size={20} className="text-(--brand)" /> Scale Monitoring
        </h2>
        <p className="text-sm text-slate-500">
          Trend of the weight scale fields with the SKU running
          {selected.length ? ` · ${selected.map((m) => m.machineNo).join(", ")}` : ""}
          {primary && ` · 1 point = ${primary.bucketSeconds < 60 ? `${primary.bucketSeconds} s` : `${primary.bucketSeconds / 60} min`}`}
          {preset && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" /> Live
            </span>
          )}
        </p>
      </div>
      {machines?.length !== 0 && controls}
      {error && current && <p className="text-sm text-red-600">{error}</p>}
      <div className={loading && current ? "opacity-60 transition-opacity" : undefined}>{body}</div>
      {current && <p className="text-xs text-slate-400">Drag across the chart to zoom in. Only the fields chosen in the machine&apos;s scale settings are recorded.</p>}
    </div>
  );
}

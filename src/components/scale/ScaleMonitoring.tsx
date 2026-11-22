"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, RotateCcw, Scale } from "lucide-react";
import TrendChart, { formatTime, formatValue, statusAt, statusLabel, valueAt } from "@/components/trend/TrendChart";
import { buttonStyles } from "@/components/ui/Modal";
import { machineApi } from "@/lib/machine-api";
import type { MachineRegistration } from "@/types/machine";
import type { ScaleMonitor, ScaleSkuSegment } from "@/types/scale";

// Scale monitoring: one weight signal of a machine (a Yamato scale field, or any numeric signal of the machine),
// its low / high limit read from tags (by default the scale's own Low limit / High limit), and the SKUs run on the
// machine (from the product tag) with their target weight from SKU Management. Every reading is checked against
// the limits of its time; per SKU run the readings are summarised to find deviating scales.

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
const LINE_COLOR = "var(--series-1)";
/** SKU strip colors, by order of first appearance. */
const SKU_COLORS = ["#3987e5", "#c98500", "#199e70", "#d55181", "#9085e9", "#d95926", "#008300", "#e66767"];

const inputClass =
  "h-9 rounded-lg border border-slate-200 bg-surface px-3 text-sm text-slate-800 focus:border-blue-400 focus:outline-none";
const pad = (n: number) => String(n).padStart(2, "0");
const localInput = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const num = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const fmtNum = (v: number | null) => (v === null ? "—" : num.format(v));
const pct = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0);

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-slate-200 bg-surface p-4 ${className}`}>{children}</div>;
}

const hasLimit = (s: ScaleSkuSegment) => s.low !== null || s.high !== null;
/** Whether a SKU run deviates: readings out of the limits, or its average outside them. */
function deviates(s: ScaleSkuSegment) {
  if (s.count === 0) return false;
  const avgOut = s.avg !== null && ((s.low !== null && s.avg < s.low) || (s.high !== null && s.avg > s.high));
  return avgOut || s.below + s.above > 0;
}

export default function ScaleMonitoring() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [machines, setMachines] = useState<MachineRegistration[] | null>(null);
  const [data, setData] = useState<{ key: string; value: ScaleMonitor } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hoverT, setHoverT] = useState<number | null>(null);
  const request = useRef(0);

  const machineId = params.get("machine") ?? "";
  const signalKey = params.get("signal") ?? "";
  const lowKey = params.get("low") ?? "";
  const highKey = params.get("high") ?? "";
  const rangeKey = (PRESETS.some((p) => p.key === params.get("range")) || params.get("range") === "custom"
    ? params.get("range")
    : "8h") as RangeKey;
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
            // Machines with a scale first.
            .sort(
              (a, b) =>
                Number(!!b.scale?.enabled) - Number(!!a.scale?.enabled) ||
                a.machineNo.localeCompare(b.machineNo, undefined, { numeric: true })
            )
        )
      )
      .catch((err: Error) => setError(err.message));
  }, []);

  // Without a machine in the URL, open the first one (a machine with a scale when there is one).
  useEffect(() => {
    if (machines?.length && !machines.some((m) => m.id === machineId)) {
      setParams({ machine: machines[0].id, signal: null, low: null, high: null });
    }
  }, [machines, machineId, setParams]);

  const key = `${machineId}|${signalKey}|${lowKey}|${highKey}`;
  const load = useCallback(() => {
    if (!machineId) return;
    const now = Date.now();
    const from = preset ? now - preset.ms : custom ? customFrom : now - 8 * HOUR;
    const to = preset ? now : custom ? customTo : now;
    const id = ++request.current;
    machineApi
      .scaleMonitor(machineId, from, to, { signal: signalKey, low: lowKey, high: highKey })
      .then((value) => {
        if (id !== request.current) return;
        setData({ key, value });
        setError(null);
      })
      .catch((err: Error) => id === request.current && setError(err.message))
      .finally(() => id === request.current && setLoading(false));
  }, [machineId, signalKey, lowKey, highKey, key, preset, custom, customFrom, customTo]);

  useEffect(() => {
    load();
    if (!preset) return;
    const timer = setInterval(load, preset.refreshMs);
    return () => clearInterval(timer);
  }, [load, preset]);

  const current = data && data.key === key ? data.value : null;
  const signal = current?.signal ?? null;
  const from = current ? Date.parse(current.from) : 0;
  const to = current ? Date.parse(current.to) : 0;
  const span = to - from;
  const bucketMs = (current?.bucketSeconds ?? 1) * 1000;
  const unit = signal?.unit ?? "";

  const skuColor = useMemo(() => {
    const codes = [...new Set((current?.skus ?? []).map((s) => s.skuCode).filter((c) => c !== "-"))];
    return (code: string) => (code === "-" ? "var(--color-slate-300)" : SKU_COLORS[codes.indexOf(code) % SKU_COLORS.length]);
  }, [current]);

  const skuAt = (t: number) => current?.skus.find((s) => Date.parse(s.start) <= t && t < Date.parse(s.end)) ?? null;
  const bandAt = (t: number) => current?.bands.find((b) => b.from <= t && t < b.to) ?? null;

  // Totals over the range (readings where a limit is set).
  const totals = (current?.skus ?? []).reduce(
    (acc, s) => ({
      count: acc.count + (hasLimit(s) ? s.count : 0),
      below: acc.below + s.below,
      above: acc.above + s.above,
    }),
    { count: 0, below: 0, above: 0 }
  );
  const running = current?.skus.at(-1) ?? null;
  const latest = signal ? (signal.points.at(-1)?.[1] ?? signal.start) : null;
  const latestOut =
    latest !== null && running && ((running.low !== null && latest < running.low) || (running.high !== null && latest > running.high));
  const limitName = (k: string | null) => (k ? (current?.signals.find((s) => s.key === k)?.name ?? k) : null);

  // ---- controls
  const signalOptions = current?.signals ?? [];
  const controls = (
    <Card className="flex flex-wrap items-end gap-3">
      <label className="min-w-48">
        <span className="mb-1 block text-xs font-medium text-slate-600">Machine</span>
        <select
          value={machineId}
          onChange={(e) => setParams({ machine: e.target.value, signal: null, low: null, high: null })}
          className={`${inputClass} w-full`}
          disabled={!machines?.length}
        >
          {machines?.map((m) => (
            <option key={m.id} value={m.id}>
              {m.machineNo}
              {m.machineName ? ` · ${m.machineName}` : ""}
              {m.scale?.enabled ? " · scale" : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="min-w-52">
        <span className="mb-1 block text-xs font-medium text-slate-600">Weight signal</span>
        <select
          value={signal?.key ?? ""}
          onChange={(e) => setParams({ signal: e.target.value })}
          className={`${inputClass} w-full`}
          disabled={!signalOptions.length}
        >
          {signalOptions.map((s) => (
            <option key={s.key} value={s.key}>
              {s.name}
              {s.unit ? ` (${s.unit})` : ""}
            </option>
          ))}
        </select>
      </label>
      {(
        [
          ["low", "Low limit (LL) tag", current?.lowKey ?? null],
          ["high", "High limit (HL) tag", current?.highKey ?? null],
        ] as const
      ).map(([param, label, chosen]) => (
        <label key={param} className="min-w-44">
          <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
          <select
            value={chosen ?? "none"}
            onChange={(e) => setParams({ [param]: e.target.value })}
            className={`${inputClass} w-full`}
            disabled={!current}
          >
            <option value="none">None</option>
            {signalOptions.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
                {s.unit ? ` (${s.unit})` : ""}
              </option>
            ))}
          </select>
        </label>
      ))}
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
              onClick={() => current && setParams({ range: "custom", from: String(from), to: String(to), back: preset?.key ?? params.get("back") })}
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
        disabled={loading || !machineId}
        className={`${buttonStyles.secondary} w-9 px-0`}
        aria-label="Refresh"
        title="Refresh"
      >
        <RefreshCw size={16} className={loading ? "animate-spin" : undefined} />
      </button>
    </Card>
  );

  // ---- body
  let body: React.ReactNode;
  if (!current) {
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
            Loading…
          </>
        )}
      </div>
    );
  } else if (!signal) {
    body = <p className="py-16 text-center text-sm text-slate-500">This machine has no numeric signal to monitor.</p>;
  } else {
    const outCount = totals.below + totals.above;
    const noLimits = !current.lowKey && !current.highKey;
    body = (
      <div className="space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <p className="text-xs font-medium text-slate-500 uppercase">Running SKU</p>
            <p className="mt-1 font-mono text-xl font-bold text-slate-900">{running && running.skuCode !== "-" ? running.skuCode : "—"}</p>
            <p className="truncate text-xs text-slate-500">
              {running?.productName ?? ""}
              {running?.target != null ? ` · weight ${formatValue(running.target, unit)}` : ""}
            </p>
          </Card>
          <Card>
            <p className="text-xs font-medium text-slate-500 uppercase">Limits now ({unit || "value"})</p>
            {running && hasLimit(running) ? (
              <p className="mt-1 text-xl font-bold text-slate-900 tabular-nums">
                <span className="text-base font-medium text-slate-500">LL </span>
                {fmtNum(running.low)}
                <span className="text-base font-medium text-slate-500"> · HL </span>
                {fmtNum(running.high)}
              </p>
            ) : (
              <p className="mt-1 text-sm text-amber-600">{noLimits ? "No limit tags chosen." : "No limit readings yet."}</p>
            )}
            <p className="truncate text-xs text-slate-500">
              {[limitName(current.lowKey), limitName(current.highKey)].filter(Boolean).join(" · ") || "Choose the LL / HL tags above"}
            </p>
          </Card>
          <Card>
            <p className="text-xs font-medium text-slate-500 uppercase">Latest {signal.name}</p>
            <p className={`mt-1 text-xl font-bold tabular-nums ${latestOut ? "text-red-600" : "text-slate-900"}`}>{formatValue(latest, unit)}</p>
            <p className="text-xs text-slate-500">
              {latest !== null && running?.target != null
                ? `${latest - running.target >= 0 ? "+" : ""}${num.format(latest - running.target)} vs SKU weight (${num.format(pct(latest - running.target, running.target))}%)`
                : " "}
            </p>
          </Card>
          <Card className={outCount ? "border-red-200" : ""}>
            <p className="text-xs font-medium text-slate-500 uppercase">Out of limits (range)</p>
            <p className={`mt-1 flex items-center gap-2 text-xl font-bold tabular-nums ${outCount ? "text-red-600" : "text-emerald-600"}`}>
              {outCount ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
              {num.format(pct(outCount, totals.count))}%
            </p>
            <p className="text-xs text-slate-500">
              {num.format(outCount)} of {num.format(totals.count)} readings · {num.format(totals.below)} under LL · {num.format(totals.above)} over HL
            </p>
          </Card>
        </div>
        {current.truncated && (
          <p className="text-xs text-amber-600">Many readings in this range: the counts cover the newest 300,000. Choose a shorter range for exact counts.</p>
        )}

        {/* Chart with the SKU strip */}
        <Card>
          <div className="mb-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full" style={{ background: LINE_COLOR }} /> {signal.name}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 border-t-2 border-dashed border-[#22A447]" /> SKU weight
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 border-t-2 border-dashed border-[#E5484D]" /> LL / HL
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[#E5484D]" /> Out of limits
            </span>
          </div>
          <div className="relative mb-1 h-5 overflow-hidden rounded bg-slate-100" style={{ marginLeft: 46, marginRight: 14 }}>
            {current.skus.map((s) => {
              const left = ((Date.parse(s.start) - from) / (span || 1)) * 100;
              const width = ((Date.parse(s.end) - Date.parse(s.start)) / (span || 1)) * 100;
              return (
                <div
                  key={s.start}
                  title={`${s.skuCode === "-" ? "No SKU" : `${s.skuCode} · ${s.productName}`} · ${formatTime(Date.parse(s.start), span)}–${formatTime(Date.parse(s.end), span)}`}
                  className="absolute inset-y-0 flex items-center justify-center overflow-hidden border-r border-white/70 text-[10px] font-medium whitespace-nowrap text-white"
                  style={{ left: `${left}%`, width: `${width}%`, background: skuColor(s.skuCode) }}
                >
                  {width > 6 ? (s.skuCode === "-" ? "No SKU" : s.skuCode) : ""}
                </div>
              );
            })}
          </div>
          <TrendChart
            series={[{ signal, color: LINE_COLOR, axis: 0 }]}
            axes={[{ label: unit || signal.name }]}
            from={from}
            to={to}
            bucketMs={bucketMs}
            status={current.status}
            height={380}
            hoverT={hoverT}
            onHover={setHoverT}
            onZoom={(a, b) =>
              setParams({ range: "custom", from: String(Math.round(a)), to: String(Math.round(b)), back: preset?.key ?? params.get("back") })
            }
            specBands={current.bands}
            label={`${current.machineNo} ${signal.name}`}
            tooltip={(t) => {
              const st = statusAt(current.status, t);
              const sku = skuAt(t);
              const band = bandAt(t);
              const { value, range } = valueAt(signal, t, bucketMs);
              return [
                { value: formatTime(t, span), label: st ? statusLabel(st) : "" },
                { value: sku ? (sku.skuCode === "-" ? "No SKU" : sku.skuCode) : "—", label: band?.target != null ? `weight ${fmtNum(band.target)}` : "SKU" },
                { value: `${fmtNum(band?.low ?? null)} – ${fmtNum(band?.high ?? null)}`, label: "LL – HL" },
                {
                  color: LINE_COLOR,
                  value: range ? `${formatValue(value, unit)} (${formatValue(range[0])}–${formatValue(range[1])})` : formatValue(value, unit),
                  label: signal.name,
                },
              ];
            }}
          />
          <p className="mt-1 text-xs text-slate-400">
            Drag across the chart to zoom in. The strip above the chart shows the SKU on the product tag; the limits follow
            their tags over time.
          </p>
        </Card>

        {/* Per SKU run */}
        <Card className="p-0">
          <div className="px-4 py-3">
            <h3 className="font-semibold text-slate-900">Per SKU Run</h3>
          </div>
          <div className="overflow-x-auto border-t border-slate-100">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">SKU</th>
                  <th className="px-4 py-2 font-medium">Time</th>
                  <th className="px-4 py-2 text-right font-medium">SKU weight</th>
                  <th className="px-4 py-2 text-right font-medium">LL / HL</th>
                  <th className="px-4 py-2 text-right font-medium">Readings</th>
                  <th className="px-4 py-2 text-right font-medium">Avg</th>
                  <th className="px-4 py-2 text-right font-medium">Min / Max</th>
                  <th className="px-4 py-2 text-right font-medium">Std dev</th>
                  <th className="px-4 py-2 text-right font-medium">Avg vs weight</th>
                  <th className="px-4 py-2 text-right font-medium">Out of limits</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {[...current.skus].reverse().map((s) => {
                  const bad = deviates(s);
                  const diff = s.avg !== null && s.target !== null ? s.avg - s.target : null;
                  const out = s.below + s.above;
                  return (
                    <tr key={s.start} className={bad ? "bg-red-50/50" : undefined}>
                      <td className="px-4 py-2">
                        <span className="flex items-center gap-2">
                          <span className="size-2.5 shrink-0 rounded-sm" style={{ background: skuColor(s.skuCode) }} />
                          <span className="font-mono font-medium text-slate-900">{s.skuCode === "-" ? "No SKU" : s.skuCode}</span>
                        </span>
                        <span className="block max-w-48 truncate text-xs text-slate-500">{s.productName}</span>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-slate-600">
                        {formatTime(Date.parse(s.start), span)} – {formatTime(Date.parse(s.end), span)}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-700">{fmtNum(s.target)}</td>
                      <td className="px-4 py-2 text-right whitespace-nowrap text-slate-700" title={s.limitsChanged ? "Limits changed during this run; shown: at its end" : undefined}>
                        {hasLimit(s) ? `${fmtNum(s.low)} / ${fmtNum(s.high)}` : <span className="text-slate-400">—</span>}
                        {s.limitsChanged && <span className="ml-1 text-[10px] text-amber-600">changed</span>}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-700">{num.format(s.count)}</td>
                      <td className="px-4 py-2 text-right font-semibold text-slate-900">{formatValue(s.avg, unit)}</td>
                      <td className="px-4 py-2 text-right whitespace-nowrap text-slate-600">
                        {fmtNum(s.min)} / {fmtNum(s.max)}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-600">{fmtNum(s.stdDev)}</td>
                      <td
                        className={`px-4 py-2 text-right whitespace-nowrap ${
                          diff === null ? "text-slate-400" : Math.abs(pct(diff, s.target!)) > 2 ? "text-amber-600" : "text-slate-700"
                        }`}
                      >
                        {diff === null ? "—" : `${diff >= 0 ? "+" : ""}${num.format(diff)} (${num.format(pct(diff, s.target!))}%)`}
                      </td>
                      <td className={`px-4 py-2 text-right whitespace-nowrap ${out ? "font-semibold text-red-600" : "text-slate-500"}`}>
                        {!hasLimit(s) ? "—" : `${num.format(pct(out, s.count))}% (${num.format(s.below)}↓ ${num.format(s.above)}↑)`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  }

  const machine = machines?.find((m) => m.id === machineId);
  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
          <Scale size={20} className="text-(--brand)" /> Scale Monitoring
        </h2>
        <p className="text-sm text-slate-500">
          Weight readings against their low / high limit tags and the SKU weight, to catch scale deviations
          {machine ? ` · ${machine.machineNo}${machine.machineName ? ` · ${machine.machineName}` : ""}` : ""}
          {preset && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" /> Live
            </span>
          )}
        </p>
      </div>
      {controls}
      {error && current && <p className="text-sm text-red-600">{error}</p>}
      <div className={loading && current ? "opacity-60 transition-opacity" : undefined}>{body}</div>
    </div>
  );
}

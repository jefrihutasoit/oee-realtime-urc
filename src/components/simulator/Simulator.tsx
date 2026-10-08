"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, Loader2, Send } from "lucide-react";
import { statusStyles } from "@/config/oee";
import { machineApi } from "@/lib/machine-api";
import { settingsApi } from "@/lib/settings-api";
import { skuApi } from "@/lib/sku-api";
import { tagApi } from "@/lib/tag-api";
import type { MachineRegistration } from "@/types/machine";
import type { MachineStatus } from "@/types/oee";
import type { StatusDefinition } from "@/types/settings";
import type { SkuMaster } from "@/types/sku";
import type { TagReading } from "@/types/tag";

type Role = "STATUS" | "OUTPUT" | "REJECT" | "PRODUCT" | "MONITOR";

interface TagRow {
  key: string;
  role: Role;
  label: string;
  tagName: string;
}

const REFRESH_MS = 3000;
const SKU_LIST_ID = "simulator-sku-options";
const STATUSES: { status: MachineStatus; key: "run" | "stop" | "off" }[] = [
  { status: "RUN", key: "run" },
  { status: "STOP", key: "stop" },
  { status: "OFF", key: "off" },
];

const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function rowsOf(m: MachineRegistration): TagRow[] {
  return [
    { key: `${m.id}:status`, role: "STATUS", label: "Status", tagName: m.tagStatus },
    { key: `${m.id}:output`, role: "OUTPUT", label: "Output", tagName: m.tagOutput },
    { key: `${m.id}:reject`, role: "REJECT", label: "Reject", tagName: m.tagReject },
    { key: `${m.id}:product`, role: "PRODUCT", label: "Product", tagName: m.tagProduct },
    ...m.monitoringTags.map((t) => ({ key: `${m.id}:${t.id}`, role: "MONITOR" as const, label: t.name, tagName: t.tagName })),
  ];
}

function resolveStatus(raw: string | undefined, def: StatusDefinition | null): MachineStatus {
  if (raw === undefined || !def) return "OFF";
  const v = Number(raw);
  if (def.run.includes(v)) return "RUN";
  if (def.stop.includes(v)) return "STOP";
  if (def.off.includes(v)) return "OFF";
  return def.unmatched;
}

export default function Simulator() {
  const [machines, setMachines] = useState<MachineRegistration[] | null>(null);
  const [statusDef, setStatusDef] = useState<StatusDefinition | null>(null);
  const [skus, setSkus] = useState<SkuMaster[]>([]);
  const [latest, setLatest] = useState<Map<string, TagReading>>(new Map());
  const [recent, setRecent] = useState<TagReading[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [machineFilter, setMachineFilter] = useState("ALL");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const showToast = (text: string, tone: "ok" | "error" = "ok") => setToast({ text, tone });

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const refreshValues = useCallback(() => {
    Promise.all([tagApi.latest(), tagApi.recent(20)])
      .then(([l, r]) => {
        setLatest(new Map(l.map((x) => [x.tagName, x])));
        setRecent(r);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    Promise.all([machineApi.list(), settingsApi.getStatusDefinition(), skuApi.list()])
      .then(([m, def, s]) => {
        setMachines(m);
        setStatusDef(def);
        setSkus(s);
        setLoadError(null);
        refreshValues();
      })
      .catch((err: Error) => setLoadError(err.message));
  }, [refreshValues]);

  useEffect(() => {
    load();
    const timer = setInterval(refreshValues, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load, refreshValues]);

  const skuById = useMemo(() => new Map(skus.map((s) => [s.skuId.toLowerCase(), s])), [skus]);
  const machineByTag = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of machines ?? []) for (const r of rowsOf(m)) if (!map.has(r.tagName)) map.set(r.tagName, `${m.machineNo} · ${r.label}`);
    return map;
  }, [machines]);

  async function push(row: TagRow, value: string) {
    if (!value.trim()) return showToast("Enter a value first", "error");
    setPending((p) => new Set(p).add(row.key));
    try {
      const saved = await tagApi.push({ tagName: row.tagName, value: value.trim() });
      setLatest((map) => new Map(map).set(saved.tagName, saved));
      setRecent((list) => [saved, ...list].slice(0, 20));
      setInputs((i) => ({ ...i, [row.key]: "" }));
      showToast(`${row.tagName} = ${saved.value}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Push failed", "error");
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(row.key);
        return next;
      });
    }
  }

  if (!machines) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-sm text-slate-500">
        {loadError ? (
          <>
            <p className="text-red-600">{loadError}</p>
            <button type="button" onClick={load} className="font-medium text-[#1E6FD9] hover:underline">
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
  }

  const shown = machines.filter((m) => machineFilter === "ALL" || m.id === machineFilter);

  return (
    <div className="space-y-4">
      <datalist id={SKU_LIST_ID}>
        {skus.map((s) => (
          <option key={s.id} value={s.skuId}>
            {s.productName}
          </option>
        ))}
      </datalist>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Simulator</h2>
          <p className="max-w-2xl text-sm text-slate-500">
            Acts as the gateway: each push is written to the <code className="text-xs">tag_values</code> table, and the
            machine dashboard picks it up on the next poll (about 2 seconds).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              aria-label="Machine"
              value={machineFilter}
              onChange={(e) => setMachineFilter(e.target.value)}
              className="h-10 appearance-none rounded-lg border border-slate-200 bg-white pr-9 pl-3 text-sm text-slate-700 focus:border-blue-400 focus:outline-none"
            >
              <option value="ALL">All machines</option>
              {machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.machineNo} · {m.machineName}
                </option>
              ))}
            </select>
            <ChevronDown
              size={16}
              className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-slate-500"
            />
          </div>
          <Link
            href="/dashboard/machine"
            className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Open dashboard
          </Link>
        </div>
      </div>

      {machines.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No machines registered.{" "}
          <Link href="/settings/machines" className="font-medium text-[#1E6FD9] hover:underline">
            Register a machine
          </Link>{" "}
          to get tags to simulate.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {shown.map((m) => (
            <section
              key={m.id}
              aria-disabled={!m.isActive || undefined}
              className={`overflow-hidden rounded-xl border ${
                m.isActive ? "border-slate-200 bg-white" : "border-dashed border-slate-300 bg-slate-100"
              }`}
            >
              <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
                <h3 className={`text-base font-semibold ${m.isActive ? "text-slate-900" : "text-slate-400"}`}>
                  {m.machineNo}
                </h3>
                <span className="text-sm text-slate-500">{m.machineName}</span>
                {!m.isActive && (
                  <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-500">
                    Inactive – activate it in Machine Management to simulate
                  </span>
                )}
                {m.isActive && !m.oeeEnabled && (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">Status only (OEE off)</span>
                )}
              </header>

              {/* Inactive machines are disabled: greyed out and not interactive. */}
              <div inert={!m.isActive} className={`overflow-x-auto ${m.isActive ? "" : "opacity-50 grayscale"}`}>
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-500">
                    <tr>
                      <th className="w-56 px-4 py-2 font-medium">Tag</th>
                      <th className="w-52 px-4 py-2 font-medium">Current value</th>
                      <th className="px-4 py-2 font-medium">Push new value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rowsOf(m).map((row) => {
                      const current = latest.get(row.tagName);
                      const busy = pending.has(row.key);
                      const input = inputs[row.key] ?? "";
                      const currentNumber = Number(current?.value ?? 0) || 0;
                      const sku = row.role === "PRODUCT" && current ? skuById.get(current.value.toLowerCase()) : undefined;
                      const status = row.role === "STATUS" ? resolveStatus(current?.value, statusDef) : null;

                      return (
                        <tr key={row.key} className="align-top">
                          <td className="px-4 py-2.5">
                            <span className="block font-medium text-slate-800">{row.label}</span>
                            <span className="block font-mono text-xs break-all text-slate-500">{row.tagName}</span>
                          </td>
                          <td className="px-4 py-2.5">
                            {current ? (
                              <>
                                <span className="font-mono font-semibold text-slate-900">{current.value}</span>
                                {status && (
                                  <span className={`ml-2 rounded px-1.5 py-0.5 text-xs font-medium ${statusStyles[status].pill}`}>
                                    {statusStyles[status].label}
                                  </span>
                                )}
                                {row.role === "PRODUCT" && (
                                  <span className={`ml-2 text-xs ${sku ? "text-slate-600" : "text-amber-600"}`}>
                                    {sku ? sku.productName : "Unknown SKU"}
                                  </span>
                                )}
                                <span className="block text-xs text-slate-400">
                                  {timeFmt.format(new Date(current.timestamp))}
                                </span>
                              </>
                            ) : (
                              <span className="text-xs text-slate-400">No value pushed yet</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <form
                              className="flex flex-wrap items-center gap-2"
                              onSubmit={(e) => {
                                e.preventDefault();
                                push(row, input);
                              }}
                            >
                              <input
                                value={input}
                                onChange={(e) => setInputs((i) => ({ ...i, [row.key]: e.target.value }))}
                                inputMode={row.role === "PRODUCT" ? "text" : "decimal"}
                                list={row.role === "PRODUCT" ? SKU_LIST_ID : undefined}
                                placeholder={row.role === "PRODUCT" ? "SKU ID" : "Value"}
                                aria-label={`New value for ${row.tagName}`}
                                autoComplete="off"
                                className="h-9 w-32 rounded-lg border border-slate-200 px-3 font-mono text-sm focus:border-blue-400 focus:outline-none"
                              />
                              <button
                                type="submit"
                                disabled={busy}
                                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#1E6FD9] px-3 text-sm font-medium text-white hover:bg-[#185DB8] disabled:opacity-60"
                              >
                                {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                                Push
                              </button>

                              {row.role === "STATUS" &&
                                statusDef &&
                                STATUSES.filter((s) => statusDef[s.key].length > 0).map((s) => (
                                  <button
                                    key={s.status}
                                    type="button"
                                    disabled={busy}
                                    onClick={() => push(row, String(statusDef[s.key][0]))}
                                    className={`h-9 rounded-lg px-2.5 text-xs font-medium ring-1 ring-slate-200 hover:ring-slate-300 disabled:opacity-60 ${statusStyles[s.status].pill}`}
                                  >
                                    {statusStyles[s.status].label} ({statusDef[s.key][0]})
                                  </button>
                                ))}

                              {(row.role === "OUTPUT" || row.role === "REJECT") &&
                                [1, 10, 100].map((n) => (
                                  <button
                                    key={n}
                                    type="button"
                                    disabled={busy}
                                    onClick={() => push(row, String(currentNumber + n))}
                                    className="h-9 rounded-lg px-2.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-60"
                                  >
                                    +{n}
                                  </button>
                                ))}
                            </form>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>

        <aside className="h-fit rounded-xl border border-slate-200 bg-white">
          <h3 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">Recent pushes</h3>
          {recent.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">Nothing pushed yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recent.map((r) => (
                <li key={r.id} className="px-4 py-2 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-slate-700">{machineByTag.get(r.tagName) ?? r.tagName}</span>
                    <span className="font-mono font-semibold text-slate-900">{r.value}</span>
                  </div>
                  <div className="flex justify-between gap-2 text-xs text-slate-400">
                    <span className="truncate font-mono">{r.tagName}</span>
                    <span className="shrink-0">{timeFmt.format(new Date(r.timestamp))}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      {toast && (
        <div
          role="status"
          className={`fixed right-4 bottom-4 z-50 max-w-sm rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-lg ${
            toast.tone === "ok" ? "bg-slate-900" : "bg-red-600"
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

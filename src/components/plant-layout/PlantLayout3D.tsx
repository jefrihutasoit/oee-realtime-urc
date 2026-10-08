"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2 } from "lucide-react";
import { OEE_TARGET, oeeWaitLabels } from "@/config/oee";
import { useLiveMachines, type LiveMachine } from "@/hooks/useLiveMachines";
import { assetUrl } from "@/lib/api";
import { layoutApi } from "@/lib/layout-api";
import type { PlantLayout } from "@/types/layout";
import type { MachineStatus } from "@/types/oee";
import { PlantScene } from "./plant-scene";

type PinState = MachineStatus | "NO_DATA" | "INACTIVE";

/** Lamp colours per state; hex because they also drive the 3D materials. */
export const PIN_STYLES: Record<PinState, { label: string; color: string }> = {
  RUN: { label: "Run", color: "#22c55e" },
  STOP: { label: "Stop", color: "#f59e0b" },
  OFF: { label: "Off", color: "#64748b" },
  NO_DATA: { label: "No data", color: "#94a3b8" },
  INACTIVE: { label: "Inactive", color: "#cbd5e1" },
};

export const pinStateOf = (m: LiveMachine): PinState => (!m.isActive ? "INACTIVE" : (m.status ?? "NO_DATA"));

const HIDE_DELAY_MS = 180;
const fmt = new Intl.NumberFormat("en-US");

function duration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

function MachineCard({ machine }: { machine: LiveMachine }) {
  const state = pinStateOf(machine);
  const { color, label } = PIN_STYLES[state];
  const live = machine.live;
  const sku = live && live.sku.code !== "-" ? live.sku : null;

  return (
    <div className="w-64 overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-xl">
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
        <span className="size-2.5 rounded-full" style={{ background: color }} />
        <span className="font-semibold text-slate-900">{machine.machineNo}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-slate-500">{machine.machineName}</span>
        <span className="rounded px-1.5 py-0.5 text-[11px] font-medium" style={{ background: `${color}22`, color }}>
          {label}
        </span>
      </div>

      {!machine.isActive ? (
        <p className="px-3 py-3 text-xs text-slate-500">Machine is inactive.</p>
      ) : !machine.oeeEnabled ? (
        <p className="px-3 py-3 text-xs text-slate-500">Status only – OEE is disabled for this machine.</p>
      ) : !live ? (
        <p className="px-3 py-3 text-xs text-slate-500">Waiting for the first OEE calculation…</p>
      ) : (
        <div className="space-y-2.5 px-3 py-2.5">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[11px] text-slate-500">OEE</p>
              <p
                className={`text-2xl leading-none font-semibold tabular-nums ${
                  live.oee >= OEE_TARGET ? "text-emerald-600" : live.oee >= 60 ? "text-amber-600" : "text-red-600"
                }`}
              >
                {live.oee.toFixed(1)}%
              </p>
            </div>
            <dl className="grid grid-cols-3 gap-2 text-center text-[11px]">
              {(
                [
                  ["A", live.availability],
                  ["P", live.performance],
                  ["Q", live.quality],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-slate-400">{k}</dt>
                  <dd className="font-semibold text-slate-800 tabular-nums">{v.toFixed(0)}%</dd>
                </div>
              ))}
            </dl>
          </div>

          {live.waitingFor && (
            <p className="rounded bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">
              {oeeWaitLabels[live.waitingFor]}
            </p>
          )}

          <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- SKU photos are served by the backend */}
            <img
              src={assetUrl(sku?.image ?? null) ?? "/products/sku-1.svg"}
              alt=""
              className="size-9 shrink-0 object-contain"
            />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-slate-800">{sku?.name ?? "No active SKU"}</p>
              <p className="font-mono text-[11px] text-slate-500">{sku?.code ?? "—"}</p>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <dt className="text-slate-500">Output</dt>
            <dd className="text-right font-medium text-slate-900 tabular-nums">
              {fmt.format(live.output)} / {fmt.format(live.idealOutput)}
            </dd>
            <dt className="text-slate-500">Reject</dt>
            <dd className="text-right font-medium text-red-600 tabular-nums">{fmt.format(live.reject)}</dd>
            <dt className="text-slate-500">Uptime</dt>
            <dd className="text-right font-medium text-emerald-700 tabular-nums">{duration(live.uptimeSeconds)}</dd>
            <dt className="text-slate-500">Stop</dt>
            <dd className="text-right font-medium text-amber-600 tabular-nums">
              {duration(live.stopSeconds)} · {live.stopCount}×
            </dd>
          </dl>
        </div>
      )}

      {machine.isActive && (
        <Link
          href={`/dashboard/machine/${encodeURIComponent(machine.id)}`}
          className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-xs font-medium text-[#1E6FD9] hover:bg-slate-50"
        >
          Open machine details
          <ChevronRight size={14} />
        </Link>
      )}
    </div>
  );
}

export default function PlantLayout3D() {
  const router = useRouter();
  const { machines, connected } = useLiveMachines();
  const [layout, setLayout] = useState<PlantLayout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [cardBelow, setCardBelow] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<PlantScene | null>(null);
  const machineEls = useRef(new Map<string, HTMLElement>());
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    layoutApi
      .get()
      .then(setLayout)
      .catch((err: Error) => setError(err.message));
  }, []);

  const show = useCallback((id: string) => {
    clearTimeout(hideTimer.current);
    // Open the card below the label when the label is near the top of the view.
    const label = machineEls.current.get(id)?.getBoundingClientRect();
    const view = viewportRef.current?.getBoundingClientRect();
    setCardBelow(!!label && !!view && label.top - view.top < 320);
    setHovered(id);
  }, []);

  const scheduleHide = useCallback(() => {
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setHovered(null), HIDE_DELAY_MS);
  }, []);

  const ready = !!layout;

  useEffect(() => {
    const el = canvasRef.current;
    if (!el || !ready) return;
    const scene = new PlantScene(el);
    machineEls.current.forEach((label, id) => scene.machineLabels.set(id, label));
    scene.onHover = (id) => (id ? show(id) : scheduleHide());
    scene.onSelect = (id) => router.push(`/dashboard/machine/${encodeURIComponent(id)}`);
    sceneRef.current = scene;
    return () => {
      clearTimeout(hideTimer.current);
      scene.dispose();
      sceneRef.current = null;
    };
  }, [ready, show, scheduleHide, router]);

  const byId = useMemo(() => new Map((machines ?? []).map((m) => [m.id, m])), [machines]);
  const placed = useMemo(
    () =>
      (layout?.markers ?? []).flatMap((mk) => {
        const m = byId.get(mk.machineId);
        return m ? [{ marker: mk, machine: m }] : [];
      }),
    [layout, byId]
  );

  useEffect(() => {
    sceneRef.current?.setMachines(
      placed.map(({ marker, machine }) => {
        const state = pinStateOf(machine);
        return {
          id: machine.id,
          x: marker.x,
          y: marker.y,
          color: PIN_STYLES[state].color,
          status: state === "RUN" || state === "STOP" || state === "OFF" ? state : "NONE",
          dim: state === "INACTIVE",
        };
      })
    );
  }, [placed, ready]);

  useEffect(() => sceneRef.current?.setHovered(hovered), [hovered]);

  const registerMachine = (id: string) => (el: HTMLElement | null) => {
    if (el) {
      machineEls.current.set(id, el);
      sceneRef.current?.machineLabels.set(id, el);
    } else {
      machineEls.current.delete(id);
      sceneRef.current?.machineLabels.delete(id);
    }
  };

  const unplaced = (machines ?? []).filter((m) => !layout?.markers.some((mk) => mk.machineId === m.id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">Dashboard / Layout</p>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
            Plant Layout
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                connected ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
              }`}
            >
              <span className={`size-1.5 rounded-full ${connected ? "animate-pulse bg-emerald-500" : "bg-slate-400"}`} />
              {connected ? "Live" : "Offline"}
            </span>
          </h2>
        </div>
        <Link
          href="/settings/layout"
          className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Edit machine positions
        </Link>
      </div>

      {error ? (
        <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-red-600">{error}</p>
      ) : !layout ? (
        <div className="flex justify-center rounded-xl border border-slate-200 bg-white py-24 text-slate-500">
          <Loader2 className="animate-spin" />
        </div>
      ) : (
        <div
          ref={viewportRef}
          className="relative h-[calc(100vh-220px)] min-h-[460px] overflow-hidden rounded-xl border border-slate-200 bg-[#dde4ec]"
        >
          <div ref={canvasRef} className="absolute inset-0" />

          {/* Labels are positioned every frame by the scene. */}
          <div className="pointer-events-none absolute inset-0">
            {placed.map(({ machine }) => {
              const state = pinStateOf(machine);
              const { color, label } = PIN_STYLES[state];
              const open = hovered === machine.id;
              return (
                <div
                  key={machine.id}
                  ref={registerMachine(machine.id)}
                  className="pointer-events-auto absolute top-0 left-0 pb-1"
                  style={{ display: "none" }}
                  onMouseEnter={() => show(machine.id)}
                  onMouseLeave={scheduleHide}
                >
                  <button
                    type="button"
                    onClick={() => router.push(`/dashboard/machine/${encodeURIComponent(machine.id)}`)}
                    onFocus={() => show(machine.id)}
                    onBlur={scheduleHide}
                    className={`flex items-center gap-1.5 rounded-full border-2 bg-white px-2 py-0.5 text-[11px] font-bold whitespace-nowrap text-slate-900 shadow-md ${
                      state === "INACTIVE" ? "opacity-60" : ""
                    }`}
                    style={{ borderColor: color, boxShadow: `0 0 10px ${color}88` }}
                  >
                    <span className={`size-2 rounded-full ${state === "STOP" ? "animate-pulse" : ""}`} style={{ background: color }} />
                    {machine.machineNo}
                    <span className="font-medium text-slate-500">{label}</span>
                  </button>
                  {open && (
                    <div className={`absolute left-1/2 -translate-x-1/2 ${cardBelow ? "top-full pt-2" : "bottom-full pb-1"}`}>
                      <MachineCard machine={machine} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {layout && unplaced.length > 0 && (
        <p className="text-sm text-slate-500">
          Not on the layout yet:{" "}
          <span className="font-medium text-slate-700">{unplaced.map((m) => m.machineNo).join(", ")}</span>
          {" · "}
          <Link href="/settings/layout" className="font-medium text-[#1E6FD9] hover:underline">
            Place them
          </Link>
        </p>
      )}
    </div>
  );
}

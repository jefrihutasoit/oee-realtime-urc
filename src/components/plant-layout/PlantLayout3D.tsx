"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import MachineInfoCard, { PIN_STYLES, pinStateOf } from "@/components/dashboard/MachineInfoCard";
import { useLiveMachines } from "@/hooks/useLiveMachines";
import { assetUrl } from "@/lib/api";
import { layoutApi } from "@/lib/layout-api";
import type { PlantLayout } from "@/types/layout";
import { loadLayoutImage, PlantScene } from "./plant-scene";
import PlantSidePanel from "./PlantSidePanel";
import ViewControls from "./ViewControls";

const HIDE_DELAY_MS = 180;
/** The machine clicked last, kept across visits in this browser. */
const SELECTED_KEY = "oee-layout-selected";

export default function PlantLayout3D() {
  const { machines, connected } = useLiveMachines();
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    try {
      return typeof window === "undefined" ? null : localStorage.getItem(SELECTED_KEY);
    } catch {
      return null;
    }
  });
  const select = useCallback((id: string) => {
    setSelectedId(id);
    try {
      localStorage.setItem(SELECTED_KEY, id);
    } catch {
      // Storage blocked: the selection just is not remembered.
    }
  }, []);
  const [layout, setLayout] = useState<PlantLayout | null>(null);
  /** Uploaded layout image; null shows the built-in model, undefined while it loads. */
  const [image, setImage] = useState<HTMLImageElement | null | undefined>(undefined);
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
      .then(async (l) => {
        setImage(await loadLayoutImage(assetUrl(l.image)));
        setLayout(l);
      })
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

  const ready = !!layout && image !== undefined;

  useEffect(() => {
    const el = canvasRef.current;
    if (!el || !ready) return;
    const scene = new PlantScene(el, image);
    machineEls.current.forEach((label, id) => scene.machineLabels.set(id, label));
    scene.onHover = (id) => (id ? show(id) : scheduleHide());
    // A click shows the machine in the side panel; its card links to the detail page.
    scene.onSelect = (id) => select(id);
    sceneRef.current = scene;
    return () => {
      clearTimeout(hideTimer.current);
      scene.dispose();
      sceneRef.current = null;
    };
  }, [ready, image, show, scheduleHide, select]);

  const byId = useMemo(() => new Map((machines ?? []).map((m) => [m.id, m])), [machines]);
  const placed = useMemo(
    () =>
      (layout?.markers ?? []).flatMap((mk) => {
        const m = byId.get(mk.machineId);
        return m ? [{ marker: mk, machine: m }] : [];
      }),
    [layout, byId],
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
          status: state === "NO_DATA" || state === "INACTIVE" ? "NONE" : state,
          dim: state === "INACTIVE",
        };
      }),
    );
  }, [placed, ready, image]);

  useEffect(() => sceneRef.current?.setHovered(hovered), [hovered]);
  useEffect(() => sceneRef.current?.setHomeView(layout?.view ?? null), [layout, ready, image]);
  useEffect(() => sceneRef.current?.setIndicator(layout?.indicator ?? "ring"), [layout, ready, image]);
  useEffect(() => sceneRef.current?.setMarkerScale(layout?.markerSize ?? 1), [layout, ready, image]);

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
  const selected = (selectedId && byId.get(selectedId)) || null;

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
              <span
                className={`size-1.5 rounded-full ${connected ? "animate-pulse bg-emerald-500" : "bg-slate-400"}`}
              />
              {connected ? "Live" : "Offline"}
            </span>
          </h2>
        </div>
        <Link
          href="/settings/layout"
          className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-surface px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Edit layout
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="order-2 lg:order-1 lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto">
          <PlantSidePanel machines={machines ?? []} selected={selected} />
        </aside>
        <div className="order-1 lg:order-2">
          {error ? (
            <p className="rounded-xl border border-slate-200 bg-surface p-8 text-center text-sm text-red-600">
              {error}
            </p>
          ) : !ready ? (
            <div className="flex justify-center rounded-xl border border-slate-200 bg-surface py-24 text-slate-500">
              <Loader2 className="animate-spin" />
            </div>
          ) : (
            <div
              ref={viewportRef}
              className="relative h-[calc(100vh-220px)] min-h-[460px] overflow-hidden rounded-xl border border-slate-200 bg-[#dde4ec]"
            >
              <div ref={canvasRef} className="absolute inset-0" />
              <ViewControls scene={() => sceneRef.current} />

              {/* Labels are positioned every frame by the scene. */}
              <div className="pointer-events-none absolute inset-0">
                {placed.map(({ machine }) => {
                  const state = pinStateOf(machine);
                  const { color, label } = PIN_STYLES[state];
                  const open = hovered === machine.id;
                  const isSelected = selectedId === machine.id;
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
                        onClick={() => select(machine.id)}
                        aria-pressed={isSelected}
                        onFocus={() => show(machine.id)}
                        onBlur={scheduleHide}
                        className={`flex items-center gap-1.5 rounded-full border-2 bg-surface px-2 py-0.5 text-[11px] font-bold whitespace-nowrap text-slate-900 shadow-md ${
                          state === "INACTIVE" ? "opacity-60" : ""
                        } ${isSelected ? "scale-110 ring-2 ring-(--brand) ring-offset-1" : ""}`}
                        style={{ borderColor: color, boxShadow: `0 0 10px ${color}88`, zoom: layout.markerSize }}
                      >
                        <span
                          className={`size-2 rounded-full ${state === "STOP" ? "animate-pulse" : ""}`}
                          style={{ background: color }}
                        />
                        {machine.machineNo}
                        <span className="font-medium text-slate-500">{label}</span>
                      </button>
                      {open && (
                        <div
                          className={`absolute left-1/2 -translate-x-1/2 ${cardBelow ? "top-full pt-2" : "bottom-full pb-1"}`}
                        >
                          <MachineInfoCard machine={machine} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {layout && unplaced.length > 0 && (
        <p className="text-sm text-slate-500">
          Not on the layout yet:{" "}
          <span className="font-medium text-slate-700">{unplaced.map((m) => m.machineNo).join(", ")}</span>
          {" · "}
          <Link href="/settings/layout" className="font-medium text-(--brand) hover:underline">
            Place them
          </Link>
        </p>
      )}
    </div>
  );
}

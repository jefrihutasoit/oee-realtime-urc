"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, MapPin, Save, Undo2, X } from "lucide-react";
import { buttonStyles } from "@/components/ui/Modal";
import { layoutApi } from "@/lib/layout-api";
import { machineApi } from "@/lib/machine-api";
import type { LayoutMarker, PlantLayout } from "@/types/layout";
import type { MachineRegistration } from "@/types/machine";
import { PlantScene } from "./plant-scene";

type Point = { x: number; y: number };

const PIN_COLOR = "#1E6FD9";
const SELECTED_COLOR = "#E4002B";

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);
const inside = (p: Point) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
const toDraft = (markers: LayoutMarker[]) => new Map(markers.map((m) => [m.machineId, { x: m.x, y: m.y }]));

export default function LayoutMapping() {
  const [layout, setLayout] = useState<PlantLayout | null>(null);
  const [machines, setMachines] = useState<MachineRegistration[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Map<string, Point>>(new Map());
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<PlantScene | null>(null);
  const labelEls = useRef(new Map<string, HTMLElement>());
  /** Machine being dragged; a finished drag must not also count as a click on the floor. */
  const dragging = useRef<string | null>(null);
  const suppressClick = useRef(false);

  const showToast = (text: string, tone: "ok" | "error" = "ok") => setToast({ text, tone });

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  function load() {
    Promise.all([layoutApi.get(), machineApi.list()])
      .then(([l, m]) => {
        setLayout(l);
        setMachines(m);
        setDraft(toDraft(l.markers));
        setDirty(false);
        setLoadError(null);
      })
      .catch((err: Error) => setLoadError(err.message));
  }

  useEffect(load, []);

  const ready = !!layout && !!machines;

  useEffect(() => {
    const el = canvasRef.current;
    if (!el || !ready) return;
    const scene = new PlantScene(el);
    labelEls.current.forEach((label, id) => scene.machineLabels.set(id, label));
    sceneRef.current = scene;
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, [ready]);

  useEffect(() => {
    const byId = new Map((machines ?? []).map((m) => [m.id, m]));
    sceneRef.current?.setMachines(
      [...draft].flatMap(([id, p]) => {
        const m = byId.get(id);
        if (!m) return [];
        return [{ id, ...p, color: id === selected ? SELECTED_COLOR : PIN_COLOR, status: "NONE" as const, dim: !m.isActive }];
      })
    );
    sceneRef.current?.setHovered(selected);
  }, [draft, machines, selected, ready]);

  const registerLabel = (id: string) => (el: HTMLElement | null) => {
    if (el) {
      labelEls.current.set(id, el);
      sceneRef.current?.machineLabels.set(id, el);
    } else {
      labelEls.current.delete(id);
      sceneRef.current?.machineLabels.delete(id);
    }
  };

  function place(machineId: string, p: Point) {
    setDraft((d) => new Map(d).set(machineId, p));
    setDirty(true);
  }

  function startDrag(machineId: string, pointerId: number) {
    dragging.current = machineId;
    setSelected(machineId);
    viewportRef.current?.setPointerCapture(pointerId);
  }

  function handlePointerDown(e: React.PointerEvent) {
    const scene = sceneRef.current;
    if (!scene || e.target !== scene.canvas) return;
    const id = scene.pick(e);
    if (id) startDrag(id, e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragging.current) return;
    const p = sceneRef.current?.floorPoint(e);
    if (p) place(dragging.current, { x: clamp01(p.x), y: clamp01(p.y) });
  }

  function handlePointerUp() {
    if (dragging.current) suppressClick.current = true;
    dragging.current = null;
  }

  function handleSceneClick(e: React.MouseEvent) {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    const scene = sceneRef.current;
    if (!scene || e.target !== scene.canvas) return;
    if (!selected) return showToast("Select a machine on the left first", "error");
    const p = scene.floorPoint(e);
    if (!p || !inside(p)) return;
    place(selected, p);
    // Continue with the next machine that has no position yet.
    const next = machines?.find((m) => m.id !== selected && !draft.has(m.id));
    setSelected(next?.id ?? null);
  }

  function removeMarker(machineId: string) {
    setDraft((d) => {
      const next = new Map(d);
      next.delete(machineId);
      return next;
    });
    setDirty(true);
  }

  async function save() {
    setBusy(true);
    try {
      const saved = await layoutApi.saveMarkers([...draft].map(([machineId, p]) => ({ machineId, ...p })));
      setLayout(saved);
      setDraft(toDraft(saved.markers));
      setDirty(false);
      showToast("Machine positions saved");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!layout || !machines) {
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
            Loading layout…
          </>
        )}
      </div>
    );
  }

  const byId = new Map(machines.map((m) => [m.id, m]));
  const placedCount = machines.filter((m) => draft.has(m.id)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">Settings / Layout Mapping</p>
          <h2 className="text-xl font-semibold text-slate-900">Layout Mapping</h2>
          <p className="text-sm text-slate-500">
            Select a machine, then click its unit on the 3D layout. Positions show live Run / Stop / Off on{" "}
            <Link href="/dashboard/layout" className="font-medium text-[#1E6FD9] hover:underline">
              Dashboard → Layout
            </Link>
            .
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setDraft(toDraft(layout.markers));
              setDirty(false);
            }}
            disabled={!dirty || busy}
            className={buttonStyles.secondary}
          >
            <Undo2 size={16} />
            Discard
          </button>
          <button type="button" onClick={save} disabled={!dirty || busy} className={buttonStyles.primary}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save positions
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="h-fit rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-2.5">
            <h3 className="text-sm font-semibold text-slate-900">Machines</h3>
            <p className="text-xs text-slate-500">
              {placedCount} of {machines.length} placed · select one, then click on the layout
            </p>
          </div>
          {machines.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">
              No machines registered.{" "}
              <Link href="/settings/machines" className="text-[#1E6FD9] hover:underline">
                Register one
              </Link>
            </p>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-slate-100 overflow-auto">
              {machines.map((m) => {
                const p = draft.get(m.id);
                const isSelected = selected === m.id;
                return (
                  <li key={m.id}>
                    <div
                      className={`flex items-center gap-2 px-3 py-2 ${
                        isSelected ? "bg-blue-50 ring-1 ring-[#1E6FD9] ring-inset" : "hover:bg-slate-50"
                      } ${m.isActive ? "" : "opacity-60"}`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelected(isSelected ? null : m.id)}
                        aria-pressed={isSelected}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <MapPin size={16} className={p ? "text-[#1E6FD9]" : "text-slate-300"} />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-slate-900">
                            {m.machineNo}
                            {!m.isActive && <span className="ml-1 text-[10px] font-normal text-slate-400">inactive</span>}
                          </span>
                          <span className="block truncate text-xs text-slate-500">
                            {isSelected ? "Click on the layout to place" : p ? "Placed" : "Not placed"}
                          </span>
                        </span>
                      </button>
                      {p && (
                        <button
                          type="button"
                          onClick={() => removeMarker(m.id)}
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          aria-label={`Remove ${m.machineNo} from layout`}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
            {selected
              ? `Placing ${byId.get(selected)?.machineNo}: click its position on the layout, or drag it`
              : "Drag a machine to move it, or select one on the left to place it"}
          </p>
          <div
            ref={viewportRef}
            className={`relative h-[calc(100vh-260px)] min-h-[460px] touch-none overflow-hidden bg-[#dde4ec] ${
              selected ? "cursor-crosshair" : ""
            }`}
            onClick={handleSceneClick}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <div ref={canvasRef} className="absolute inset-0" />

            {/* Labels are positioned every frame by the scene. */}
            <div className="pointer-events-none absolute inset-0">
              {[...draft.keys()].map((machineId) => {
                const m = byId.get(machineId);
                if (!m) return null;
                return (
                  <div
                    key={machineId}
                    ref={registerLabel(machineId)}
                    className="pointer-events-auto absolute top-0 left-0 pb-1"
                    style={{ display: "none" }}
                  >
                    <button
                      type="button"
                      title={`${m.machineNo} – ${m.machineName} (drag to move)`}
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        startDrag(machineId, e.pointerId);
                      }}
                      className={`cursor-grab rounded-md px-1.5 py-0.5 text-[11px] font-bold whitespace-nowrap text-white shadow active:cursor-grabbing ${
                        m.isActive ? "" : "opacity-60"
                      }`}
                      style={{ background: selected === machineId ? SELECTED_COLOR : PIN_COLOR }}
                    >
                      {m.machineNo}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {toast && (
        <div
          role="status"
          className={`fixed right-4 bottom-4 z-50 rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-lg ${
            toast.tone === "ok" ? "bg-slate-900" : "bg-red-600"
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

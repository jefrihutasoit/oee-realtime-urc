"use client";

import { useState, type ReactNode } from "react";
import { Minus, Move, Plus, Rotate3d, RotateCcw } from "lucide-react";
import { PlantScene } from "./plant-scene";

const btn =
  "flex size-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40";
const active = "bg-blue-50 text-(--brand) hover:bg-blue-50 hover:text-(--brand)";

type DragMode = typeof PlantScene.dragMode;

/** Drag mode, zoom and reset buttons over the 3D layout, plus page-specific actions in `children`. */
export default function ViewControls({ scene, children }: { scene: () => PlantScene | null; children?: ReactNode }) {
  const [mode, setMode] = useState<DragMode>(PlantScene.dragMode);

  const choose = (next: DragMode) => {
    setMode(next);
    scene()?.setDragMode(next);
  };

  const modeButton = (value: DragMode, label: string, icon: ReactNode) => (
    <button
      type="button"
      className={`${btn} ${mode === value ? active : ""}`}
      onClick={() => choose(value)}
      aria-pressed={mode === value}
      title={`Drag to ${label.toLowerCase()}`}
      aria-label={`Drag to ${label.toLowerCase()}`}
    >
      {icon}
    </button>
  );

  return (
    <div className="pointer-events-none absolute right-3 bottom-3 z-[200001] flex flex-col items-end gap-1.5">
      <div className="pointer-events-auto flex items-center gap-0.5 rounded-lg border border-slate-200 bg-surface p-0.5 shadow-md">
        {modeButton("rotate", "Rotate", <Rotate3d size={16} />)}
        {modeButton("pan", "Pan", <Move size={16} />)}
        <span className="mx-0.5 h-5 w-px bg-slate-200" />
        <button type="button" className={btn} onClick={() => scene()?.zoom(0.8)} title="Zoom in" aria-label="Zoom in">
          <Plus size={16} />
        </button>
        <button type="button" className={btn} onClick={() => scene()?.zoom(1.25)} title="Zoom out" aria-label="Zoom out">
          <Minus size={16} />
        </button>
        <button type="button" className={btn} onClick={() => scene()?.resetView()} title="Reset view" aria-label="Reset view">
          <RotateCcw size={15} />
        </button>
        {children}
      </div>
      <p className="rounded bg-surface/80 px-1.5 py-0.5 text-[10px] text-slate-500">
        {mode === "rotate" ? "Drag to rotate · right-drag or Shift+drag to pan" : "Drag to pan · right-drag to rotate"} · scroll to
        zoom
      </p>
    </div>
  );
}

export { btn as viewButtonStyle };

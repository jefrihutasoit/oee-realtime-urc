"use client";

import { useCallback, useSyncExternalStore } from "react";
import { machineApi } from "@/lib/machine-api";
import type { MachineRegistration } from "@/types/machine";

/**
 * Display units of the output and reject counters, set per machine in Machine Management.
 * Loaded once, and updated when machines are saved. Totals over several machines show a unit
 * only when all of those machines share it.
 */
export interface ProductionUnits {
  output: string;
  reject: string;
}

type UnitSource = Pick<MachineRegistration, "id" | "outputUnit" | "rejectUnit">;

const DEFAULT_UNIT = "pcs";
const EMPTY = new Map<string, ProductionUnits>();
let units = EMPTY;
let started = false;
const listeners = new Set<() => void>();

/** Applies the machine list to every component that shows output / reject units. */
export function applyMachineUnits(machines: UnitSource[]) {
  units = new Map(machines.map((m) => [m.id, { output: m.outputUnit, reject: m.rejectUnit }]));
  listeners.forEach((l) => l());
}

/** Reloads the units after machines changed. */
export function refreshMachineUnits() {
  return machineApi.list().then(applyMachineUnits).catch(() => {});
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!started) {
    started = true;
    refreshMachineUnits();
  }
  return () => listeners.delete(listener);
}

/** The one value all entries share, or "" when they differ. */
function common(values: string[]) {
  return values.length > 0 && values.every((v) => v === values[0]) ? values[0] : "";
}

/** Units of the given machines (all machines when omitted); "" where they differ. */
export function unitsOf(map: Map<string, ProductionUnits>, machineIds?: Iterable<string>): ProductionUnits {
  if (map.size === 0) return { output: DEFAULT_UNIT, reject: DEFAULT_UNIT }; // not loaded yet
  const list = machineIds
    ? [...machineIds].flatMap((id) => map.get(id) ?? [])
    : [...map.values()];
  if (list.length === 0) return { output: DEFAULT_UNIT, reject: DEFAULT_UNIT };
  return { output: common(list.map((u) => u.output)), reject: common(list.map((u) => u.reject)) };
}

/** Returns `unitsOf(machineIds?)` bound to the current machine units. */
export function useProductionUnits() {
  const map = useSyncExternalStore(subscribe, () => units, () => EMPTY);
  return useCallback((machineIds?: Iterable<string>) => unitsOf(map, machineIds), [map]);
}

/** "1,234 pcs", or just "1,234" when there is no unit. */
export const withUnit = (value: string, unit: string) => (unit ? `${value} ${unit}` : value);

/** "Output (pcs)", or just "Output" when there is no unit. */
export const labelWithUnit = (label: string, unit: string) => (unit ? `${label} (${unit})` : label);

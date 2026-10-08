"use client";

import { useSyncExternalStore } from "react";
import { settingsApi } from "@/lib/settings-api";
import type { OeeSettings } from "@/types/settings";

/**
 * The name the dashboards use for the OEE machines: "Machine", or the global replacement from the OEE
 * settings (e.g. "Bagger"). Loaded once, and updated when the OEE settings are saved.
 */
export interface MachineLabel {
  /** Singular, e.g. "Bagger". */
  one: string;
  /** Plural, e.g. "Baggers". */
  many: string;
}

const DEFAULT: MachineLabel = { one: "Machine", many: "Machines" };
let label = DEFAULT;
let started = false;
const listeners = new Set<() => void>();

const plural = (word: string) => (/s$/i.test(word) ? word : `${word}s`);

/** Applies saved OEE settings to every component that shows the name. */
export function applyMachineLabel(settings: Pick<OeeSettings, "machineLabelEnabled" | "machineLabel">) {
  const one = settings.machineLabelEnabled && settings.machineLabel.trim() ? settings.machineLabel.trim() : "Machine";
  label = one === "Machine" ? DEFAULT : { one, many: plural(one) };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!started) {
    started = true;
    settingsApi.getOeeSettings().then(applyMachineLabel).catch(() => {});
  }
  return () => listeners.delete(listener);
}

export function useMachineLabel() {
  return useSyncExternalStore(subscribe, () => label, () => DEFAULT);
}

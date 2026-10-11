"use client";

import { useSyncExternalStore } from "react";
import { apiRequest } from "@/lib/api";
import { DEFAULT_APPEARANCE, type AppearanceSettings } from "@/types/system";

/**
 * The theme (System Management → Theme), the same for every user and the dashboards. Applied as
 * <html data-theme data-accent>; globals.css does the rest. The last theme is kept in localStorage so the
 * next page load starts with it (see THEME_BOOT_SCRIPT) instead of flashing the light theme.
 */

export const APPEARANCE_STORAGE_KEY = "oee-appearance";

export const ACCENTS: { value: AppearanceSettings["accent"]; label: string; color: string }[] = [
  { value: "blue", label: "Blue", color: "#1e6fd9" },
  { value: "teal", label: "Teal", color: "#0f9d8a" },
  { value: "indigo", label: "Indigo", color: "#4f46e5" },
  { value: "green", label: "Green", color: "#16a34a" },
  { value: "red", label: "URC Red", color: "#e4002b" },
  { value: "orange", label: "Orange", color: "#ea580c" },
];

let current: AppearanceSettings = DEFAULT_APPEARANCE;
let started = false;
const listeners = new Set<() => void>();

function paint(a: AppearanceSettings) {
  const root = document.documentElement;
  root.dataset.theme = a.mode;
  root.dataset.accent = a.accent;
}

/** Shows a theme right away (also used to preview it before saving). */
export function applyAppearance(a: AppearanceSettings, remember = true) {
  current = a;
  paint(a);
  if (remember) {
    try {
      localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(a));
    } catch {
      // Private mode or blocked storage: the theme still applies to this page.
    }
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!started) {
    started = true;
    try {
      const saved = localStorage.getItem(APPEARANCE_STORAGE_KEY);
      if (saved) current = { ...DEFAULT_APPEARANCE, ...JSON.parse(saved) };
    } catch {
      // Ignore unreadable storage.
    }
    appearanceApi
      .get()
      .then((a) => applyAppearance(a))
      .catch(() => {});
  }
  return () => listeners.delete(listener);
}

export function useAppearance() {
  return useSyncExternalStore(subscribe, () => current, () => DEFAULT_APPEARANCE);
}

export const appearanceApi = {
  get: () => apiRequest<AppearanceSettings>("/settings/appearance"),
  save: (a: AppearanceSettings) =>
    apiRequest<AppearanceSettings>("/settings/appearance", { method: "PUT", body: JSON.stringify(a) }),
};

/** Runs before the page paints: applies the last known theme from localStorage. */
export const THEME_BOOT_SCRIPT = `(function(){try{var a=JSON.parse(localStorage.getItem(${JSON.stringify(
  APPEARANCE_STORAGE_KEY
)})||"{}");var r=document.documentElement;r.dataset.theme=a.mode==="dark"?"dark":"light";r.dataset.accent=a.accent||"blue";}catch(e){}})()`;

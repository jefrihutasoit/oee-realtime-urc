"use client";

import { useSyncExternalStore } from "react";
import { apiRequest } from "@/lib/api";
import { setLicenseRequiredHandler } from "@/lib/session";
import type { LicenseStatus } from "@/types/license";

/**
 * License state as a small external store: checked when the app starts, again whenever the backend
 * answers LICENSE_REQUIRED (e.g. the license expired while the app was open), and after an import.
 */
export type LicenseState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: LicenseStatus };

const LOADING: LicenseState = { status: "loading" };
/** Also notices an expired license on a page that makes no other requests. */
const RECHECK_MS = 60_000;
let state: LicenseState = LOADING;
let started = false;
const listeners = new Set<() => void>();

function set(next: LicenseState) {
  state = next;
  listeners.forEach((l) => l());
}

export function refreshLicense() {
  return apiRequest<LicenseStatus>("/license")
    .then((data) => set({ status: "ready", data }))
    .catch((err: Error) => {
      // Keep showing the last known state when a refresh fails.
      if (state.status !== "ready") set({ status: "error", message: err.message });
    });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!started && typeof window !== "undefined") {
    started = true;
    setLicenseRequiredHandler(() => void refreshLicense());
    void refreshLicense();
    setInterval(() => void refreshLicense(), RECHECK_MS);
  }
  return () => listeners.delete(listener);
}

export function useLicense() {
  return useSyncExternalStore(subscribe, () => state, () => LOADING);
}

/** Installs a license file (Engineering only); the backend verifies it against this hardware. */
export async function installLicense(content: string) {
  const data = await apiRequest<LicenseStatus>("/license", { method: "POST", body: JSON.stringify({ content }) });
  set({ status: "ready", data });
  return data;
}

"use client";

import { useEffect, useState } from "react";
import { shiftApi } from "@/lib/shift-api";
import type { ShiftPeriod } from "@/types/shift";

const REFRESH_MS = 60_000;

/** The shift running now according to the backend, refreshed every minute. */
export function useCurrentShift() {
  const [shift, setShift] = useState<ShiftPeriod | null>(null);

  useEffect(() => {
    const load = () =>
      shiftApi
        .current()
        .then(setShift)
        .catch(() => {});
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  return shift;
}

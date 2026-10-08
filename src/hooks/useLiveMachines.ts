"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiGet } from "@/lib/api";
import { machineApi } from "@/lib/machine-api";
import { getSocket } from "@/lib/socket";
import type { MachineRegistration } from "@/types/machine";
import type { MachineOee, MachineStatus } from "@/types/oee";

/**
 * A registered machine with its live data. Inactive machines are included (shown disabled) but have
 * no status. `live` holds the OEE figures and is null when OEE is disabled or not received yet.
 */
export interface LiveMachine {
  id: string;
  machineNo: string;
  machineName: string;
  line: string;
  isActive: boolean;
  oeeEnabled: boolean;
  status: MachineStatus | null;
  live: MachineOee | null;
}

const toMap = (list: MachineOee[]) => new Map(list.map((o) => [o.machineId, o]));

/**
 * Machines come from the registry (database); OEE comes from GET /oee for the first paint
 * and then from the "oee:update" socket event on every gateway poll.
 */
export function useLiveMachines() {
  const [registry, setRegistry] = useState<MachineRegistration[] | null>(null);
  const [oee, setOee] = useState<Map<string, MachineOee>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const knownIds = useRef<Set<string>>(new Set());
  const loadingRegistry = useRef(false);

  const loadRegistry = useCallback(() => {
    if (loadingRegistry.current) return;
    loadingRegistry.current = true;
    machineApi
      .list()
      .then((list) => {
        setRegistry(list);
        setError(null);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => {
        loadingRegistry.current = false;
      });
  }, []);

  const reload = useCallback(() => {
    loadRegistry();
    apiGet<MachineOee[]>("/oee")
      .then((list) => setOee(toMap(list)))
      .catch(() => {});
  }, [loadRegistry]);

  useEffect(() => {
    knownIds.current = new Set(registry?.map((m) => m.id));
  }, [registry]);

  useEffect(() => {
    reload();

    const socket = getSocket();
    const onUpdate = (list: MachineOee[]) => {
      setConnected(true);
      setOee(toMap(list));
      // A machine registered elsewhere shows up in OEE before we know about it.
      if (list.some((o) => !knownIds.current.has(o.machineId))) loadRegistry();
    };
    const onDisconnect = () => setConnected(false);
    socket.on("oee:update", onUpdate);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onDisconnect);
    return () => {
      socket.off("oee:update", onUpdate);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onDisconnect);
    };
  }, [reload, loadRegistry]);

  const machines = useMemo<LiveMachine[] | null>(
    () =>
      registry
        ?.map((m) => {
          const entry = m.isActive ? (oee.get(m.id) ?? null) : null;
          return {
            id: m.id,
            machineNo: m.machineNo,
            machineName: m.machineName,
            line: entry?.line ?? `Line ${m.machineNo[0]}`,
            isActive: m.isActive,
            oeeEnabled: m.oeeEnabled,
            status: entry?.status ?? null,
            live: entry?.oeeEnabled && m.oeeEnabled ? entry : null,
          };
        })
        // Inactive machines go last.
        .sort((a, b) => Number(b.isActive) - Number(a.isActive)) ?? null,
    [registry, oee]
  );

  return { machines, error, connected, reload };
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { machineApi } from "@/lib/machine-api";
import { skuApi } from "@/lib/sku-api";
import { getSocket } from "@/lib/socket";
import type { MachineRegistration } from "@/types/machine";
import type { MachineHistory, MachineMonitoring, MachineOee, MachineTimeline } from "@/types/oee";
import type { SkuMaster } from "@/types/sku";

const HISTORY_REFRESH_MS = 5000;

/**
 * Everything the machine detail page shows. OEE and monitoring values arrive over the socket;
 * the logs and the status timeline are polled because they are not pushed.
 */
export function useMachineDetail(id: string) {
  const [machine, setMachine] = useState<MachineRegistration | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<MachineOee | null>(null);
  const [monitoring, setMonitoring] = useState<MachineMonitoring | null>(null);
  const [history, setHistory] = useState<MachineHistory | null>(null);
  const [timeline, setTimeline] = useState<MachineTimeline | null>(null);
  const [skus, setSkus] = useState<SkuMaster[]>([]);
  const [connected, setConnected] = useState(false);

  const loadMachine = useCallback(() => {
    machineApi
      .get(id)
      .then((m) => {
        setMachine(m);
        setError(null);
      })
      .catch((err: Error) => setError(err.message));
  }, [id]);

  const refreshHistory = useCallback(() => {
    machineApi
      .history(id)
      .then(setHistory)
      .catch(() => {});
    machineApi
      .timeline(id)
      .then(setTimeline)
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    loadMachine();
    refreshHistory();
    skuApi.list().then(setSkus).catch(() => {});
    machineApi
      .oee()
      .then((list) => setLive(list.find((o) => o.machineId === id) ?? null))
      .catch(() => {});
    machineApi
      .monitoring(id)
      .then(setMonitoring)
      .catch(() => {});

    const historyTimer = setInterval(refreshHistory, HISTORY_REFRESH_MS);

    const socket = getSocket();
    const subscribe = () => socket.emit("monitoring:subscribe", id);
    const onOee = (list: MachineOee[]) => {
      setConnected(true);
      setLive(list.find((o) => o.machineId === id) ?? null);
    };
    const onMonitoring = (data: MachineMonitoring) => {
      if (data.machineId === id) setMonitoring(data);
    };
    const onDisconnect = () => setConnected(false);

    socket.on("oee:update", onOee);
    socket.on("monitoring:update", onMonitoring);
    socket.on("connect", subscribe); // rooms are lost on reconnect
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onDisconnect);
    subscribe();

    return () => {
      clearInterval(historyTimer);
      socket.emit("monitoring:unsubscribe", id);
      socket.off("oee:update", onOee);
      socket.off("monitoring:update", onMonitoring);
      socket.off("connect", subscribe);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onDisconnect);
    };
  }, [id, loadMachine, refreshHistory]);

  return { machine, error, live, monitoring, history, timeline, skus, connected, reload: loadMachine };
}

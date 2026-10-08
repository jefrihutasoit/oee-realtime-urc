"use client";

import { useEffect, useState } from "react";
import { shiftApi } from "@/lib/shift-api";
import { todayYmd } from "@/lib/reject-sheet";
import type { RejectRecord } from "@/types/reject";
import type { Shift } from "@/types/shift";
import ManualRejectForm from "./ManualRejectForm";
import RejectDataTable from "./RejectDataTable";

export default function ManualRejectInput() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [filter, setFilter] = useState({ date: todayYmd(), shiftId: "" });
  const [reloadToken, setReloadToken] = useState(0);
  const [editing, setEditing] = useState<RejectRecord | null>(null);
  /** Remounts the form, so it starts empty after a save. */
  const [formKey, setFormKey] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    shiftApi.list().then(setShifts).catch((err: Error) => setLoadError(err.message));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  function handleSaved(record: RejectRecord) {
    setToast(`Reject data of ${record.machineNo} (${record.skuId}, ${record.shiftName}) saved`);
    setEditing(null);
    setFormKey((n) => n + 1);
    setFilter({ date: record.productionDate, shiftId: record.shiftId });
    setReloadToken((n) => n + 1);
  }

  function edit(record: RejectRecord | null) {
    setEditing(record);
    setFormKey((n) => n + 1);
    if (record) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Manual Reject Input</h2>
        <p className="text-sm text-slate-500">
          Enter reject quantities per machine and SKU when there is no reject sheet to upload.
        </p>
      </div>
      {loadError && <p className="text-sm text-red-600">{loadError}</p>}

      <ManualRejectForm
        key={formKey}
        shifts={shifts}
        initial={editing ?? undefined}
        onSaved={handleSaved}
        onCancel={editing ? () => edit(null) : undefined}
      />

      <RejectDataTable
        shifts={shifts}
        date={filter.date}
        shiftId={filter.shiftId}
        onFilterChange={(date, shiftId) => setFilter({ date, shiftId })}
        reloadToken={reloadToken}
        onEdit={edit}
      />

      {toast && (
        <div
          role="status"
          className="fixed right-4 bottom-4 z-50 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

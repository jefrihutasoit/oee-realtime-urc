"use client";

import { useEffect, useState } from "react";
import { shiftApi } from "@/lib/shift-api";
import { todayYmd } from "@/lib/reject-sheet";
import type { RejectUploadInput, RejectUploadResult } from "@/types/reject";
import type { Shift } from "@/types/shift";
import RejectDataTable from "./RejectDataTable";
import RejectUpload from "./RejectUpload";

export default function RejectInput() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [filter, setFilter] = useState({ date: todayYmd(), shiftId: "" });
  const [reloadToken, setReloadToken] = useState(0);
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

  function handleUploaded(result: RejectUploadResult, input: RejectUploadInput) {
    const added = result.createdTypes.length ? `, new reject types: ${result.createdTypes.join(", ")}` : "";
    setToast(`${result.saved} machines uploaded${result.replaced ? ` (${result.replaced} replaced)` : ""}${added}`);
    // Show what was just uploaded.
    setFilter({ date: input.productionDate, shiftId: input.shiftId });
    setReloadToken((n) => n + 1);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Upload Reject</h2>
        <p className="text-sm text-slate-500">Upload the reject sheet of a shift and review uploaded reject data.</p>
      </div>
      {loadError && <p className="text-sm text-red-600">{loadError}</p>}

      <RejectUpload shifts={shifts} onUploaded={handleUploaded} />

      <RejectDataTable
        shifts={shifts}
        date={filter.date}
        shiftId={filter.shiftId}
        onFilterChange={(date, shiftId) => setFilter({ date, shiftId })}
        reloadToken={reloadToken}
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

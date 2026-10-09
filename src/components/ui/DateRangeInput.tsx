"use client";

import { CalendarDays } from "lucide-react";

/** Two date inputs ("YYYY-MM-DD") in one field: from ~ to. */
export default function DateRangeInput({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
}) {
  return (
    <div className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 focus-within:border-blue-400">
      <CalendarDays size={18} className="shrink-0 text-slate-500" />
      <input
        type="date"
        value={from}
        max={to || undefined}
        onChange={(e) => onChange({ from: e.target.value, to })}
        aria-label="From date"
        className="min-w-0 flex-1 bg-transparent text-sm focus:outline-none"
      />
      <span className="text-slate-400">~</span>
      <input
        type="date"
        value={to}
        min={from || undefined}
        onChange={(e) => onChange({ from, to: e.target.value })}
        aria-label="To date"
        className="min-w-0 flex-1 bg-transparent text-sm focus:outline-none"
      />
    </div>
  );
}

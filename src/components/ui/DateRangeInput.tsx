"use client";

import { CalendarDays } from "lucide-react";

/** Two date inputs ("YYYY-MM-DD") in one field: from ~ to. */
export default function DateRangeInput({
  from,
  to,
  max,
  compact = false,
  onChange,
}: {
  from: string;
  to: string;
  /** Latest date either input accepts. */
  max?: string;
  /** Button height (h-9) instead of form field height (h-10). */
  compact?: boolean;
  onChange: (range: { from: string; to: string }) => void;
}) {
  return (
    <div
      className={`flex ${compact ? "h-9" : "h-10"} items-center gap-2 rounded-lg border border-slate-200 bg-surface px-3 focus-within:border-blue-400`}
    >
      <CalendarDays size={18} className="shrink-0 text-slate-500" />
      <input
        type="date"
        value={from}
        max={to || max || undefined}
        onChange={(e) => onChange({ from: e.target.value, to })}
        aria-label="From date"
        className="min-w-0 flex-1 bg-transparent text-sm focus:outline-none"
      />
      <span className="text-slate-400">~</span>
      <input
        type="date"
        value={to}
        min={from || undefined}
        max={max || undefined}
        onChange={(e) => onChange({ from, to: e.target.value })}
        aria-label="To date"
        className="min-w-0 flex-1 bg-transparent text-sm focus:outline-none"
      />
    </div>
  );
}

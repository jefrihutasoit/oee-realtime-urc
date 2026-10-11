"use client";

import { useState } from "react";
import type { RealtimeMode } from "@/types/machine";

/** Realtime tag modes, as offered in Machine Management. */
export const REALTIME_MODES: { value: RealtimeMode; label: string; hint: string }[] = [
  {
    value: "registered",
    label: "Registered",
    hint: "The monitoring tags set on the machine; values are stored in the database.",
  },
  {
    value: "adaptive",
    label: "Adaptive",
    hint:
      'Every tag in the gateway messages on the machine\'s MQTT topic, except status / output / reject / product. A unit can follow a comma in the tag name ("Temp Limit,C"). Kept in memory only.',
  },
];

/** Expiry presets for adaptive tags, in minutes. */
export const TTL_PRESETS: { minutes: number; label: string }[] = [
  { minutes: 15, label: "15 minutes" },
  { minutes: 60, label: "1 hour" },
  { minutes: 480, label: "1 shift (8 hours)" },
  { minutes: 720, label: "12 hours" },
  { minutes: 1440, label: "24 hours" },
];

export const MAX_TTL_MINUTES = 7 * 24 * 60;

/** "8 h", "15 min", "1 d 2 h". */
export function ttlLabel(minutes: number) {
  const preset = TTL_PRESETS.find((p) => p.minutes === minutes);
  if (preset) return preset.label;
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  return [d && `${d} d`, h && `${h} h`, m && `${m} min`].filter(Boolean).join(" ");
}

/** Expiry picker: presets plus a custom number of minutes. */
export function TtlSelect({
  id,
  value,
  onChange,
  disabled,
  className,
}: {
  id?: string;
  value: number;
  onChange: (minutes: number) => void;
  disabled?: boolean;
  className: string;
}) {
  const [custom, setCustom] = useState(() => !TTL_PRESETS.some((p) => p.minutes === value));
  return (
    <div className="flex gap-2">
      <select
        id={id}
        value={custom ? "custom" : value}
        onChange={(e) => {
          const isCustom = e.target.value === "custom";
          setCustom(isCustom);
          if (!isCustom) onChange(Number(e.target.value));
        }}
        disabled={disabled}
        className={className}
      >
        {TTL_PRESETS.map((p) => (
          <option key={p.minutes} value={p.minutes}>
            {p.label}
          </option>
        ))}
        <option value="custom">Custom…</option>
      </select>
      {custom && (
        <input
          type="number"
          min={1}
          max={MAX_TTL_MINUTES}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={disabled}
          aria-label="Expiry in minutes"
          className={`${className} w-28`}
        />
      )}
    </div>
  );
}

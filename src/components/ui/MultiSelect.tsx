"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

export interface MultiSelectOption {
  value: string;
  /** Text of the chip. */
  label: string;
  /** Extra text in the list, e.g. a product name. */
  hint?: string;
}

/**
 * Dropdown checklist that shows the selection as removable chips. Nothing selected means "all",
 * shown as `placeholder`.
 */
export default function MultiSelect({
  options,
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder: string;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const selected = new Set(value);
  const toggle = (v: string) => onChange(selected.has(v) ? value.filter((x) => x !== v) : [...value, v]);
  const q = search.trim().toLowerCase();
  const shown = q ? options.filter((o) => `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(q)) : options;
  const chips = options.filter((o) => selected.has(o.value));

  return (
    <div ref={root} className="relative">
      <div
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        className="flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white py-1 pr-2 pl-2 text-sm focus:border-blue-400 focus:outline-none"
      >
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {chips.length === 0 && <span className="px-1 text-slate-700">{placeholder}</span>}
          {chips.map((o) => (
            <span key={o.value} className="inline-flex items-center gap-1 rounded-md bg-slate-100 py-0.5 pr-1 pl-2 text-slate-700">
              {o.label}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(o.value);
                }}
                className="rounded p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
                aria-label={`Remove ${o.label}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <ChevronDown size={16} className={`shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </div>

      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-56 rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
            <Search size={14} className="text-slate-400" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="min-w-0 flex-1 text-sm focus:outline-none"
            />
          </div>
          <div className="flex justify-between border-b border-slate-100 px-3 py-1.5 text-xs">
            <button
              type="button"
              onClick={() => onChange([...new Set([...value, ...shown.map((o) => o.value)])])}
              className="font-medium text-[#1E6FD9] hover:underline"
            >
              Select all
            </button>
            <button type="button" onClick={() => onChange([])} className="font-medium text-slate-500 hover:underline">
              Clear ({placeholder})
            </button>
          </div>
          <ul className="max-h-64 overflow-y-auto py-1">
            {shown.length === 0 && <li className="px-3 py-2 text-sm text-slate-400">No match</li>}
            {shown.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => toggle(o.value)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                >
                  <span
                    className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                      selected.has(o.value) ? "border-[#1E6FD9] bg-[#1E6FD9] text-white" : "border-slate-300"
                    }`}
                  >
                    {selected.has(o.value) && <Check size={12} />}
                  </span>
                  <span className="font-medium text-slate-800">{o.label}</span>
                  {o.hint && <span className="truncate text-xs text-slate-500">{o.hint}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

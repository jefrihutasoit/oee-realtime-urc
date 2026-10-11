"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Moon, Sun } from "lucide-react";
import { buttonStyles } from "@/components/ui/Modal";
import { ACCENTS, appearanceApi, applyAppearance, useAppearance } from "@/lib/appearance";
import type { AppearanceSettings } from "@/types/system";

const MODES: { value: AppearanceSettings["mode"]; label: string; icon: typeof Sun; hint: string }[] = [
  { value: "light", label: "Light", icon: Sun, hint: "Bright offices and desks" },
  { value: "dark", label: "Dark", icon: Moon, hint: "Control rooms and wall screens" },
];

/** Theme for every user and the dashboards; previewed live, applied for everyone on save. */
export default function AppearanceForm() {
  const current = useAppearance();
  const [draft, setDraft] = useState<AppearanceSettings>(current);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [savedTheme, setSavedTheme] = useState(current);
  // Mirror of the saved theme for the unmount cleanup: leaving without saving undoes the preview.
  const savedRef = useRef(current);
  useEffect(() => {
    savedRef.current = savedTheme;
  }, [savedTheme]);
  useEffect(() => () => applyAppearance(savedRef.current, false), []);

  const pick = (patch: Partial<AppearanceSettings>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    setMessage(null);
    applyAppearance(next, false); // preview only
  };

  async function save() {
    setSaving(true);
    try {
      const result = await appearanceApi.save(draft);
      setSavedTheme(result);
      applyAppearance(result);
      setMessage({ text: "Theme saved. Every screen uses it from its next refresh.", tone: "ok" });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Failed to save", tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  const changed = draft.mode !== savedTheme.mode || draft.accent !== savedTheme.accent;

  return (
    <div className="max-w-3xl space-y-4">
      <section className="space-y-3 rounded-xl border border-slate-200 bg-surface px-5 py-4">
        <div>
          <h3 className="font-semibold text-slate-900">Mode</h3>
          <p className="text-sm text-slate-500">Applies to every user and to the dashboards, also when not signed in.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {MODES.map(({ value, label, icon: Icon, hint }) => {
            const active = draft.mode === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => pick({ mode: value })}
                aria-pressed={active}
                className={`flex items-center gap-3 rounded-xl border-2 p-3 text-left ${
                  active ? "border-(--brand)" : "border-slate-200 hover:border-slate-300"
                }`}
              >
                {/* Small fixed-color preview of the mode. */}
                <span
                  className={`theme-fixed flex h-14 w-20 shrink-0 flex-col gap-1 rounded-lg border p-1.5 ${
                    value === "dark" ? "border-slate-700 bg-[#0b1220]" : "border-slate-200 bg-[#f3f6fa]"
                  }`}
                >
                  <span className={`h-2 w-10 rounded ${value === "dark" ? "bg-[#111a2b]" : "bg-white"}`} />
                  <span className={`h-5 rounded ${value === "dark" ? "bg-[#111a2b]" : "bg-white"}`} />
                  <span className="h-1.5 w-6 rounded bg-(--brand)" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 font-medium text-slate-900">
                    <Icon size={16} />
                    {label}
                  </span>
                  <span className="text-xs text-slate-500">{hint}</span>
                </span>
                {active && <Check size={18} className="text-(--brand)" />}
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-surface px-5 py-4">
        <div>
          <h3 className="font-semibold text-slate-900">Accent color</h3>
          <p className="text-sm text-slate-500">Buttons, links and highlights. Status colors (Run, Stop, Off) do not change.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {ACCENTS.map((a) => {
            const active = draft.accent === a.value;
            return (
              <button
                key={a.value}
                type="button"
                onClick={() => pick({ accent: a.value })}
                aria-pressed={active}
                className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm ${
                  active ? "border-(--brand) font-medium text-slate-900" : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                <span className="flex size-5 items-center justify-center rounded-full" style={{ background: a.color }}>
                  {active && <Check size={12} className="text-white" />}
                </span>
                {a.label}
              </button>
            );
          })}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={saving || !changed} className={buttonStyles.primary}>
          {saving && <Loader2 size={16} className="animate-spin" />}
          Save theme
        </button>
        {changed && !saving && (
          <button type="button" onClick={() => pick(savedTheme)} className={buttonStyles.secondary}>
            Undo preview
          </button>
        )}
        {message && <p className={`text-sm ${message.tone === "ok" ? "text-emerald-700" : "text-red-600"}`}>{message.text}</p>}
      </div>
      <p className="text-xs text-slate-500">The theme is part of the settings backup.</p>
    </div>
  );
}

import type { FinishRule, FinishSkuCondition } from "@/types/settings";

/** Choices for a finish rule's SKU condition, in the order shown in the OEE run rules settings. */
export const FINISH_SKU_OPTIONS: { value: FinishSkuCondition; label: string; hint: string }[] = [
  { value: "notInMaster", label: "SKU not in master", hint: "Empty, 0 or a code that is not in SKU Management" },
  { value: "empty", label: "SKU empty / 0", hint: "Product tag is empty or 0" },
  { value: "any", label: "Any SKU", hint: "SKU is not checked" },
];

export const FINISH_STATUS_OPTIONS: { value: FinishRule["status"]; label: string }[] = [
  { value: "ANY", label: "Any status" },
  { value: "OFF", label: "Off" },
  { value: "STOP", label: "Stop" },
  { value: "RUN", label: "Run" },
];

const SKU_KEYS: Record<string, FinishSkuCondition> = { notinmaster: "notInMaster", empty: "empty", any: "any" };

/**
 * Text form used in the settings backup: one rule per entry, separated by ";".
 * A rule is `<sku>[+<status>][><seconds>s]`, e.g. "notInMaster+OFF", "any+OFF>1800s", "empty".
 */
export function formatFinishRules(rules: FinishRule[]) {
  return rules
    .map((r) => `${r.sku}${r.status === "ANY" ? "" : `+${r.status}`}${r.holdSeconds ? `>${r.holdSeconds}s` : ""}`)
    .join("; ");
}

/** Inverse of formatFinishRules; throws with the entry that cannot be read. */
export function parseFinishRules(text: string): FinishRule[] {
  return text
    .split(";")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((entry) => {
      const m = /^([a-z]+)(?:\s*\+\s*(run|stop|off|any))?(?:\s*>\s*(\d+)\s*s?)?$/i.exec(entry);
      const sku = m && SKU_KEYS[m[1].toLowerCase()];
      if (!m || !sku) throw new Error(`"${entry}" is not a finish rule (e.g. notInMaster+OFF, any+OFF>1800s)`);
      return { sku, status: (m[2]?.toUpperCase() ?? "ANY") as FinishRule["status"], holdSeconds: Number(m[3] ?? 0) };
    });
}

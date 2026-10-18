// Keep in sync with be-realtime-urc/src/services/yamato/fields.ts
import type { MachineRegistration, MonitoringTag } from "@/types/machine";

/** Fields of the Yamato Dataweigh Alpha Plus DS data the backend can read. */
export interface YamatoField {
  key: string;
  label: string;
  group: "Setting" | "Production" | "Weight" | "Histogram" | "Allowable down time" | "Down time";
  unit: string;
}

const field = (key: string, label: string, group: YamatoField["group"], unit = ""): YamatoField => ({ key, label, group, unit });

export const YAMATO_FIELDS: YamatoField[] = [
  field("PROGRAM_NUMBER", "Program No", "Setting"),
  field("PRODUCT_NAME", "Product name", "Setting"),
  field("TARGET_WEIGHT", "Target weight", "Setting", "g"),
  field("HIGH_LIMIT", "High limit", "Setting", "g"),
  field("LOW_LIMIT", "Low limit", "Setting", "g"),
  field("NOMINAL_SPEED", "Nominal speed", "Setting", "pack/min"),
  field("HISTOGRAM_DEGREE", "Histogram degree", "Setting", "g"),
  field("ACCEPTABLE_COUNT", "Acceptable count", "Production", "pcs"),
  field("OVERWEIGHT_COUNT", "Overweight count", "Production", "pcs"),
  field("NO_COMBINATION", "No combination", "Production", "pcs"),
  field("OPERATION_TIME", "Operation time", "Production", "min"),
  field("EFFICIENCY", "Efficiency", "Production", "%"),
  field("TOTAL_WEIGHT", "Total weight", "Weight", "g"),
  field("AVERAGE_WEIGHT", "Average weight", "Weight", "g"),
  field("STD_DEVIATION", "Std deviation", "Weight", "g"),
  field("MAX_WEIGHT", "Max weight", "Weight", "g"),
  field("MIN_WEIGHT", "Min weight", "Weight", "g"),
  ...Array.from({ length: 12 }, (_, i) => field(`HISTOGRAM_${i + 1}`, `Histogram ${i + 1}`, "Histogram", "pcs")),
  ...Array.from({ length: 18 }, (_, i) =>
    field(`ALLOWABLE_DOWN_TIME_${i + 1}`, `Allowable down time ${i + 1}`, "Allowable down time", "min")
  ),
  ...Array.from({ length: 20 }, (_, i) => field(`DOWN_TIME_${i + 1}`, `Down time ${i + 1}`, "Down time", "min")),
];

export const YAMATO_GROUPS = [...new Set(YAMATO_FIELDS.map((f) => f.group))];

/** Fields ticked for a new scale. */
export const DEFAULT_SCALE_FIELDS = ["AVERAGE_WEIGHT", "STD_DEVIATION", "ACCEPTABLE_COUNT", "OVERWEIGHT_COUNT", "EFFICIENCY"];

const byKey = new Map(YAMATO_FIELDS.map((f) => [f.key, f]));

export const scaleTagName = (machineNo: string, key: string) => `${machineNo}.YAMATO.${key}`;

/** The scale's chosen fields as realtime tags (same ids as the backend's monitoring values). */
export function scaleTags(m: Pick<MachineRegistration, "machineNo" | "scale">): MonitoringTag[] {
  if (!m.scale?.enabled) return [];
  return m.scale.fields.flatMap((key) => {
    const f = byKey.get(key);
    return f ? [{ id: `yamato:${key}`, name: `Scale · ${f.label}`, tagName: scaleTagName(m.machineNo, key), unit: f.unit }] : [];
  });
}

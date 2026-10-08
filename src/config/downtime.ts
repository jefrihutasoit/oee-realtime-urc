/** Names of the downtime types used in the downtime sheet ("Tipe Downtime"). Unknown codes show as is. */
export const DOWNTIME_TYPE_NAMES: Record<string, string> = {
  OL: "Operational Losses",
  EL: "Engineering Losses",
  MS: "Minor Stoppage",
  PL: "Planned Losses",
};

export const downtimeTypeLabel = (code: string) =>
  DOWNTIME_TYPE_NAMES[code] ? `${code} - ${DOWNTIME_TYPE_NAMES[code]}` : code || "Other";

/** Categorical slots (validated reference palette), in fixed order. */
const SLOTS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const KNOWN = Object.keys(DOWNTIME_TYPE_NAMES);

/**
 * Colour of a downtime type. Known types keep their slot; other types take the next slots in
 * alphabetical order, so a type keeps its colour whatever the day's ranking is.
 */
export function downtimeTypeColors(types: string[]) {
  const others = [...new Set(types.filter((t) => !KNOWN.includes(t)))].sort();
  const order = [...KNOWN, ...others];
  return (type: string) => {
    const i = order.indexOf(type);
    return i >= 0 && i < SLOTS.length ? SLOTS[i] : "#94a3b8";
  };
}

/** Seconds → "2h 10m" / "25m". */
export function minutesLabel(seconds: number) {
  const total = Math.round(seconds / 60);
  const h = Math.floor(total / 60);
  return h ? `${h}h ${total % 60}m` : `${total}m`;
}

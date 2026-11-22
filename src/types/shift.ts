// Keep in sync with be-realtime-urc/src/types/shift.ts

/** A shift definition. Times are "HH:mm" in plant (server) local time; end before start crosses midnight. */
export interface Shift {
  id: string;
  name: string;
  start: string;
  end: string;
  durationMinutes: number;
  /**
   * Weekdays the shift runs on, by the day its start falls on (0 = Sunday ... 6 = Saturday); all seven by
   * default. A shift starting Friday 22:00 and ending Saturday 06:00 belongs to Friday.
   */
  days: number[];
  /** Other times on some of those days (same shift, e.g. a shorter Saturday); other days use start / end. */
  dayTimes: ShiftDayTime[];
  createdAt: string;
  updatedAt: string;
}

/** The times of a shift on one weekday, when they differ from its default start / end. */
export interface ShiftDayTime {
  day: number;
  start: string;
  end: string;
  durationMinutes: number;
}

export type ShiftInput = Pick<Shift, "name" | "start" | "end" | "days"> & {
  dayTimes: Pick<ShiftDayTime, "day" | "start" | "end">[];
};

/** Start / end / length of a shift on a weekday (its other times there, else the default); null when off. */
export function shiftTimesOn(s: Shift, day: number) {
  if (!s.days.includes(day)) return null;
  const t = s.dayTimes.find((x) => x.day === day);
  return t
    ? { start: t.start, end: t.end, durationMinutes: t.durationMinutes }
    : { start: s.start, end: s.end, durationMinutes: s.durationMinutes };
}

/** Short weekday name (0 = Sunday). */
export const dayName = (d: number) => WEEKDAYS.find(([v]) => v === d)?.[1] ?? String(d);

/** Weekdays in plant order, Monday first: [value, short name]. */
export const WEEKDAYS: [number, string][] = [
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
  [0, "Sun"],
];

/** "Every day", "Mon–Fri", "Sat", or "Mon, Wed, Sat". */
export function daysLabel(days: number[]) {
  if (days.length === 7) return "Every day";
  const order = WEEKDAYS.map(([d]) => d).filter((d) => days.includes(d));
  const names = order.map((d) => WEEKDAYS.find(([v]) => v === d)![1]);
  const idx = order.map((d) => WEEKDAYS.findIndex(([v]) => v === d));
  const consecutive = idx.length > 2 && idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  return consecutive ? `${names[0]}–${names.at(-1)}` : names.join(", ");
}

/**
 * A concrete shift occurrence on the timeline. Time not covered by any shift is a gap period
 * with `shiftId` null and name "No shift". OEE and the operation timeline reset at each boundary.
 */
export interface ShiftPeriod {
  shiftId: string | null;
  name: string;
  /** ISO timestamps. */
  start: string;
  end: string;
  /** "HH:mm" labels of the definition, e.g. "22:00" – "06:00". */
  startLabel: string;
  endLabel: string;
}

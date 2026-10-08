import type { DowntimeUploadRow } from "@/types/downtime";
import { parseDate, text, type Cell } from "./reject-sheet";

/**
 * Reads the downtime sheet:
 *
 *   Date | Machine Packaging | Bagger | Line | SKU | Time Downtime (merged)        | Blocked         | Detail Downtime | Operator | Tipe Downtime
 *        |                   |        |      |     | Start | End | Total (Hr) | Total (Second) | No Notification |  |  |
 *   1-Sep | 07               | A      | Pia 4 | PIRB 65 | 10:20 | 11:30 | 1:10:00 | 4200  | 10013591 | ... | | EL
 *
 * Columns are found by their header text (one or two header rows). A row without a date takes the date
 * of the row above. Empty rows are skipped.
 */
export interface ParsedDowntimeSheet {
  sheetName: string;
  sheetNames: string[];
  rows: DowntimeUploadRow[];
}

const key = (v: Cell | undefined) => text(v).toUpperCase().replace(/[^A-Z]/g, "");
const pad = (n: number) => String(n).padStart(2, "0");

/** Excel time (fraction of a day, or a date-time serial) or "7:00" / "07:00:00" → "HH:mm". */
function toTime(v: Cell | undefined): string | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    const minutes = Math.round((((v % 1) + 1) % 1) * 1440) % 1440;
    return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  }
  if (v instanceof Date) return `${pad(v.getHours())}:${pad(v.getMinutes())}`;
  const m = /^(\d{1,2})[:.](\d{2})(?::\d{2})?$/.exec(text(v));
  return m && +m[1] < 24 && +m[2] < 60 ? `${pad(+m[1])}:${m[2]}` : null;
}

/** "Total (Hr)": an Excel time / duration (fraction of a day) or "2:10:00" → seconds. */
function hoursCellSeconds(v: Cell | undefined): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return Math.round(v * 86_400);
  const m = /^(\d{1,3}):(\d{2})(?::(\d{2}))?$/.exec(text(v));
  return m ? +m[1] * 3600 + +m[2] * 60 + +(m[3] ?? 0) : null;
}

function numberCell(v: Cell | undefined): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = text(v).replace(/\./g, "").replace(",", ".");
  return s && Number.isFinite(Number(s)) ? Number(s) : null;
}

const minutesOf = (hhmm: string) => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3);

export async function parseDowntimeSheet(file: File, sheetName?: string): Promise<ParsedDowntimeSheet> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer());
  const name = sheetName && wb.SheetNames.includes(sheetName) ? sheetName : wb.SheetNames[0];
  const ws = name ? wb.Sheets[name] : undefined;
  if (!ws || !ws["!ref"]) throw new Error("The file has no data");

  const origin = XLSX.utils.decode_range(ws["!ref"]).s;
  const grid = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: null, blankrows: true });

  const headerAt = grid.findIndex((row) => row.some((c) => key(c).includes("MACHINE")));
  if (headerAt < 0) throw new Error('Header row not found: the sheet needs a "Machine Packaging" column');
  const top = grid[headerAt];
  const sub = grid[headerAt + 1] ?? [];
  const hasSubHeader = sub.some((c) => ["START", "END"].includes(key(c)));
  const width = Math.max(top.length, sub.length);
  // Header text per column: the header row plus the row under it (merged group headers sit on top).
  const labels = Array.from({ length: width }, (_, i) => key(top[i]) + (hasSubHeader ? `|${key(sub[i])}` : ""));
  const find = (test: (label: string) => boolean) => labels.findIndex(test);
  const cols = {
    date: find((l) => l.split("|")[0] === "DATE" || l.split("|")[0] === "TANGGAL"),
    machine: find((l) => l.includes("MACHINE")),
    bagger: find((l) => l.includes("BAGGER")),
    line: find((l) => l.split("|")[0] === "LINE"),
    sku: find((l) => l.split("|")[0] === "SKU"),
    start: find((l) => l.endsWith("START") || l.includes("|START")),
    end: find((l) => /(^|\|)END$/.test(l)),
    totalHr: find((l) => l.includes("TOTALHR")),
    totalSec: find((l) => l.includes("TOTALSECOND")),
    notification: find((l) => l.includes("NOTIFICATION") || l.startsWith("BLOCKED")),
    detail: find((l) => l.includes("DETAIL")),
    operator: find((l) => l.includes("OPERATOR")),
    type: find((l) => l.includes("TIPE") || l.includes("TYPE")),
  };
  const missing = (["date", "machine", "start", "type"] as const).filter((c) => cols[c] < 0);
  if (missing.length) {
    const names = { date: "Date", machine: "Machine Packaging", start: "Start", type: "Tipe Downtime" };
    throw new Error(`Column ${missing.map((m) => names[m]).join(", ")} not found in the header`);
  }

  const get = (row: Cell[], col: number) => (col >= 0 ? row[col] : null);
  const dataStart = headerAt + (hasSubHeader ? 2 : 1);
  const rows: DowntimeUploadRow[] = [];
  let lastDate: string | null = null;
  grid.slice(dataStart).forEach((row, i) => {
    const machineText = text(get(row, cols.machine));
    const start = toTime(get(row, cols.start));
    const detail = text(get(row, cols.detail));
    if (!machineText && !start && !detail) return;

    const ownDate = parseDate(get(row, cols.date), XLSX.SSF.parse_date_code);
    const productionDate = ownDate ?? lastDate;
    if (ownDate) lastDate = ownDate;

    const end = toTime(get(row, cols.end));
    let durationSeconds = numberCell(get(row, cols.totalSec));
    if (durationSeconds === null) durationSeconds = hoursCellSeconds(get(row, cols.totalHr));
    if (durationSeconds === null && start && end) {
      // An end before the start crosses midnight.
      durationSeconds = (((minutesOf(end) - minutesOf(start)) % 1440) + 1440) % 1440 * 60;
    }

    rows.push({
      rowNumber: origin.r + dataStart + i + 1,
      productionDate,
      dateFromAbove: !ownDate && !!productionDate,
      machineText,
      bagger: text(get(row, cols.bagger)),
      line: text(get(row, cols.line)),
      sku: text(get(row, cols.sku)),
      start,
      end,
      durationSeconds,
      notificationNo: text(get(row, cols.notification)),
      detail,
      operator: text(get(row, cols.operator)),
      downtimeType: text(get(row, cols.type)).toUpperCase(),
    });
  });

  return { sheetName: name, sheetNames: wb.SheetNames, rows };
}

import type { RejectUploadRow } from "@/types/reject";

/**
 * Reads the shift reject sheet:
 *
 *   Tanggal : 29-Sep-26
 *   Shift   : 2
 *   MC | OPERATOR | SKU | FLV | Data Reject (merged)
 *      |          |     |     | Pouch Bocor | Pouch Trapping | Pouch Kosong | ...
 *   1A | Irpan    | 15 gr | King stick Jagung Bakar |  | 50 | 3
 *
 * Every column right of FLV with a name in the row under the header is a reject type, so new
 * categories only need a new column. Machines without any data (idle) are skipped.
 */
export interface ParsedRejectSheet {
  sheetName: string;
  sheetNames: string[];
  /** "YYYY-MM-DD" from the "Tanggal" cell; null when missing or unreadable. */
  productionDate: string | null;
  /** Raw value of the "Shift" cell, e.g. "2". */
  shift: string | null;
  rejectTypes: string[];
  rows: RejectUploadRow[];
  /** MC numbers listed without any data. */
  idleMachines: string[];
}

export type Cell = string | number | boolean | Date | null;

export const text = (v: Cell | undefined) => (v === null || v === undefined ? "" : String(v).trim().replace(/\s+/g, " "));
const label = (v: Cell | undefined) => text(v).toUpperCase().replace(/[^A-Z]/g, "");

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
// Indonesian names that differ from English.
const MONTH_ALIASES: Record<string, number> = { mei: 5, agu: 8, agt: 8, okt: 10, des: 12 };

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** A date cell as "YYYY-MM-DD"; a day and month without a year ("1-Sep") take `defaultYear`. */
export function parseDate(
  value: Cell | undefined,
  parseDateCode: (n: number) => { y: number; m: number; d: number },
  defaultYear = new Date().getFullYear()
) {
  if (value instanceof Date) return ymd(value.getFullYear(), value.getMonth() + 1, value.getDate());
  if (typeof value === "number") {
    const { y, m, d } = parseDateCode(value);
    return ymd(y, m, d);
  }
  const s = text(value).replace(/^:\s*/, "");
  if (!s) return null;
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  // 29/09/2026, 29-09-26 (day first, as used in Indonesia)
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s);
  if (m) return ymd(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  // 29-Sep-26, 29 Sep 2026, 29 Agustus 2026
  m = /^(\d{1,2})[-/ ]([A-Za-z]+)[-/ ](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const name = m[2].slice(0, 3).toLowerCase();
    const month = MONTHS.indexOf(name) + 1 || MONTH_ALIASES[name];
    if (month) return ymd(m[3].length === 2 ? 2000 + +m[3] : +m[3], month, +m[1]);
  }
  // 1-Sep, 1 Sep
  m = /^(\d{1,2})[-/ ]([A-Za-z]+)$/.exec(s);
  if (m) {
    const name = m[2].slice(0, 3).toLowerCase();
    const month = MONTHS.indexOf(name) + 1 || MONTH_ALIASES[name];
    if (month) return ymd(defaultYear, month, +m[1]);
  }
  return null;
}

/** Value after a "Label :" cell: the rest of the same cell, or the next non-empty cell in the row. */
function labelValue(row: Cell[], labelPattern: RegExp): Cell | undefined {
  const at = row.findIndex((c) => labelPattern.test(text(c)));
  if (at < 0) return undefined;
  const rest = text(row[at]).replace(labelPattern, "").replace(/^[\s:]+/, "");
  if (rest) return rest;
  for (let c = at + 1; c < row.length; c++) {
    if (text(row[c]).replace(/^[\s:]+/, "")) return typeof row[c] === "string" ? text(row[c]).replace(/^[\s:]+/, "") : row[c];
  }
  return undefined;
}

export async function parseRejectSheet(file: File, sheetName?: string): Promise<ParsedRejectSheet> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer());
  const name = sheetName && wb.SheetNames.includes(sheetName) ? sheetName : wb.SheetNames[0];
  const ws = name ? wb.Sheets[name] : undefined;
  if (!ws || !ws["!ref"]) throw new Error("The file has no data");

  const origin = XLSX.utils.decode_range(ws["!ref"]).s;
  const grid = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: null, blankrows: true });
  const rowNumber = (i: number) => origin.r + i + 1;

  const headerAt = grid.findIndex((row) => row.some((c) => label(c) === "MC"));
  if (headerAt < 0) throw new Error('Header row not found: the sheet needs an "MC" column');
  const header = grid[headerAt];
  const col = (...names: string[]) => header.findIndex((c) => names.includes(label(c)));
  const cols = { mc: col("MC"), operator: col("OPERATOR"), sku: col("SKU"), flavor: col("FLV", "FLAVOR", "FLAVOUR") };
  const missing = Object.entries(cols)
    .filter(([, i]) => i < 0)
    .map(([k]) => ({ mc: "MC", operator: "OPERATOR", sku: "SKU", flavor: "FLV" })[k]);
  if (missing.length) throw new Error(`Column ${missing.join(", ")} not found in the header row`);

  // Reject types: named in the row under the header ("Data Reject" is merged above them),
  // or in the header row itself when the sheet has a single header row.
  const lastFixed = Math.max(...Object.values(cols));
  const typeColumns = (row: Cell[] | undefined) =>
    (row ?? []).flatMap((c, i) => (i > lastFixed && text(c) ? [{ index: i, name: text(c) }] : []));
  let types = typeColumns(grid[headerAt + 1]);
  let dataStart = headerAt + 2;
  if (!types.length) {
    types = typeColumns(header).filter((t) => label(t.name) !== "DATAREJECT");
    dataStart = headerAt + 1;
  }
  if (!types.length) throw new Error("No reject type columns found to the right of FLV");

  let productionDate: string | null = null;
  let shift: string | null = null;
  for (const row of grid.slice(0, headerAt)) {
    const dateCell = labelValue(row, /^(tanggal|tgl|date)\b\.?/i);
    if (dateCell !== undefined && !productionDate) productionDate = parseDate(dateCell, XLSX.SSF.parse_date_code);
    const shiftCell = labelValue(row, /^shift\b/i);
    if (shiftCell !== undefined && !shift) shift = text(shiftCell as Cell) || null;
  }

  const rows: RejectUploadRow[] = [];
  const idleMachines: string[] = [];
  grid.slice(dataStart).forEach((row, i) => {
    const machineNo = text(row[cols.mc]);
    const operator = text(row[cols.operator]);
    const sku = text(row[cols.sku]);
    const flavor = text(row[cols.flavor]);
    const quantities = types.map((t) => {
      const v = row[t.index];
      return typeof v === "number" ? v : text(v) || null;
    });
    if (!operator && !sku && !flavor && quantities.every((q) => q === null)) {
      if (machineNo) idleMachines.push(machineNo);
      return;
    }
    rows.push({ rowNumber: rowNumber(dataStart + i), machineNo, operator, sku, flavor, quantities });
  });

  return {
    sheetName: name,
    sheetNames: wb.SheetNames,
    productionDate,
    shift,
    rejectTypes: types.map((t) => t.name),
    rows,
    idleMachines,
  };
}

/** Today as "YYYY-MM-DD" in local time. */
export function todayYmd() {
  const d = new Date();
  return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** Reject types in the template when none are registered yet. */
export const DEFAULT_TEMPLATE_TYPES = ["Pouch Bocor", "Pouch Trapping", "Pouch Kosong"];

/** An empty reject sheet in the layout `parseRejectSheet` reads, listing the given machines. */
export async function buildRejectTemplate(machineNos: string[], rejectTypes: string[]) {
  const XLSX = await import("xlsx");
  const types = rejectTypes.length ? rejectTypes : DEFAULT_TEMPLATE_TYPES;
  const blankFixed = [null, null, null, null];
  const aoa: Cell[][] = [
    ["Tanggal :", new Date()],
    ["Shift", ": "],
    [],
    ["MC", "OPERATOR", "SKU", "FLV", "Data Reject", ...types.slice(1).map(() => null)],
    [...blankFixed, ...types],
    ...machineNos.map((no) => [no]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
  ws["B1"].z = "d-mmm-yy";
  const header = 3;
  ws["!merges"] = [
    ...[0, 1, 2, 3].map((c) => ({ s: { r: header, c }, e: { r: header + 1, c } })),
    { s: { r: header, c: 4 }, e: { r: header, c: 4 + types.length - 1 } },
  ];
  ws["!cols"] = [{ wch: 8 }, { wch: 16 }, { wch: 10 }, { wch: 28 }, ...types.map((t) => ({ wch: Math.max(12, t.length + 2) }))];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Reject");
  return wb;
}

export async function downloadRejectTemplate(machineNos: string[], rejectTypes: string[]) {
  const XLSX = await import("xlsx");
  XLSX.writeFile(await buildRejectTemplate(machineNos, rejectTypes), `reject-template-${todayYmd()}.xlsx`);
}

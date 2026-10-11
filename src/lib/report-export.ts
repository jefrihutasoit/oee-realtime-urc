import { labelWithUnit, withUnit, type ProductionUnits } from "@/lib/production-units";
import type { Report, ReportFigures, ReportGroup, ReportRow, ReportType } from "@/types/report";

// The report table as plain rows, shared by the page, the Excel file and the PDF.

export const REPORT_TYPES: { value: ReportType; label: string; groupColumn: string }[] = [
  { value: "daily", label: "Daily Summary", groupColumn: "Date" },
  { value: "shift", label: "Shift Summary", groupColumn: "Date / Shift" },
  { value: "machine", label: "Machine Summary", groupColumn: "Machine" },
  { value: "sku", label: "SKU Summary", groupColumn: "SKU" },
];

export const reportTypeOf = (type: ReportType) => REPORT_TYPES.find((t) => t.value === type)!;

/** "2025-04-21" → "21/04/2025". */
export const dmy = (ymd: string) => ymd.split("-").reverse().join("/");

export function groupLabel(type: ReportType, g: ReportGroup) {
  if (type === "daily") return dmy(g.date!);
  if (type === "shift") return `${dmy(g.date!)} · ${g.shiftName}`;
  if (type === "machine") return g.machineNo!;
  return g.skuCode!;
}

const FIGURE_COUNT = 6;
const NO_UNITS: ProductionUnits = { output: "", reject: "" };

export const reportColumns = (type: ReportType, machineLabel: string, units: ProductionUnits) => [
  reportTypeOf(type).groupColumn.replace("Machine", machineLabel),
  machineLabel,
  "SKU",
  "Product",
  labelWithUnit("Output", units.output),
  labelWithUnit("Reject", units.reject),
  "Availability",
  "Performance",
  "Quality",
  "OEE",
];

/**
 * Output / reject units of a report. `header` is the unit all machines in it share ("" when they
 * differ); `row` and `group` give the unit to print in a cell, only where the header has none.
 */
export function reportUnits(r: Report, unitsOf: (machineIds: string[]) => ProductionUnits) {
  const ids = (rows: ReportRow[]) => rows.map((x) => x.machineId);
  const header = unitsOf(r.groups.flatMap((g) => ids(g.rows)));
  const cell = (machineIds: string[]): ProductionUnits => {
    const u = unitsOf(machineIds);
    return { output: header.output ? "" : u.output, reject: header.reject ? "" : u.reject };
  };
  return {
    header,
    mixed: !header.output || !header.reject,
    row: (row: ReportRow) => cell([row.machineId]),
    group: (g: ReportGroup) => cell(ids(g.rows)),
  };
}
export type ReportUnits = ReturnType<typeof reportUnits>;

const pct = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)}%`);
const num = new Intl.NumberFormat("en-US");
export const formatFigures = (f: ReportFigures, units: ProductionUnits = NO_UNITS) => [
  withUnit(num.format(f.output), units.output),
  withUnit(num.format(f.reject), units.reject),
  pct(f.availability),
  pct(f.performance),
  pct(f.quality),
  pct(f.oee),
];
const rawFigures = (f: ReportFigures) => [
  f.output,
  f.reject,
  f.availability ?? "",
  f.performance ?? "",
  f.quality ?? "",
  f.oee ?? "",
];

/** Text cells of a group's total row (the Product cell names the SKU of an SKU group). */
export const totalCells = (type: ReportType, g: ReportGroup) => [groupLabel(type, g), "Total", "", g.productName ?? ""];

export interface ReportFilterText {
  machines: string;
  skus: string;
  shift: string;
}

const fileName = (r: Report, ext: string) => `report-${r.type}-${r.from}_${r.to}.${ext}`;

function infoLines(r: Report, filters: ReportFilterText, machineLabel: string) {
  return [
    ["Report", reportTypeOf(r.type).label],
    ["Production date", `${dmy(r.from)} – ${dmy(r.to)}`],
    [machineLabel, filters.machines],
    ["SKU", filters.skus],
    ["Shift", filters.shift],
    ["Generated", new Date(r.generatedAt).toLocaleString("en-GB")],
  ];
}

export async function exportReportExcel(r: Report, filters: ReportFilterText, machineLabel: string, units: ReportUnits) {
  const XLSX = await import("xlsx");
  const columns = reportColumns(r.type, machineLabel, units.header);
  // Numbers stay numeric; with different units per machine a last column names them.
  const unitCell = (u: ProductionUnits) => (units.mixed ? [`${u.output || "-"} / ${u.reject || "-"}`] : []);
  const aoa: (string | number)[][] = [
    ...infoLines(r, filters, machineLabel),
    [],
    [
      ...columns.slice(0, 6),
      "Availability (%)",
      "Performance (%)",
      "Quality (%)",
      "OEE (%)",
      ...(units.mixed ? ["Unit (Output / Reject)"] : []),
    ],
  ];
  for (const g of r.groups) {
    aoa.push([...totalCells(r.type, g), ...rawFigures(g.total), ...unitCell(units.group(g))]);
    const label = groupLabel(r.type, g);
    for (const row of g.rows) {
      aoa.push([label, row.machineNo, row.skuCode, row.productName, ...rawFigures(row), ...unitCell(units.row(row))]);
    }
  }
  aoa.push(["Grand total", "", "", "", ...rawFigures(r.total)]);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 20 }, { wch: 10 }, { wch: 16 }, { wch: 30 }, ...Array.from({ length: FIGURE_COUNT }, () => ({ wch: 14 }))];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, reportTypeOf(r.type).label);
  XLSX.writeFile(wb, fileName(r, "xlsx"));
}

export async function exportReportPdf(r: Report, filters: ReportFilterText, machineLabel: string, units: ReportUnits) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setFontSize(14);
  doc.text(`Report Result (${reportTypeOf(r.type).label})`, 14, 15);
  doc.setFontSize(9);
  doc.setTextColor(100);
  const info = infoLines(r, filters, machineLabel);
  info.forEach(([k, v], i) => doc.text(`${k}: ${v}`, 14 + (i % 3) * 92, 22 + Math.floor(i / 3) * 5));

  const total = { fontStyle: "bold" as const, fillColor: [238, 243, 250] as [number, number, number] };
  const body = r.groups.flatMap((g) => [
    [...totalCells(r.type, g), ...formatFigures(g.total, units.group(g))].map((content) => ({ content, styles: total })),
    ...g.rows.map((row) => ["", row.machineNo, row.skuCode, row.productName, ...formatFigures(row, units.row(row))]),
  ]);
  body.push(
    ["Grand total", "", "", "", ...formatFigures(r.total)].map((content) => ({
      content,
      styles: { ...total, fillColor: [219, 231, 248] as [number, number, number] },
    }))
  );
  autoTable(doc, {
    startY: 33,
    head: [reportColumns(r.type, machineLabel, units.header)],
    body,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1.6, lineColor: [226, 232, 240] },
    headStyles: { fillColor: [30, 111, 217], textColor: 255, halign: "center" },
    columnStyles: Object.fromEntries([4, 5, 6, 7, 8, 9].map((i) => [i, { halign: "right" as const }])),
    didDrawPage: () => {
      const page = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Page ${page}`, doc.internal.pageSize.getWidth() - 14, doc.internal.pageSize.getHeight() - 8, {
        align: "right",
      });
    },
  });
  doc.save(fileName(r, "pdf"));
}

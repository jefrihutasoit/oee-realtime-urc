import type { Report, ReportFigures, ReportGroup, ReportType } from "@/types/report";

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

const FIGURE_COLUMNS = ["Output (pcs)", "Reject (pcs)", "Availability", "Performance", "Quality", "OEE"];

export const reportColumns = (type: ReportType, machineLabel: string) => [
  reportTypeOf(type).groupColumn.replace("Machine", machineLabel),
  machineLabel,
  "SKU",
  "Product",
  ...FIGURE_COLUMNS,
];

const pct = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)}%`);
const num = new Intl.NumberFormat("en-US");
export const formatFigures = (f: ReportFigures) => [
  num.format(f.output),
  num.format(f.reject),
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

export async function exportReportExcel(r: Report, filters: ReportFilterText, machineLabel: string) {
  const XLSX = await import("xlsx");
  const columns = reportColumns(r.type, machineLabel);
  const aoa: (string | number)[][] = [
    ...infoLines(r, filters, machineLabel),
    [],
    [...columns.slice(0, 6), "Availability (%)", "Performance (%)", "Quality (%)", "OEE (%)"],
  ];
  for (const g of r.groups) {
    aoa.push([...totalCells(r.type, g), ...rawFigures(g.total)]);
    const label = groupLabel(r.type, g);
    for (const row of g.rows) aoa.push([label, row.machineNo, row.skuCode, row.productName, ...rawFigures(row)]);
  }
  aoa.push(["Grand total", "", "", "", ...rawFigures(r.total)]);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 20 }, { wch: 10 }, { wch: 16 }, { wch: 30 }, ...FIGURE_COLUMNS.map(() => ({ wch: 14 }))];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, reportTypeOf(r.type).label);
  XLSX.writeFile(wb, fileName(r, "xlsx"));
}

export async function exportReportPdf(r: Report, filters: ReportFilterText, machineLabel: string) {
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
    [...totalCells(r.type, g), ...formatFigures(g.total)].map((content) => ({ content, styles: total })),
    ...g.rows.map((row) => ["", row.machineNo, row.skuCode, row.productName, ...formatFigures(row)]),
  ]);
  body.push(
    ["Grand total", "", "", "", ...formatFigures(r.total)].map((content) => ({
      content,
      styles: { ...total, fillColor: [219, 231, 248] as [number, number, number] },
    }))
  );
  autoTable(doc, {
    startY: 33,
    head: [reportColumns(r.type, machineLabel)],
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

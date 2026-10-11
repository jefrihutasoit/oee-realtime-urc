import { labelWithUnit, type ProductionUnits } from "@/lib/production-units";
import { dmy, type ReportFilterText } from "@/lib/report-export";
import type { HistoricalData, HourlyDetail } from "@/types/historical";
import type { ReportFigures } from "@/types/report";

const hourFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

/** "08:00 - 09:00" for an ISO hour start. */
export function hourRange(iso: string) {
  const start = new Date(iso);
  return `${hourFmt.format(start)} - ${hourFmt.format(new Date(start.getTime() + 3_600_000))}`;
}

const figures = (f: ReportFigures) => [f.output, f.reject, f.oee ?? "", f.availability ?? "", f.performance ?? "", f.quality ?? ""];

const figureHead = (u: ProductionUnits) => [
  labelWithUnit("Output", u.output),
  labelWithUnit("Reject", u.reject),
  "OEE (%)",
  "Availability (%)",
  "Performance (%)",
  "Quality (%)",
];

/** Workbook with the machine table, the figures per day and machine, and the hourly detail on screen. */
export async function exportHistoricalExcel(
  data: HistoricalData,
  detail: HourlyDetail | null,
  filters: ReportFilterText,
  machineLabel: string,
  /** Common output / reject unit of the given machines ("" when they differ). */
  unitsOf: (machineIds: string[]) => ProductionUnits
) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const info = [
    ["Production date", `${dmy(data.from)} – ${dmy(data.to)}`],
    [machineLabel, filters.machines],
    ["SKU", filters.skus],
    ["Shift", filters.shift],
    ["Generated", new Date(data.generatedAt).toLocaleString("en-GB")],
    [],
  ];
  const units = unitsOf(data.machines.map((m) => m.machineId));
  const head = figureHead(units);
  // With different units per machine the header has none, so each row names its own.
  const mixed = !units.output || !units.reject;
  const rowUnits = (id: string) => {
    const u = unitsOf([id]);
    return mixed ? [`${u.output || "-"} / ${u.reject || "-"}`] : [];
  };

  const byMachine = XLSX.utils.aoa_to_sheet([
    ...info,
    [machineLabel, ...head, ...(mixed ? ["Unit (Output / Reject)"] : [])],
    ...data.machines.map((m) => [m.machineNo, ...figures(m), ...rowUnits(m.machineId)]),
    ["Total", ...figures(data.total)],
  ]);
  byMachine["!cols"] = [{ wch: 16 }, ...head.map(() => ({ wch: 15 }))];
  XLSX.utils.book_append_sheet(wb, byMachine, `By ${machineLabel}`.slice(0, 31));

  const daily = XLSX.utils.aoa_to_sheet([
    ...info,
    [
      "Date",
      ...data.machines.flatMap((m) => {
        const u = unitsOf([m.machineId]);
        return [labelWithUnit(`${m.machineNo} Output`, u.output), labelWithUnit(`${m.machineNo} Reject`, u.reject), `${m.machineNo} OEE (%)`];
      }),
      labelWithUnit("Total Output", units.output),
      labelWithUnit("Total Reject", units.reject),
      "Total OEE (%)",
    ],
    ...data.days.map((d) => [
      dmy(d.date),
      ...data.machines.flatMap((m) => {
        const f = d.machines[m.machineId];
        return f ? [f.output, f.reject, f.oee ?? ""] : [0, 0, ""];
      }),
      d.total.output,
      d.total.reject,
      d.total.oee ?? "",
    ]),
  ]);
  daily["!cols"] = [{ wch: 16 }];
  XLSX.utils.book_append_sheet(wb, daily, "Daily");

  if (detail) {
    const hourly = XLSX.utils.aoa_to_sheet([
      [machineLabel, detail.machineNo],
      ["Production date", dmy(detail.date)],
      [],
      ["Time", "SKU", "Product", ...figureHead(unitsOf([detail.machineId])), "Remarks"],
      ...detail.rows.map((r) => [hourRange(r.hourStart), r.skuCode, r.productName, ...figures(r), r.remarks]),
      ["Total", "", "", ...figures(detail.total), ""],
    ]);
    hourly["!cols"] = [{ wch: 16 }, { wch: 14 }, { wch: 28 }, ...head.map(() => ({ wch: 14 })), { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, hourly, "Hourly detail");
  }

  XLSX.writeFile(wb, `historical-${data.from}_${data.to}.xlsx`);
}

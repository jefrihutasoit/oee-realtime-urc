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

/** Workbook with the machine table, the figures per day and machine, and the hourly detail on screen. */
export async function exportHistoricalExcel(
  data: HistoricalData,
  detail: HourlyDetail | null,
  filters: ReportFilterText,
  machineLabel: string
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
  const head = ["Output (pcs)", "Reject (pcs)", "OEE (%)", "Availability (%)", "Performance (%)", "Quality (%)"];

  const byMachine = XLSX.utils.aoa_to_sheet([
    ...info,
    [machineLabel, ...head],
    ...data.machines.map((m) => [m.machineNo, ...figures(m)]),
    ["Total", ...figures(data.total)],
  ]);
  byMachine["!cols"] = [{ wch: 16 }, ...head.map(() => ({ wch: 15 }))];
  XLSX.utils.book_append_sheet(wb, byMachine, `By ${machineLabel}`.slice(0, 31));

  const daily = XLSX.utils.aoa_to_sheet([
    ...info,
    ["Date", ...data.machines.flatMap((m) => [`${m.machineNo} Output`, `${m.machineNo} Reject`, `${m.machineNo} OEE (%)`]), "Total Output", "Total Reject", "Total OEE (%)"],
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
      ["Time", "SKU", "Product", ...head, "Remarks"],
      ...detail.rows.map((r) => [hourRange(r.hourStart), r.skuCode, r.productName, ...figures(r), r.remarks]),
      ["Total", "", "", ...figures(detail.total), ""],
    ]);
    hourly["!cols"] = [{ wch: 16 }, { wch: 14 }, { wch: 28 }, ...head.map(() => ({ wch: 14 })), { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, hourly, "Hourly detail");
  }

  XLSX.writeFile(wb, `historical-${data.from}_${data.to}.xlsx`);
}

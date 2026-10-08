import type { WorkBook, WorkSheet } from "xlsx";
import { formatFinishRules, parseFinishRules } from "@/lib/finish-rules";
import { MANAGED_ROLES, type ManagedRole, type RolePermissions } from "@/types/auth";
import { BACKUP_VERSION, type BackupMachine, type SettingsBackup } from "@/types/backup";
import type { MachineStatus } from "@/types/oee";

/**
 * Settings backup as one Excel workbook, one sheet per section. Columns are found by their header,
 * so they may be reordered; every sheet must be present. Validation of the content is done by the
 * backend (POST /backup/validate); this file only converts between the workbook and SettingsBackup.
 */

type Cell = string | number | boolean | null;

const SHEETS = {
  info: "Info",
  machines: "Machines",
  tags: "Monitoring Tags",
  skus: "SKUs",
  shifts: "Shifts",
  status: "Status Definition",
  oee: "OEE Settings",
  roles: "Role Permissions",
  markers: "Layout Markers",
  rejectTypes: "Reject Types",
} as const;

const MACHINE_COLUMNS = [
  "Machine No",
  "Machine Name",
  "Tag Status",
  "Tag Output",
  "Tag Reject",
  "Tag Product",
  "Active",
  "OEE Enabled",
  "Photo",
] as const;

const STATUSES: MachineStatus[] = ["RUN", "STOP", "OFF"];

// ---------- export ----------

const pad = (n: number) => String(n).padStart(2, "0");

function sheet(XLSX: typeof import("xlsx"), rows: Cell[][], widths: number[]): WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = widths.map((wch) => ({ wch }));
  return ws;
}

export async function backupToWorkbook(backup: SettingsBackup): Promise<WorkBook> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const add = (name: string, rows: Cell[][], widths: number[]) =>
    XLSX.utils.book_append_sheet(wb, sheet(XLSX, rows, widths), name);

  add(
    SHEETS.info,
    [
      ["OEE Realtime URC - Settings Backup"],
      ["Version", backup.version],
      ["Exported At", backup.exportedAt],
      ["Note", "Settings only: no production history, reject data or uploaded photos. Edit with care."],
    ],
    [14, 60]
  );
  add(
    SHEETS.machines,
    [
      [...MACHINE_COLUMNS],
      ...backup.machines.map((m) => [
        m.machineNo,
        m.machineName,
        m.tagStatus,
        m.tagOutput,
        m.tagReject,
        m.tagProduct,
        m.isActive,
        m.oeeEnabled,
        m.photo,
      ]),
    ],
    [11, 24, 28, 28, 28, 28, 8, 12, 30]
  );
  add(
    SHEETS.tags,
    [
      ["Machine No", "Name", "Tag Name"],
      ...backup.machines.flatMap((m) => m.monitoringTags.map((t) => [m.machineNo, t.name, t.tagName])),
    ],
    [11, 26, 32]
  );
  add(
    SHEETS.skus,
    [
      ["SKU ID", "Product Name", "SKU", "Output Per Minute"],
      ...backup.skus.map((s) => [s.skuId, s.productName, s.sku, s.outputPerMinute]),
    ],
    [12, 32, 14, 18]
  );
  add(SHEETS.shifts, [["Name", "Start", "End"], ...backup.shifts.map((s) => [s.name, s.start, s.end])], [16, 8, 8]);
  const def = backup.statusDefinition;
  add(
    SHEETS.status,
    [
      ["Status", "Values"],
      ["RUN", def.run.join(", ")],
      ["STOP", def.stop.join(", ")],
      ["OFF", def.off.join(", ")],
      ["UNMATCHED", def.unmatched],
    ],
    [12, 30]
  );
  const oee = backup.oeeSettings;
  add(
    SHEETS.oee,
    [
      ["Setting", "Value"],
      ["Start Mode", oee.startMode],
      ["Counter Mode", oee.counterMode],
      ["Reset On SKU Change", oee.resetOnSkuChange],
      ["Pause When Off", oee.pauseWhenOff],
      ["Reject Source", oee.rejectSource],
      ["Breakdown When Off", oee.breakdownWhenOff],
      ["Custom Machine Name", oee.machineLabelEnabled],
      ["Machine Name", oee.machineLabel],
      ["Finish Rules", formatFinishRules(oee.finishRules)],
    ],
    [20, 50]
  );
  if (backup.rolePermissions) {
    const roles = backup.rolePermissions;
    add(
      SHEETS.roles,
      [["Role", "Permissions"], ...MANAGED_ROLES.map((r) => [r, roles[r].join(", ")])],
      [12, 90]
    );
  }
  add(
    SHEETS.markers,
    [["Machine No", "X", "Y"], ...backup.layoutMarkers.map((m) => [m.machineNo, m.x, m.y])],
    [11, 10, 10]
  );
  add(
    SHEETS.rejectTypes,
    [["Name", "Order"], ...backup.rejectTypes.map((t) => [t.name, t.sortOrder])],
    [28, 8]
  );
  return wb;
}

export async function downloadBackup(backup: SettingsBackup) {
  const XLSX = await import("xlsx");
  const d = new Date();
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  XLSX.writeFile(await backupToWorkbook(backup), `oee-settings-backup-${stamp}.xlsx`);
}

// ---------- import ----------

export interface ParsedBackup {
  backup: SettingsBackup | null;
  /** Problems reading the workbook (missing sheets or columns, unreadable cells). */
  errors: string[];
}

const text = (v: Cell | undefined) => (v === null || v === undefined ? "" : String(v).trim());
const headerKey = (v: Cell | undefined) => text(v).toLowerCase().replace(/[^a-z0-9]/g, "");

/** Rows of a sheet as objects keyed by header, with the spreadsheet row number. Empty rows are skipped. */
function readRows(XLSX: typeof import("xlsx"), wb: WorkBook, name: string, required: string[], errors: string[]) {
  const ws = wb.Sheets[name] ?? wb.Sheets[wb.SheetNames.find((n) => headerKey(n) === headerKey(name)) ?? ""];
  if (!ws) {
    errors.push(`Sheet "${name}" is missing`);
    return [];
  }
  const grid = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: null, blankrows: true });
  const header = (grid[0] ?? []).map(headerKey);
  const missing = required.filter((c) => !header.includes(headerKey(c)));
  if (missing.length) {
    errors.push(`Sheet "${name}": column ${missing.join(", ")} not found in the first row`);
    return [];
  }
  return grid.slice(1).flatMap((row, i) => {
    if (row.every((c) => text(c) === "")) return [];
    const get = (col: string) => row[header.indexOf(headerKey(col))] ?? null;
    return [{ rowNumber: i + 2, get }];
  });
}

function bool(v: Cell, where: string, errors: string[]) {
  if (typeof v === "boolean") return v;
  const s = text(v).toLowerCase();
  if (["true", "yes", "y", "1"].includes(s)) return true;
  if (["false", "no", "n", "0"].includes(s)) return false;
  errors.push(`${where} must be TRUE or FALSE`);
  return false;
}

function num(v: Cell, where: string, errors: string[]) {
  const n = typeof v === "number" ? v : Number(text(v).replace(",", "."));
  if (text(v) === "" || !Number.isFinite(n)) {
    errors.push(`${where} must be a number`);
    return 0;
  }
  return n;
}

/** "6:00", "06:00" or an Excel time (fraction of a day) → "HH:mm". */
function time(v: Cell) {
  if (typeof v === "number") {
    const minutes = Math.round((v % 1) * 1440) % 1440;
    return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  }
  const m = /^(\d{1,2}):(\d{2})(:\d{2})?$/.exec(text(v));
  return m ? `${pad(Number(m[1]))}:${m[2]}` : text(v);
}

function numberList(v: Cell, where: string, errors: string[]) {
  if (typeof v === "number") return [v];
  const parts = text(v).split(/[,;\s]+/).filter(Boolean);
  const values = parts.map(Number);
  if (values.some((n) => !Number.isFinite(n))) errors.push(`${where} must be numbers separated by commas`);
  return values.filter((n) => Number.isFinite(n));
}

export async function parseBackupFile(file: File): Promise<ParsedBackup> {
  const XLSX = await import("xlsx");
  const errors: string[] = [];
  let wb: WorkBook;
  try {
    wb = XLSX.read(await file.arrayBuffer());
  } catch {
    return { backup: null, errors: ["The file is not a readable Excel workbook"] };
  }

  // Info: version and export time
  const infoSheet = wb.Sheets[SHEETS.info];
  const info = new Map<string, Cell>();
  if (infoSheet) {
    for (const row of XLSX.utils.sheet_to_json<Cell[]>(infoSheet, { header: 1, raw: true, defval: null })) {
      info.set(headerKey(row[0]), row[1] ?? null);
    }
  } else errors.push(`Sheet "${SHEETS.info}" is missing; is this a settings backup file?`);

  const machines: BackupMachine[] = [];
  const machineByNo = new Map<string, BackupMachine>();
  /** First machine row, for the per-machine OEE columns of older backups. */
  let firstMachine: ((col: string) => Cell) | null = null;
  for (const { rowNumber, get } of readRows(XLSX, wb, SHEETS.machines, [...MACHINE_COLUMNS.slice(0, 6)], errors)) {
    const at = (col: string) => `${SHEETS.machines} row ${rowNumber}: ${col}`;
    firstMachine ??= get;
    const optionalBool = (col: string, fallback: boolean) =>
      text(get(col)) === "" ? fallback : bool(get(col), at(col), errors);
    const machine: BackupMachine = {
      machineNo: text(get("Machine No")),
      machineName: text(get("Machine Name")),
      tagStatus: text(get("Tag Status")),
      tagOutput: text(get("Tag Output")),
      tagReject: text(get("Tag Reject")),
      tagProduct: text(get("Tag Product")),
      isActive: optionalBool("Active", true),
      oeeEnabled: optionalBool("OEE Enabled", true),
      photo: text(get("Photo")) || null,
      monitoringTags: [],
    };
    machines.push(machine);
    if (machine.machineNo) machineByNo.set(machine.machineNo.toLowerCase(), machine);
  }

  for (const { rowNumber, get } of readRows(XLSX, wb, SHEETS.tags, ["Machine No", "Name", "Tag Name"], errors)) {
    const machineNo = text(get("Machine No"));
    const machine = machineByNo.get(machineNo.toLowerCase());
    if (!machine) errors.push(`${SHEETS.tags} row ${rowNumber}: machine "${machineNo}" is not in the Machines sheet`);
    else machine.monitoringTags.push({ name: text(get("Name")), tagName: text(get("Tag Name")) });
  }

  const skus = readRows(XLSX, wb, SHEETS.skus, ["SKU ID", "Product Name", "SKU", "Output Per Minute"], errors).map(
    ({ rowNumber, get }) => ({
      skuId: text(get("SKU ID")),
      productName: text(get("Product Name")),
      sku: text(get("SKU")),
      outputPerMinute: num(get("Output Per Minute"), `${SHEETS.skus} row ${rowNumber}: Output Per Minute`, errors),
    })
  );

  const shifts = readRows(XLSX, wb, SHEETS.shifts, ["Name", "Start", "End"], errors).map(({ get }) => ({
    name: text(get("Name")),
    start: time(get("Start")),
    end: time(get("End")),
  }));

  const statusDefinition: SettingsBackup["statusDefinition"] = { run: [], stop: [], off: [], unmatched: "OFF" };
  for (const { rowNumber, get } of readRows(XLSX, wb, SHEETS.status, ["Status", "Values"], errors)) {
    const status = text(get("Status")).toUpperCase();
    const where = `${SHEETS.status} row ${rowNumber}`;
    if (status === "UNMATCHED") {
      const value = text(get("Values")).toUpperCase() as MachineStatus;
      if (!STATUSES.includes(value)) errors.push(`${where}: UNMATCHED must be RUN, STOP or OFF`);
      else statusDefinition.unmatched = value;
    } else if (status === "RUN" || status === "STOP" || status === "OFF") {
      statusDefinition[status.toLowerCase() as "run" | "stop" | "off"] = numberList(get("Values"), `${where}: Values`, errors);
    } else errors.push(`${where}: Status must be RUN, STOP, OFF or UNMATCHED`);
  }

  // OEE settings: one row per setting; the backend fills in and checks the values. Older backups
  // have no such sheet but OEE columns per machine; the first machine's values are used then.
  type Oee = SettingsBackup["oeeSettings"];
  const oeeSettings: Partial<Oee> = {};
  const oeeRows = wb.Sheets[SHEETS.oee] ? readRows(XLSX, wb, SHEETS.oee, ["Setting", "Value"], errors) : [];
  const legacy = firstMachine as ((col: string) => Cell) | null;
  if (!wb.Sheets[SHEETS.oee] && legacy) {
    const legacyBool = (col: string) => (text(legacy(col)) === "" ? undefined : bool(legacy(col), `${SHEETS.machines}: ${col}`, errors));
    if (text(legacy("OEE Start Mode"))) oeeSettings.startMode = text(legacy("OEE Start Mode")).toLowerCase() as Oee["startMode"];
    if (text(legacy("Counter Mode"))) oeeSettings.counterMode = text(legacy("Counter Mode")).toLowerCase() as Oee["counterMode"];
    oeeSettings.resetOnSkuChange = legacyBool("Reset On SKU Change");
    oeeSettings.pauseWhenOff = legacyBool("Pause When Off");
  }
  for (const { rowNumber, get } of oeeRows) {
    const where = `${SHEETS.oee} row ${rowNumber}`;
    const value = get("Value");
    switch (headerKey(get("Setting"))) {
      case "startmode":
        oeeSettings.startMode = text(value).toLowerCase() as Oee["startMode"];
        break;
      case "countermode":
        oeeSettings.counterMode = text(value).toLowerCase() as Oee["counterMode"];
        break;
      case "resetonskuchange":
        oeeSettings.resetOnSkuChange = bool(value, `${where}: Value`, errors);
        break;
      case "rejectsource":
        oeeSettings.rejectSource = text(value).toLowerCase() as Oee["rejectSource"];
        break;
      case "pausewhenoff":
        oeeSettings.pauseWhenOff = bool(value, `${where}: Value`, errors);
        break;
      case "custommachinename":
        oeeSettings.machineLabelEnabled = bool(value, `${where}: Value`, errors);
        break;
      case "machinename":
        oeeSettings.machineLabel = text(value);
        break;
      case "breakdownwhenoff":
        oeeSettings.breakdownWhenOff = bool(value, `${where}: Value`, errors);
        break;
      case "finishrules":
        try {
          oeeSettings.finishRules = parseFinishRules(text(value));
        } catch (err) {
          errors.push(`${where}: ${(err as Error).message}`);
        }
        break;
      default:
        errors.push(`${where}: unknown setting "${text(get("Setting"))}"`);
    }
  }

  // Role permissions: optional sheet; without it the current role permissions are kept.
  let rolePermissions: RolePermissions | undefined;
  if (wb.Sheets[SHEETS.roles]) {
    const roles = { ADMIN: [], ENGINEER: [], OPERATOR: [] } as RolePermissions;
    for (const { rowNumber, get } of readRows(XLSX, wb, SHEETS.roles, ["Role", "Permissions"], errors)) {
      const role = text(get("Role")).toUpperCase() as ManagedRole;
      if (!MANAGED_ROLES.includes(role)) {
        errors.push(`${SHEETS.roles} row ${rowNumber}: Role must be ${MANAGED_ROLES.join(", ")}`);
        continue;
      }
      roles[role] = text(get("Permissions")).split(/[,;\s]+/).filter(Boolean) as RolePermissions[ManagedRole];
    }
    rolePermissions = roles;
  }

  const layoutMarkers = readRows(XLSX, wb, SHEETS.markers, ["Machine No", "X", "Y"], errors).map(
    ({ rowNumber, get }) => ({
      machineNo: text(get("Machine No")),
      x: num(get("X"), `${SHEETS.markers} row ${rowNumber}: X`, errors),
      y: num(get("Y"), `${SHEETS.markers} row ${rowNumber}: Y`, errors),
    })
  );

  const rejectTypes = readRows(XLSX, wb, SHEETS.rejectTypes, ["Name", "Order"], errors).map(
    ({ rowNumber, get }, i) => ({
      name: text(get("Name")),
      sortOrder: text(get("Order")) === "" ? i + 1 : num(get("Order"), `${SHEETS.rejectTypes} row ${rowNumber}: Order`, errors),
    })
  );

  const version = Number(info.get("version"));
  if (infoSheet && version !== BACKUP_VERSION) {
    errors.push(`Backup version ${text(info.get("version")) || "(empty)"} is not supported (expected ${BACKUP_VERSION})`);
  }
  if (errors.length) return { backup: null, errors };
  return {
    backup: {
      version,
      exportedAt: text(info.get("exportedat")),
      machines,
      skus,
      shifts,
      statusDefinition,
      oeeSettings: oeeSettings as Oee,
      rolePermissions,
      layoutMarkers,
      rejectTypes,
    },
    errors,
  };
}

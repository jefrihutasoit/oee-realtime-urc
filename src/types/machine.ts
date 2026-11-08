/** A gateway tag shown on the machine's realtime monitoring view, e.g. seal temperature. */
export interface MonitoringTag {
  id: string;
  name: string;
  tagName: string;
  /** Display unit of the value, e.g. "°C"; "" when none. */
  unit: string;
}

/**
 * Yamato Dataweigh (Alpha Plus) scale polled by the backend over TCP every second. The chosen DS fields
 * become realtime tags of the machine ("<machineNo>.YAMATO.<FIELD>"), stored like monitoring tags.
 */
export interface ScaleConfig {
  enabled: boolean;
  host: string;
  port: number;
  /** Machine side sent with the DS command, "1" or "2". */
  mcSide: string;
  /** Keys of the DS fields to read (see YAMATO_FIELDS). */
  fields: string[];
}

/** Connection state of one polled scale (`GET /machines/scales/status`). */
export interface ScaleStatus {
  machineId: string;
  machineNo: string;
  address: string;
  state: "connecting" | "connected" | "error";
  lastReadAt: string | null;
  lastError: string | null;
}

/** `POST /machines/scales/test`: one DS read with the raw payload and every field read from it. */
export interface ScaleTestResult {
  /** "live" when the machine's running connection to the same scale answered (no second connection). */
  source: "test" | "live";
  ms: number;
  payload: string;
  fields: { key: string; label: string; group: string; unit: string; offset: number; length: number; raw: string; value: string | null }[];
}

export interface MachineRegistration {
  id: string;
  machineNo: string;
  machineName: string;
  /** Gateway tag addresses, e.g. "GW01.LINE1.M1A.STATUS". */
  tagStatus: string;
  tagOutput: string;
  tagReject: string;
  /** Tag holding the product / SKU code currently running on the machine. */
  tagProduct: string;
  /** Optional machine speed tag (per minute), compared with the running SKU's output per minute; "" when none. */
  tagSpeed: string;
  /** Display units of the output and reject counters, e.g. "pcs"; "" when none. */
  outputUnit: string;
  rejectUnit: string;
  /**
   * Realtime tags: "registered" = the monitoring tags below; "adaptive" = every tag the gateway publishes
   * on the machine's MQTT topic as "name,unit,value", kept in backend memory only.
   */
  realtimeMode: RealtimeMode;
  /** Adaptive tags not published for this long are dropped from the list. */
  adaptiveTtlMinutes: number;
  monitoringTags: MonitoringTag[];
  /** Yamato scale on this machine; null when none is set up. */
  scale: ScaleConfig | null;
  /** Image URL or data URL; null when no photo has been uploaded. */
  photo: string | null;
  isActive: boolean;
  oeeEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ProductionTagKey = "tagStatus" | "tagOutput" | "tagReject" | "tagProduct";

export type ProductionUnitKey = "outputUnit" | "rejectUnit";

export type RealtimeMode = "registered" | "adaptive";

/** Monitoring tag ids are optional on input; the server assigns ids to new rows. */
export type MonitoringTagInput = Omit<MonitoringTag, "id"> & { id?: string };

export type MachineInput = Pick<
  MachineRegistration,
  | "machineNo"
  | "machineName"
  | ProductionTagKey
  | ProductionUnitKey
  | "tagSpeed"
  | "realtimeMode"
  | "adaptiveTtlMinutes"
  | "photo"
  | "isActive"
  | "oeeEnabled"
> & { monitoringTags: MonitoringTagInput[]; scale?: ScaleConfig | null };

export interface GatewayTag {
  tag: string;
  description: string;
}

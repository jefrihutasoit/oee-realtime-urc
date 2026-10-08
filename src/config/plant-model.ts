/**
 * Estimated 3D model of the plant, traced by hand from the 2D layout drawing.
 *
 * Coordinates are pixels of the drawing scaled to DRAWING.width × DRAWING.height (x to the right, y down),
 * so they stay valid for any export of the same drawing with the same framing. Heights are in metres.
 * It approximates the packaging equipment (VFFS units, rotary multihead weighers, conveyors, case packers…);
 * adjust or add parts here when the drawing changes.
 *
 * Parts with an `id` are "units": a machine placed on them in Settings → Layout Mapping
 * uses that unit's stack light to show its live status.
 */

export const DRAWING = { width: 2000, height: 1064 };
/** Real width of the drawing in metres; sets the scale of every part. */
export const PLANT_WIDTH_M = 100;

export type Rect = [x1: number, y1: number, x2: number, y2: number];
export type Point = [x: number, y: number];

export type PlantPart =
  /** Named area painted on the floor (no walls). */
  | { kind: "zone"; rect: Rect; label?: string }
  | { kind: "conveyor"; rect: Rect }
  /** Conveyor rising from the `low` side ("top" or "bottom" of the rect in the drawing) to `height`. */
  | { kind: "incline"; rect: Rect; low: "top" | "bottom"; height: number }
  /** VFFS packing unit: white cabinet, film roll, control panel; `weigher` adds a weigher on top. */
  | { kind: "packer"; id: string; label: string; rect: Rect; weigher?: boolean }
  /** Rotary multihead weigher on a platform with yellow railings. */
  | { kind: "rotary"; id: string; label: string; at: Point; r: number }
  /** Unit with two weighers on columns. */
  | { kind: "twinWeigher"; id: string; label: string; rect: Rect }
  /** Case packer / cartoner: grey hood on a frame. */
  | { kind: "casePacker"; id: string; label: string; rect: Rect }
  /** Round collecting table. */
  | { kind: "table"; at: Point; r: number }
  /** Wall opening, drawn as a yellow gate frame with a floor plate. */
  | { kind: "gate"; label: string; rect: Rect }
  | { kind: "robot"; at: Point }
  | { kind: "block"; rect: Rect; height: number; tone: "white" | "grey" };

const R_X = [182, 280, 372, 466, 570, 665];
const R_NAMES = ["18.5", "21.5", "25", "28", "31.3", "34.3"];
const M_X = [355, 462, 557, 640, 740, 843];
const B_LEFT_X = [128, 218, 308, 398];
const B_RIGHT_X = [495, 585, 670, 755];
const B_INCLINE_X = [110, 200, 290, 380, 470, 560, 650, 735];

export const PLANT_MODEL: PlantPart[] = [
  // ---------- areas ----------
  { kind: "zone", rect: [35, 70, 745, 365] },
  { kind: "zone", rect: [1800, 30, 2000, 210], label: "Engineering room" },
  { kind: "zone", rect: [1805, 230, 2000, 425], label: "Idle area, BRC fence" },
  { kind: "zone", rect: [1080, 912, 1180, 990], label: "Sanitation room, drinking station" },

  // ---------- packing room (top left) ----------
  ...R_X.map(
    (x, i): PlantPart => ({ kind: "packer", id: `R${i + 1}`, label: `R${i + 1} (${R_NAMES[i]})`, rect: [x - 30, 110, x + 30, 232], weigher: true })
  ),
  { kind: "conveyor", rect: [60, 236, 740, 250] },
  { kind: "robot", at: [215, 322] },
  { kind: "robot", at: [410, 322] },
  { kind: "block", rect: [180, 282, 255, 380], height: 1.6, tone: "grey" },
  { kind: "block", rect: [372, 282, 450, 380], height: 1.6, tone: "grey" },
  { kind: "conveyor", rect: [72, 343, 330, 355] },
  { kind: "conveyor", rect: [470, 345, 527, 357] },
  { kind: "block", rect: [535, 300, 615, 378], height: 1.8, tone: "grey" },
  { kind: "block", rect: [630, 300, 735, 378], height: 1.8, tone: "grey" },

  // ---------- end of line to hole 3 ----------
  { kind: "block", rect: [850, 95, 920, 170], height: 2.6, tone: "white" },
  { kind: "conveyor", rect: [858, 170, 872, 236] },
  { kind: "conveyor", rect: [745, 232, 1000, 246] },
  { kind: "conveyor", rect: [765, 284, 1000, 298] },
  { kind: "conveyor", rect: [779, 338, 1035, 352] },
  { kind: "gate", label: "Hole 3", rect: [1035, 316, 1080, 358] },

  // ---------- middle line ----------
  ...[105, 195, 285].map(
    (x, i): PlantPart => ({ kind: "packer", id: `L${i + 1}`, label: `Unit L${i + 1}`, rect: [x - 40, 500, x + 40, 575] })
  ),
  ...[117, 207, 297].map((x): PlantPart => ({ kind: "table", at: [x, 618], r: 40 })),
  ...M_X.map((x, i): PlantPart => ({ kind: "rotary", id: `M${i + 1}`, label: `Unit M${i + 1}`, at: [x, 548], r: 46 })),
  ...M_X.map((x): PlantPart => ({ kind: "table", at: [x, 628], r: 24 })),
  { kind: "twinWeigher", id: "M7", label: "Unit M7", rect: [940, 470, 1022, 578] },
  { kind: "twinWeigher", id: "M8", label: "Unit M8", rect: [1030, 470, 1120, 578] },
  ...[962, 1003, 1055, 1095].map((x): PlantPart => ({ kind: "table", at: [x, 596], r: 17 })),

  // ---------- hole 2 ----------
  { kind: "conveyor", rect: [1215, 480, 1240, 690] },
  { kind: "conveyor", rect: [1240, 489, 1380, 501] },
  { kind: "conveyor", rect: [1240, 540, 1380, 552] },
  { kind: "conveyor", rect: [1240, 590, 1380, 602] },
  { kind: "gate", label: "Hole 2", rect: [1395, 485, 1470, 600] },

  // ---------- main conveyors ----------
  { kind: "conveyor", rect: [80, 690, 1215, 708] },
  { kind: "conveyor", rect: [80, 715, 1215, 733] },
  { kind: "conveyor", rect: [470, 753, 1640, 765] },
  { kind: "conveyor", rect: [630, 784, 1600, 796] },

  // ---------- bottom line ----------
  ...[...B_LEFT_X, ...B_RIGHT_X].map(
    (x, i): PlantPart => ({ kind: "packer", id: `B${i + 1}`, label: `Unit B${i + 1}`, rect: [x - 42, 808, x + 42, 888] })
  ),
  ...[...B_LEFT_X, ...B_RIGHT_X].flatMap((x): PlantPart[] => [
    { kind: "table", at: [x - 22, 762], r: 20 },
    { kind: "table", at: [x + 20, 762], r: 20 },
  ]),
  ...B_INCLINE_X.map((x): PlantPart => ({ kind: "incline", rect: [x - 9, 888, x + 9, 1000], low: "bottom", height: 4.2 })),

  // ---------- end of line to hole 1 (bottom right) ----------
  { kind: "conveyor", rect: [1630, 685, 1650, 920] },
  { kind: "conveyor", rect: [1650, 712, 1765, 724] },
  { kind: "conveyor", rect: [1650, 885, 1765, 897] },
  { kind: "casePacker", id: "CP1", label: "Case packer 1", rect: [1765, 686, 1845, 780] },
  { kind: "casePacker", id: "CP2", label: "Case packer 2", rect: [1765, 815, 1845, 935] },
  { kind: "casePacker", id: "CP3", label: "Palletiser 1", rect: [1872, 688, 1940, 750] },
  { kind: "casePacker", id: "CP4", label: "Palletiser 2", rect: [1872, 872, 1940, 935] },
  { kind: "block", rect: [1670, 690, 1710, 722], height: 1.5, tone: "white" },
  { kind: "block", rect: [1730, 745, 1762, 778], height: 1.5, tone: "white" },
  { kind: "block", rect: [1670, 870, 1710, 905], height: 1.5, tone: "white" },
  { kind: "block", rect: [1692, 822, 1722, 852], height: 1.5, tone: "white" },
  { kind: "conveyor", rect: [1360, 840, 1375, 945] },
  { kind: "conveyor", rect: [1365, 935, 1650, 950] },
  { kind: "conveyor", rect: [1270, 812, 1465, 828] },
  { kind: "gate", label: "Hole 1", rect: [1465, 805, 1530, 855] },
];

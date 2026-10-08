import * as THREE from "three";
import { DRAWING, PLANT_MODEL, PLANT_WIDTH_M, type PlantPart, type Point, type Rect } from "@/config/plant-model";

/** A machine placed on the layout; x/y are fractions of the drawing (DRAWING width / height). */
export interface PlacedMachine {
  id: string;
  x: number;
  y: number;
  /** Status colour of the lamp and floor ring. */
  color: string;
  status: "RUN" | "STOP" | "OFF" | "NONE";
  dim: boolean;
}

/** Units further than this from a marker (in drawing pixels) are not matched to it. */
const SNAP_PX = 45;
/** Fixed camera: degrees above the floor, and to the left of straight-on. */
const ELEVATION = 50;
const AZIMUTH = -9;

interface Andon {
  red: THREE.MeshStandardMaterial;
  amber: THREE.MeshStandardMaterial;
  green: THREE.MeshStandardMaterial;
}

interface Unit {
  rect: Rect;
  anchor: THREE.Vector3;
  andon?: Andon;
}

interface MachineMark {
  anchor: THREE.Vector3;
  andon: Andon;
  ring: THREE.Mesh;
  status: PlacedMachine["status"];
  dim: boolean;
}

const LAMP = { red: "#ef4444", amber: "#f59e0b", green: "#22c55e" };

/**
 * Three.js view of the plant from a fixed camera: the estimated equipment from PLANT_MODEL on a white floor,
 * with each placed machine's stack light showing its status. HTML labels registered in `machineLabels`
 * (by machine id) are moved to follow the scene every frame.
 */
export class PlantScene {
  /** Machine labels by machine id. */
  readonly machineLabels = new Map<string, HTMLElement>();
  onHover?: (machineId: string | null) => void;
  onSelect?: (machineId: string) => void;

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 1, 800);
  private frame = 0;
  private clock = new THREE.Clock();
  private readonly floorW = PLANT_WIDTH_M;
  private readonly floorD = PLANT_WIDTH_M * (DRAWING.height / DRAWING.width);
  private model = new THREE.Group();
  private marks = new THREE.Group();
  private units = new Map<string, Unit>();
  private machines = new Map<string, MachineMark>();
  /** Unit ids a machine is placed on; each unit takes at most one machine. */
  private takenUnits = new Set<string>();
  private hitMeshes: THREE.Mesh[] = [];
  private hovered: string | null = null;
  private pinned: string | null = null;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private resizeObserver: ResizeObserver;
  private geo = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 24),
  };
  private mats = {
    white: new THREE.MeshStandardMaterial({ color: "#f8fafc", roughness: 0.55 }),
    panel: new THREE.MeshStandardMaterial({ color: "#e2e8f0", roughness: 0.6 }),
    grey: new THREE.MeshStandardMaterial({ color: "#a3acb8", roughness: 0.5, metalness: 0.2 }),
    darkGrey: new THREE.MeshStandardMaterial({ color: "#7b8592", roughness: 0.5, metalness: 0.3 }),
    steel: new THREE.MeshStandardMaterial({ color: "#c9d1db", roughness: 0.3, metalness: 0.6 }),
    teal: new THREE.MeshStandardMaterial({ color: "#2dd4bf", roughness: 0.4 }),
    blue: new THREE.MeshStandardMaterial({ color: "#60a5fa", roughness: 0.3, emissive: "#1d4ed8", emissiveIntensity: 0.25 }),
    yellow: new THREE.MeshStandardMaterial({ color: "#facc15", roughness: 0.45 }),
    orange: new THREE.MeshStandardMaterial({ color: "#f59e0b", roughness: 0.45 }),
    plate: new THREE.MeshStandardMaterial({ color: "#64748b", roughness: 0.8 }),
    zone: new THREE.MeshStandardMaterial({ color: "#eef2f6", roughness: 1 }),
    hit: new THREE.MeshBasicMaterial({ visible: false }),
  };

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.style.display = "block";
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color("#dde4ec");
    this.scene.add(new THREE.HemisphereLight("#ffffff", "#c7d0db", 1.6));
    const sun = new THREE.DirectionalLight("#ffffff", 1.5);
    sun.position.set(-30, 70, 45);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 40, bottom: -40, near: 1, far: 200 });
    sun.shadow.bias = -0.0004;
    sun.shadow.radius = 4;
    this.scene.add(sun, this.model, this.marks);

    this.buildFloor();
    for (const part of PLANT_MODEL) this.addPart(part);
    this.model.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material !== this.mats.zone) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });

    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    canvas.addEventListener("click", this.onClick);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.loop();
  }

  // ---------- coordinates ----------

  /** Drawing pixels â†’ world x / z, and pixel lengths â†’ metres. */
  private wx = (px: number) => (px / DRAWING.width - 0.5) * this.floorW;
  private wz = (py: number) => (py / DRAWING.height - 0.5) * this.floorD;
  private m = (px: number) => (px / DRAWING.width) * this.floorW;

  private add(material: THREE.Material, geometry: THREE.BufferGeometry, size: [number, number, number], pos: [number, number, number]) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.set(...size);
    mesh.position.set(...pos);
    this.model.add(mesh);
    return mesh;
  }

  /** Box over a drawing rectangle (optionally grown by `grow` metres) from `base` to `base + height`. */
  private box(rect: Rect, height: number, material: THREE.Material, base = 0, grow = 0) {
    const [x1, y1, x2, y2] = rect;
    return this.add(
      material,
      this.geo.box,
      [Math.max(this.m(x2 - x1), 0.05) + grow, height, Math.max(this.m(y2 - y1), 0.05) + grow],
      [this.wx((x1 + x2) / 2), base + height / 2, this.wz((y1 + y2) / 2)]
    );
  }

  /** Cylinder in metres at a world position. */
  private cyl(x: number, z: number, r: number, height: number, material: THREE.Material, base = 0) {
    return this.add(material, this.geo.cyl, [r, height, r], [x, base + height / 2, z]);
  }

  private center(rect: Rect): Point {
    return [(rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2];
  }

  // ---------- build ----------

  private buildFloor() {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(this.floorW + 4, 1.4, this.floorD + 4), [
      this.mats.panel,
      this.mats.panel,
      new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.9 }),
      this.mats.panel,
      this.mats.panel,
      this.mats.panel,
    ]);
    slab.position.y = -0.7;
    slab.receiveShadow = true;
    this.scene.add(slab);
  }

  private andon(x: number, z: number, base: number): Andon {
    const make = (color: string) =>
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0, roughness: 0.4, transparent: true, opacity: 0.55 });
    const andon = { red: make(LAMP.red), amber: make(LAMP.amber), green: make(LAMP.green) };
    this.cyl(x, z, 0.04, 0.5, this.mats.darkGrey, base);
    this.cyl(x, z, 0.13, 0.2, andon.green, base + 0.5);
    this.cyl(x, z, 0.13, 0.2, andon.amber, base + 0.72);
    this.cyl(x, z, 0.13, 0.2, andon.red, base + 0.94);
    return andon;
  }

  private registerUnit(id: string, rect: Rect, top: number, andon?: Andon) {
    const [cx, cy] = this.center(rect);
    this.units.set(id, { rect, anchor: new THREE.Vector3(this.wx(cx), top, this.wz(cy)), andon });
  }

  private addPart(part: PlantPart) {
    switch (part.kind) {
      case "zone": {
        const zone = this.box(part.rect, 0.02, this.mats.zone, 0.005);
        zone.receiveShadow = true;
        break;
      }

      case "conveyor": {
        const [x1, y1, x2, y2] = part.rect;
        const alongX = x2 - x1 >= y2 - y1;
        this.box(part.rect, 0.16, this.mats.grey, 0.85);
        this.box(alongX ? [x1, y1 + 2, x2, y2 - 2] : [x1 + 2, y1, x2 - 2, y2], 0.03, this.mats.darkGrey, 1.01);
        // Legs every ~3 m on both sides.
        const len = this.m(alongX ? x2 - x1 : y2 - y1);
        const n = Math.max(2, Math.round(len / 3) + 1);
        for (let i = 0; i < n; i++) {
          const t = i / (n - 1);
          for (const side of [0, 1]) {
            const px = alongX ? x1 + (x2 - x1) * t : side ? x2 - 1 : x1 + 1;
            const py = alongX ? (side ? y2 - 1 : y1 + 1) : y1 + (y2 - y1) * t;
            this.add(this.mats.darkGrey, this.geo.box, [0.07, 0.85, 0.07], [this.wx(px), 0.425, this.wz(py)]);
          }
        }
        break;
      }

      case "incline": {
        const [x1, y1, x2, y2] = part.rect;
        const len = this.m(y2 - y1);
        const angle = Math.atan2(part.height, len);
        const beam = this.add(
          this.mats.grey,
          this.geo.box,
          [this.m(x2 - x1), 0.3, Math.hypot(len, part.height)],
          [this.wx((x1 + x2) / 2), 0.4 + part.height / 2, this.wz((y1 + y2) / 2)]
        );
        beam.rotation.x = part.low === "bottom" ? angle : -angle;
        const highY = part.low === "bottom" ? y1 : y2;
        this.add(this.mats.darkGrey, this.geo.box, [0.1, part.height + 0.4, 0.1], [this.wx((x1 + x2) / 2), (part.height + 0.4) / 2, this.wz(highY)]);
        break;
      }

      case "packer": {
        const [x1, y1, x2, y2] = part.rect;
        const [cx] = this.center(part.rect);
        const front = y2;
        // Cabinet, coloured band, upper frame and forming tube.
        this.box(part.rect, 2.2, this.mats.white);
        this.box(part.rect, 0.14, part.weigher ? this.mats.teal : this.mats.blue, 1.55, 0.04);
        this.box([x1 + 6, y1 + 6, x2 - 6, y2 - 10], 0.7, this.mats.panel, 2.2);
        this.cyl(this.wx(cx), this.wz((y1 + y2) / 2), 0.16, 0.6, this.mats.steel, 2.9);
        // Film roll at the front and the control screen on the side.
        const roll = this.cyl(this.wx(cx), this.wz(front) + 0.35, 0.42, this.m(x2 - x1) * 0.6, this.mats.steel, 0);
        roll.rotation.z = Math.PI / 2;
        roll.position.y = 0.6;
        this.add(this.mats.blue, this.geo.box, [0.08, 0.5, 0.7], [this.wx(x2) + 0.05, 1.6, this.wz(front) - 0.6]);
        let top = 3.5;
        if (part.weigher) {
          const z = this.wz((y1 + y2) / 2);
          this.cyl(this.wx(cx), z, 0.9, 0.5, this.mats.steel, 3.5);
          this.add(this.mats.steel, new THREE.ConeGeometry(0.75, 0.6, 18), [1, 1, 1], [this.wx(cx), 4.3, z]);
          top = 4.6;
        }
        const andon = this.andon(this.wx(x2) - 0.3, this.wz(y1) + 0.3, 2.9);
        this.registerUnit(part.id, part.rect, top + 0.4, andon);
        break;
      }

      case "rotary": {
        const [px, py] = part.at;
        const r = this.m(part.r);
        const x = this.wx(px);
        const z = this.wz(py);
        const deck = 2.6;
        // Platform on legs with a teal edge and yellow railings.
        for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          this.add(this.mats.darkGrey, this.geo.box, [0.12, deck, 0.12], [x + dx * r * 0.95, deck / 2, z + dz * r * 0.95]);
          this.add(this.mats.yellow, this.geo.box, [0.07, 1.1, 0.07], [x + dx * r, deck + 0.55, z + dz * r]);
        }
        this.add(this.mats.panel, this.geo.box, [r * 2, 0.15, r * 2], [x, deck, z]);
        this.add(this.mats.teal, this.geo.box, [r * 2 + 0.05, 0.08, r * 2 + 0.05], [x, deck - 0.08, z]);
        for (const [w, d, ox, oz] of [[r * 2, 0.06, 0, -r], [r * 2, 0.06, 0, r], [0.06, r * 2, -r, 0], [0.06, r * 2, r, 0]]) {
          this.add(this.mats.yellow, this.geo.box, [w, 0.06, d], [x + ox, deck + 1.1, z + oz]);
        }
        // Radial weigh buckets around a central cone, and the discharge chute below.
        const ring = 0.75 * r;
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          const b = this.add(this.mats.steel, this.geo.box, [0.32, 0.45, 0.9], [x + Math.cos(a) * ring, deck + 0.75, z + Math.sin(a) * ring]);
          b.rotation.y = -a + Math.PI / 2;
          b.rotation.x = 0.35;
        }
        this.add(this.mats.steel, new THREE.ConeGeometry(r * 0.5, 1.1, 24), [1, 1, 1], [x, deck + 1.35, z]);
        this.cyl(x, z, 0.35, 0.6, this.mats.steel, deck + 0.2);
        this.cyl(x, z, 0.18, deck - 1, this.mats.steel, 1);
        this.add(this.mats.white, this.geo.box, [r * 1.2, 1, r * 1.2], [x, 0.5, z]);
        const andon = this.andon(x + r * 0.9, z - r * 0.9, deck + 0.1);
        this.registerUnit(part.id, [px - part.r, py - part.r, px + part.r, py + part.r], deck + 2.4, andon);
        break;
      }

      case "twinWeigher": {
        const [x1, y1, x2, y2] = part.rect;
        const mid = y1 + (y2 - y1) * 0.45;
        this.box([x1, mid, x2, y2], 2.2, this.mats.white);
        this.box([x1, mid, x2, y2], 0.14, this.mats.blue, 1.55, 0.04);
        for (const fx of [0.3, 0.7]) {
          const x = this.wx(x1 + (x2 - x1) * fx);
          const z = this.wz(y1 + (mid - y1) * 0.5);
          this.cyl(x, z, 0.22, 3.6, this.mats.steel);
          this.cyl(x, z, 0.8, 0.5, this.mats.steel, 3.6);
          this.add(this.mats.steel, new THREE.ConeGeometry(0.7, 0.6, 18), [1, 1, 1], [x, 4.4, z]);
        }
        const andon = this.andon(this.wx(x2) - 0.3, this.wz(mid) + 0.3, 2.2);
        this.registerUnit(part.id, part.rect, 5.1, andon);
        break;
      }

      case "casePacker": {
        const [x1, y1, x2, y2] = part.rect;
        const h = 2.6;
        for (const [px, py] of [[x1 + 2, y1 + 2], [x2 - 2, y1 + 2], [x1 + 2, y2 - 2], [x2 - 2, y2 - 2]]) {
          this.add(this.mats.darkGrey, this.geo.box, [0.12, h, 0.12], [this.wx(px), h / 2, this.wz(py)]);
        }
        this.box(part.rect, 0.4, this.mats.grey, h, 0.2);
        this.box([x1 + 8, y1 + 8, x2 - 8, y2 - 8], 1.3, this.mats.white);
        this.add(this.mats.blue, this.geo.box, [0.5, 0.35, 0.06], [this.wx((x1 + x2) / 2), 1.2, this.wz(y2 - 8) + 0.04]);
        const andon = this.andon(this.wx(x2) - 0.3, this.wz(y1) + 0.3, h + 0.4);
        this.registerUnit(part.id, part.rect, h + 1.8, andon);
        break;
      }

      case "table": {
        const x = this.wx(part.at[0]);
        const z = this.wz(part.at[1]);
        this.cyl(x, z, 0.12, 0.8, this.mats.darkGrey);
        this.cyl(x, z, this.m(part.r), 0.08, this.mats.steel, 0.8);
        break;
      }

      case "gate": {
        const [x1, y1, x2, y2] = part.rect;
        const h = 3.4;
        this.box(part.rect, 0.03, this.mats.plate, 0.01);
        const alongX = x2 - x1 >= y2 - y1;
        const [cx, cy] = this.center(part.rect);
        const ends: Point[] = alongX ? [[x1 + 2, cy], [x2 - 2, cy]] : [[cx, y1 + 2], [cx, y2 - 2]];
        for (const [px, py] of ends) {
          this.add(this.mats.yellow, this.geo.box, [0.22, h, 0.22], [this.wx(px), h / 2, this.wz(py)]);
        }
        this.add(
          this.mats.yellow,
          this.geo.box,
          alongX ? [this.m(x2 - x1), 0.22, 0.22] : [0.22, 0.22, this.m(y2 - y1)],
          [this.wx(cx), h, this.wz(cy)]
        );
        break;
      }

      case "robot": {
        const x = this.wx(part.at[0]);
        const z = this.wz(part.at[1]);
        this.cyl(x, z, 0.5, 0.4, this.mats.darkGrey);
        this.cyl(x, z, 0.38, 0.7, this.mats.orange, 0.4);
        const arm1 = this.add(this.mats.orange, this.geo.box, [0.32, 1.8, 0.32], [x + 0.3, 1.9, z]);
        arm1.rotation.z = -0.35;
        const arm2 = this.add(this.mats.orange, this.geo.box, [1.7, 0.28, 0.28], [x + 1.2, 2.7, z]);
        arm2.rotation.z = -0.25;
        this.add(this.mats.darkGrey, this.geo.box, [0.2, 0.5, 0.2], [x + 2, 2.3, z]);
        break;
      }

      case "block":
        this.box(part.rect, part.height, part.tone === "white" ? this.mats.white : this.mats.grey);
        if (part.tone === "white") this.box(part.rect, 0.1, this.mats.blue, part.height * 0.7, 0.04);
        break;
    }
  }

  // ---------- machines ----------

  /** Unit whose footprint contains the point, else the nearest one within SNAP_PX. */
  private unitAt(px: number, py: number): [string, Unit] | null {
    let best: [string, Unit] | null = null;
    let bestDist = SNAP_PX;
    for (const entry of this.units) {
      const [x1, y1, x2, y2] = entry[1].rect;
      if (px >= x1 && px <= x2 && py >= y1 && py <= y2) return entry;
      const d = Math.hypot(px - Math.min(Math.max(px, x1), x2), py - Math.min(Math.max(py, y1), y2));
      if (d < bestDist) {
        bestDist = d;
        best = entry;
      }
    }
    return best;
  }

  /** Places the machines: on the unit under their marker, or as a free-standing stack light. */
  setMachines(list: PlacedMachine[]) {
    for (const child of [...this.marks.children]) {
      this.marks.remove(child);
      child.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          if (o.geometry !== this.geo.box && o.geometry !== this.geo.cyl) o.geometry.dispose();
          if (!Object.values(this.mats).includes(o.material as never)) (o.material as THREE.Material).dispose();
        }
      });
    }
    // Reset unit lamps to idle.
    for (const u of this.units.values()) if (u.andon) this.lightAndon(u.andon, "NONE", false, 0);
    this.machines.clear();
    this.takenUnits.clear();
    this.hitMeshes = [];

    for (const m of list) {
      const px = m.x * DRAWING.width;
      const py = m.y * DRAWING.height;
      const hit = this.unitAt(px, py);
      const unit = hit && !this.takenUnits.has(hit[0]) && hit[1].andon ? hit : null;

      let anchor: THREE.Vector3;
      let andon: Andon;
      let size: number;
      let center: THREE.Vector3;
      if (unit) {
        this.takenUnits.add(unit[0]);
        anchor = unit[1].anchor.clone();
        andon = unit[1].andon!;
        const [x1, y1, x2, y2] = unit[1].rect;
        size = Math.max(this.m(x2 - x1), this.m(y2 - y1)) / 2 + 0.8;
        center = new THREE.Vector3(anchor.x, 0, anchor.z);
      } else {
        // Free-standing pole with its own stack light.
        center = new THREE.Vector3(this.wx(px), 0, this.wz(py));
        const pole = new THREE.Mesh(this.geo.cyl, this.mats.darkGrey);
        pole.scale.set(0.06, 3, 0.06);
        pole.position.set(center.x, 1.5, center.z);
        this.marks.add(pole);
        const before = this.model.children.length;
        andon = this.andon(center.x, center.z, 3);
        // Move the lamp meshes just created into the marks group so they are removed with it.
        for (const o of this.model.children.slice(before)) this.marks.add(o);
        anchor = new THREE.Vector3(center.x, 4.4, center.z);
        size = 1.2;
      }

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(size, size + 0.35, 48),
        new THREE.MeshBasicMaterial({ color: m.color, transparent: true, opacity: m.dim ? 0.25 : 0.85, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(center.x, 0.03, center.z);
      this.marks.add(ring);

      const hitMesh = new THREE.Mesh(this.geo.box, this.mats.hit);
      hitMesh.scale.set(size * 2, anchor.y, size * 2);
      hitMesh.position.set(center.x, anchor.y / 2, center.z);
      hitMesh.userData.machineId = m.id;
      this.marks.add(hitMesh);
      this.hitMeshes.push(hitMesh);

      this.machines.set(m.id, { anchor, andon, ring, status: m.status, dim: m.dim });
    }
  }

  private lightAndon(a: Andon, status: PlacedMachine["status"], dim: boolean, time: number) {
    const on = (mat: THREE.MeshStandardMaterial, lit: boolean) => {
      mat.emissiveIntensity = lit ? 1.6 : 0;
      mat.opacity = lit ? 1 : 0.45;
    };
    const blink = Math.sin(time * 6) > 0;
    on(a.green, !dim && status === "RUN");
    on(a.amber, !dim && status === "STOP" && blink);
    on(a.red, false);
  }

  /** Keeps a machine's label on top while its card is open. */
  setHovered(machineId: string | null) {
    this.pinned = machineId;
  }

  // ---------- pointer ----------

  private aim(e: { clientX: number; clientY: number }) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  /** Machine under the pointer, if any. */
  pick(e: { clientX: number; clientY: number }): string | null {
    this.aim(e);
    const hit = this.raycaster.intersectObjects(this.hitMeshes, false)[0];
    return (hit?.object.userData.machineId as string | undefined) ?? null;
  }

  /** Floor point under the pointer as fractions of the drawing (may fall outside 0–1), or null. */
  floorPoint(e: { clientX: number; clientY: number }): { x: number; y: number } | null {
    this.aim(e);
    const p = this.raycaster.ray.intersectPlane(this.floorPlane, new THREE.Vector3());
    return p ? { x: p.x / this.floorW + 0.5, y: p.z / this.floorD + 0.5 } : null;
  }

  private onPointerMove = (e: PointerEvent) => {
    const id = this.pick(e);
    this.renderer.domElement.style.cursor = id ? "pointer" : "default";
    if (id !== this.hovered) {
      this.hovered = id;
      this.onHover?.(id);
    }
  };

  private onPointerLeave = () => {
    if (this.hovered === null) return;
    this.hovered = null;
    this.onHover?.(null);
  };

  private onClick = (e: MouseEvent) => {
    const id = this.pick(e);
    if (id) this.onSelect?.(id);
  };

  // ---------- camera & loop ----------

  /** Fixed camera at ELEVATION / AZIMUTH, pulled back until the whole floor and equipment fit. */
  private fitCamera() {
    const el = THREE.MathUtils.degToRad(ELEVATION);
    const az = THREE.MathUtils.degToRad(AZIMUTH);
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    const target = new THREE.Vector3(0, 0, 0.5);
    const corners: THREE.Vector3[] = [];
    for (const x of [-this.floorW / 2, this.floorW / 2])
      for (const z of [-this.floorD / 2, this.floorD / 2]) for (const y of [-1.4, 5]) corners.push(new THREE.Vector3(x, y, z));

    const fits = (d: number) => {
      this.camera.position.copy(target).addScaledVector(dir, d);
      this.camera.lookAt(target);
      this.camera.updateMatrixWorld();
      return corners.every((c) => {
        const p = c.clone().project(this.camera);
        return Math.abs(p.x) <= 0.98 && Math.abs(p.y) <= 0.86 && p.z < 1;
      });
    };
    let lo = 5;
    let hi = 600;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    fits(hi);
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fitCamera();
  }

  private loop = () => {
    this.frame = requestAnimationFrame(this.loop);
    const time = this.clock.getElapsedTime();
    for (const m of this.machines.values()) {
      this.lightAndon(m.andon, m.status, m.dim, time);
      const s = 1 + (time % 1.5) / 1.5 * 0.25;
      m.ring.scale.set(s, s, 1);
    }
    this.renderer.render(this.scene, this.camera);
    this.placeLabels();
  };

  /** Moves the machine labels to their anchors; nearer labels stack above farther ones. */
  private placeLabels() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const v = new THREE.Vector3();
    const place = (el: HTMLElement, anchor: THREE.Vector3 | undefined, boost: number) => {
      if (!anchor) {
        el.style.display = "none";
        return;
      }
      v.copy(anchor).project(this.camera);
      if (v.z > 1) {
        el.style.display = "none";
        return;
      }
      el.style.display = "";
      el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`;
      el.style.zIndex = String(Math.round((1 - v.z) * 100000) + boost);
    };
    for (const [id, el] of this.machineLabels) {
      place(el, this.machines.get(id)?.anchor, id === this.pinned ? 100000 : 0);
    }
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointermove", this.onPointerMove);
    canvas.removeEventListener("pointerleave", this.onPointerLeave);
    canvas.removeEventListener("click", this.onClick);
    const materials = new Set<THREE.Material>();
    const geometries = new Set<THREE.BufferGeometry>();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        geometries.add(o.geometry);
        for (const mat of Array.isArray(o.material) ? o.material : [o.material]) materials.add(mat);
      }
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    this.renderer.dispose();
    canvas.remove();
  }
}

// Keep in sync with be-realtime-urc/src/types/layout.ts

/** A machine's position on the plant layout, as fractions (0–1) of the plant drawing width and height (DRAWING in config/plant-model). */
export interface LayoutMarker {
  machineId: string;
  x: number;
  y: number;
}

export interface PlantLayout {
  /** Backend path of the layout image (e.g. "/uploads/layout/x.png"); null when none is uploaded. */
  image: string | null;
  markers: LayoutMarker[];
  updatedAt: string | null;
}

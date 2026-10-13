import { apiRequest } from "@/lib/api";
import type { LayoutIndicator, LayoutMarker, LayoutView, PlantLayout } from "@/types/layout";

export const layoutApi = {
  get: () => apiRequest<PlantLayout>("/layout"),
  saveMarkers: (markers: LayoutMarker[]) =>
    apiRequest<PlantLayout>("/layout/markers", { method: "PUT", body: JSON.stringify({ markers }) }),
  /** PNG, JPG or WebP; replaces the current image. Machine positions are kept. */
  uploadImage: (file: File) =>
    apiRequest<PlantLayout>("/layout/image", { method: "PUT", body: file, headers: { "Content-Type": file.type } }),
  /** Default camera for everyone; null goes back to the automatic view. */
  saveView: (view: LayoutView | null) =>
    apiRequest<PlantLayout>("/layout/view", { method: "PUT", body: JSON.stringify({ view }) }),
  /** Status indicator style on the 3D layout, for everyone. */
  saveIndicator: (indicator: LayoutIndicator) =>
    apiRequest<PlantLayout>("/layout/indicator", { method: "PUT", body: JSON.stringify({ indicator }) }),
  /** Scale of machine labels and status symbols, for everyone. */
  saveMarkerSize: (markerSize: number) =>
    apiRequest<PlantLayout>("/layout/marker-size", { method: "PUT", body: JSON.stringify({ markerSize }) }),
  removeImage: () => apiRequest<PlantLayout>("/layout/image", { method: "DELETE" }),
};

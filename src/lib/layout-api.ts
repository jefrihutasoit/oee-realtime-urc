import { apiRequest } from "@/lib/api";
import type { LayoutMarker, PlantLayout } from "@/types/layout";

export const layoutApi = {
  get: () => apiRequest<PlantLayout>("/layout"),
  saveMarkers: (markers: LayoutMarker[]) =>
    apiRequest<PlantLayout>("/layout/markers", { method: "PUT", body: JSON.stringify({ markers }) }),
};

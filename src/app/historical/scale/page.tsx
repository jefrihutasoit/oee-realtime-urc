import { Suspense } from "react";
import ScaleMonitoring from "@/components/scale/ScaleMonitoring";

export default function ScaleMonitoringPage() {
  // Machine, signal and range are in the URL, which is only known in the browser.
  return (
    <Suspense>
      <ScaleMonitoring />
    </Suspense>
  );
}

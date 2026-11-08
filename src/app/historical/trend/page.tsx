import { Suspense } from "react";
import Trend from "@/components/trend/Trend";

export default function TrendPage() {
  // Machine, range, view and signals are in the URL, which is only known in the browser.
  return (
    <Suspense>
      <Trend />
    </Suspense>
  );
}

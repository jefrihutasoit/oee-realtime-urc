import { Suspense } from "react";
import Summary from "@/components/summary/Summary";

export default function SummaryPage() {
  // The selected date is in the URL (?date=), which is only known in the browser.
  return (
    <Suspense>
      <Summary />
    </Suspense>
  );
}

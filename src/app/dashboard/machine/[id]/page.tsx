import { Suspense } from "react";
import MachineDetail from "@/components/machine-detail/MachineDetail";

export default function MachineDetailPage({ params }: PageProps<"/dashboard/machine/[id]">) {
  // With Cache Components, params are runtime data and must be read inside Suspense.
  return (
    <Suspense fallback={<p className="py-24 text-center text-sm text-slate-500">Loading machine…</p>}>
      {params.then(({ id }) => (
        <MachineDetail id={id} />
      ))}
    </Suspense>
  );
}

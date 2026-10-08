import OeeSettingsForm from "@/components/settings/OeeSettingsForm";

export default function OeeSettingsPage() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-slate-500">Settings / OEE Calculation</p>
        <h2 className="text-xl font-semibold text-slate-900">OEE Calculation</h2>
        <p className="text-sm text-slate-500">
          Global rules for every machine with OEE enabled: when OEE counts, how the counters are read, breakdowns and
          when a run finishes.
        </p>
      </div>
      <OeeSettingsForm />
    </div>
  );
}

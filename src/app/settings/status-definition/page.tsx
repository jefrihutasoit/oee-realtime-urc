import StatusDefinitionForm from "@/components/settings/StatusDefinitionForm";

export default function StatusDefinitionPage() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-slate-500">Settings / Status Definition</p>
        <h2 className="text-xl font-semibold text-slate-900">Status Definition</h2>
        <p className="text-sm text-slate-500">
          Global rule for every machine: which value of the status tag means Run, Stop or Off.
        </p>
      </div>
      <StatusDefinitionForm />
    </div>
  );
}

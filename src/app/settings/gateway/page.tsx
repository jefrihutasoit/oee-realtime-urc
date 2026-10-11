import GatewaySettingsForm from "@/components/settings/GatewaySettingsForm";

export default function GatewaySettingsPage() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-slate-500">Settings / Gateway</p>
        <h2 className="text-xl font-semibold text-slate-900">Gateway</h2>
        <p className="text-sm text-slate-500">
          How PLC / IoT gateways send tag values to the backend (HTTP API or MQTT), and how readings are stored.
        </p>
      </div>
      <GatewaySettingsForm />
    </div>
  );
}

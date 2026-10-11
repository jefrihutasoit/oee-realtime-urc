"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Copy, Eye, EyeOff, Loader2, PlugZap, RefreshCw, XCircle } from "lucide-react";
import { buttonStyles } from "@/components/ui/Modal";
import Toggle from "@/components/ui/Toggle";
import { gatewayApi, machineTopic, type GatewaySettingsInput } from "@/lib/gateway-api";
import GatewayDebug from "./GatewayDebug";
import type { ChannelStats, GatewaySettingsView, GatewayStatus, MqttTestResult } from "@/types/gateway";

const inputCls =
  "h-10 w-full rounded-lg border border-slate-200 bg-surface px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400";
const num = new Intl.NumberFormat("en-US");
const timeFmt = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
const STATUS_REFRESH_MS = 3000;

/** Form state from the stored settings; password null = keep the stored one. */
const toInput = ({ mqtt, ...rest }: GatewaySettingsView): GatewaySettingsInput => ({
  ...rest,
  mqtt: {
    enabled: mqtt.enabled,
    mode: mqtt.mode,
    builtinPort: mqtt.builtinPort,
    brokerUrl: mqtt.brokerUrl,
    username: mqtt.username,
    password: null,
    clientId: mqtt.clientId,
    topic: mqtt.topic,
    qos: mqtt.qos,
  },
});

/** Host the gateway should send to: the API host when it is absolute, else this page's host. */
function backendHost() {
  const api = process.env.NEXT_PUBLIC_API_URL;
  if (api && /^https?:/.test(api)) return new URL(api).hostname;
  return typeof window === "undefined" ? "localhost" : window.location.hostname;
}

function Section({
  title,
  description,
  aside,
  children,
}: {
  title: string;
  description?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-surface px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">{title}</h3>
          {description && <p className="text-sm text-slate-500">{description}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function Pill({ tone, children }: { tone: "ok" | "warn" | "off"; children: React.ReactNode }) {
  const cls = {
    ok: "bg-emerald-50 text-emerald-700",
    warn: "bg-red-50 text-red-700",
    off: "bg-slate-100 text-slate-500",
  }[tone];
  const dot = { ok: "bg-emerald-500", warn: "bg-red-500", off: "bg-slate-400" }[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      <span className={`size-1.5 rounded-full ${dot}`} />
      {children}
    </span>
  );
}

function Stats({ stats, rate }: { stats: ChannelStats; rate: number | null }) {
  const rows: [string, string][] = [
    ["Messages", num.format(stats.messages)],
    ["Readings", `${num.format(stats.readings)}${rate !== null ? ` · ${rate.toFixed(1)}/s` : ""}`],
    ["Unknown tags", num.format(stats.ignored)],
    ["Invalid", num.format(stats.invalid)],
    ...(stats.retimed ? ([["Old ts → server time", num.format(stats.retimed)]] as [string, string][]) : []),
    ["Last message", stats.lastMessageAt ? timeFmt.format(new Date(stats.lastMessageAt)) : "—"],
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-slate-500">{k}</dt>
          <dd className="text-right font-medium text-slate-800 tabular-nums">{v}</dd>
        </div>
      ))}
      {stats.lastError && (
        <dd className="col-span-2 mt-1 rounded bg-red-50 px-2 py-1 text-red-700">{stats.lastError}</dd>
      )}
    </dl>
  );
}

function StatusPanel({ status, previous }: { status: GatewayStatus | null; previous: GatewayStatus | null }) {
  if (!status) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-surface px-5 py-4 text-sm text-slate-500">
        <Loader2 size={16} className="animate-spin" /> Loading status…
      </div>
    );
  }
  // Readings per second since the previous refresh.
  const rate = (key: "http" | "mqtt") => {
    if (!previous) return null;
    const seconds = (Date.parse(status.now) - Date.parse(previous.now)) / 1000;
    return seconds > 0 ? Math.max(0, status[key].readings - previous[key].readings) / seconds : null;
  };
  const { http, mqtt, storage } = status;
  const card = "space-y-2 rounded-xl border border-slate-200 bg-surface px-4 py-3";

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <div className={card}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900">HTTP API</p>
            {!http.enabled ? (
              <Pill tone="off">Disabled</Pill>
            ) : http.port && !http.listening ? (
              <Pill tone="warn">Port {http.port} not open</Pill>
            ) : (
              <Pill tone="ok">{http.port ? `Port ${status.apiPort} + ${http.port}` : `Port ${status.apiPort}`}</Pill>
            )}
          </div>
          <Stats stats={http} rate={rate("http")} />
        </div>
        <div className={card}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900">MQTT</p>
            {!mqtt.enabled ? (
              <Pill tone="off">Disabled</Pill>
            ) : mqtt.connected ? (
              <Pill tone="ok">
                {mqtt.mode === "builtin"
                  ? `Broker running · ${mqtt.clients} client${mqtt.clients === 1 ? "" : "s"}`
                  : "Connected"}
              </Pill>
            ) : (
              <Pill tone="warn">{mqtt.mode === "builtin" ? "Broker not running" : "Not connected"}</Pill>
            )}
          </div>
          <Stats stats={mqtt} rate={rate("mqtt")} />
        </div>
        <div className={card}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900">Database writes</p>
            {storage.lastError ? <Pill tone="warn">Write error</Pill> : <Pill tone="ok">OK</Pill>}
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            {(
              [
                ["Written", num.format(storage.written)],
                ["Skipped (unchanged)", num.format(storage.skipped)],
                ["Waiting", num.format(storage.pending)],
                ["Tags in memory", num.format(storage.cachedTags)],
                ["Adaptive tags (memory only)", `${num.format(storage.adaptiveTags)} · ${storage.adaptiveMachines} machines`],
                ["Last write", storage.lastFlushAt ? timeFmt.format(new Date(storage.lastFlushAt)) : "—"],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-slate-500">{k}</dt>
                <dd className="text-right font-medium text-slate-800 tabular-nums">{v}</dd>
              </div>
            ))}
            {storage.lastError && (
              <dd className="col-span-2 mt-1 rounded bg-red-50 px-2 py-1 text-red-700">{storage.lastError}</dd>
            )}
          </dl>
        </div>
      </div>
      {status.unknownTags.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">Received tags that no machine uses (ignored):</p>
          <p className="mt-1 font-mono text-xs break-all">{status.unknownTags.join(", ")}</p>
          <p className="mt-1 text-xs">Register them in Machine Management, or fix the tag names in the gateway.</p>
        </div>
      )}
    </div>
  );
}

export default function GatewaySettingsForm() {
  const [settings, setSettings] = useState<GatewaySettingsInput | null>(null);
  const [hasPassword, setHasPassword] = useState(false);
  /** The last two status reads, for the readings-per-second rate. */
  const [statuses, setStatuses] = useState<{
    current: GatewayStatus | null;
    previous: GatewayStatus | null;
  }>({
    current: null,
    previous: null,
  });
  const status = statuses.current;
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    tone: "ok" | "error";
  } | null>(null);
  const [tab, setTab] = useState<"settings" | "debug">("settings");
  const [testing, setTesting] = useState(false);
  /** Result of the last connection test, with the settings it was run for. */
  const [testResult, setTestResult] = useState<(MqttTestResult & { key: string }) | null>(null);
  const host = backendHost();

  const apply = (view: GatewaySettingsView) => {
    setSettings(toInput(view));
    setHasPassword(view.mqtt.hasPassword);
  };

  const refreshStatus = useCallback(
    () =>
      gatewayApi
        .status()
        .then((next) => setStatuses((s) => ({ current: next, previous: s.current })))
        // Keep the last status; the next refresh tries again.
        .catch(() => {}),
    [],
  );

  useEffect(() => {
    gatewayApi
      .getSettings()
      .then(apply)
      .catch((err: Error) => setLoadError(err.message));
    gatewayApi
      .status()
      .then((next) => setStatuses({ current: next, previous: null }))
      .catch(() => {});
    const timer = setInterval(refreshStatus, STATUS_REFRESH_MS);
    return () => clearInterval(timer);
  }, [refreshStatus]);

  if (!settings) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
        {loadError ? (
          <span className="text-red-600">{loadError}</span>
        ) : (
          <>
            <Loader2 size={16} className="animate-spin" /> Loading…
          </>
        )}
      </div>
    );
  }

  const { http, mqtt, storage } = settings;
  const setHttp = (patch: Partial<typeof http>) => setSettings((s) => s && { ...s, http: { ...s.http, ...patch } });
  const setMqtt = (patch: Partial<typeof mqtt>) => setSettings((s) => s && { ...s, mqtt: { ...s.mqtt, ...patch } });
  const setStorage = (patch: Partial<typeof storage>) =>
    setSettings((s) => s && { ...s, storage: { ...s.storage, ...patch } });
  const intOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      apply(await gatewayApi.saveSettings(settings!));
      setMessage({ text: "Gateway settings saved and applied.", tone: "ok" });
      refreshStatus();
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : "Failed to save",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function regenerate() {
    if (!window.confirm("Create a new API key? Gateways using the current key will be refused until updated.")) return;
    try {
      const view = await gatewayApi.regenerateApiKey();
      setHttp({ apiKey: view.http.apiKey });
      setShowKey(true);
      setMessage({
        text: "New API key created. Update it in every gateway.",
        tone: "ok",
      });
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : "Failed to create a key",
        tone: "error",
      });
    }
  }

  const copy = (text: string) => navigator.clipboard?.writeText(text).catch(() => {});
  // A result only applies while the broker settings it was run with are unchanged.
  const testKey = JSON.stringify([mqtt.brokerUrl, mqtt.username, mqtt.password, mqtt.clientId, mqtt.topic, mqtt.qos]);
  const shownTest = testResult?.key === testKey ? testResult : null;

  async function testConnection() {
    setTesting(true);
    try {
      setTestResult({ ...(await gatewayApi.testMqtt(mqtt)), key: testKey });
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : "Test failed", ms: 0, key: testKey });
    } finally {
      setTesting(false);
    }
  }
  const brokerAddress = mqtt.mode === "builtin" ? `mqtt://${host}:${mqtt.builtinPort}` : mqtt.brokerUrl;
  const publishTopic = machineTopic(mqtt.topic, "<machine No>");

  return (
    <div className="max-w-5xl space-y-4">
      <StatusPanel status={status} previous={statuses.previous} />

      <div role="tablist" className="flex gap-1 border-b border-slate-200">
        {(
          [
            ["settings", "Settings"],
            ["debug", "Console & Test"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium ${
              tab === key ? "border-(--brand) text-(--brand)" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "debug" ? (
        <GatewayDebug status={status} topicFilter={mqtt.topic} qos={mqtt.qos} host={host} apiKey={http.apiKey} />
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Section
            title="HTTP API"
            description="Gateways POST one message per machine (or per gateway) with many tag values."
            aside={
              <Toggle label="HTTP ingest enabled" checked={http.enabled} onChange={(v) => setHttp({ enabled: v })} />
            }
          >
            <div className="grid gap-4 md:grid-cols-[200px_1fr]">
              <Field
                label="Dedicated ingest port"
                htmlFor="httpPort"
                hint="Optional, e.g. 4100. Keeps gateway traffic off the dashboard API. Empty = main API port only."
              >
                <input
                  id="httpPort"
                  type="number"
                  min={1024}
                  max={65535}
                  value={http.port ?? ""}
                  onChange={(e) => setHttp({ port: intOrNull(e.target.value) })}
                  disabled={!http.enabled}
                  placeholder="None"
                  className={inputCls}
                />
              </Field>
              <Field
                label="API key"
                htmlFor="apiKey"
                hint="Header x-gateway-key: <key>  (or Authorization: Bearer <key>)"
              >
                <div className="flex gap-2">
                  <input
                    id="apiKey"
                    readOnly
                    type={showKey ? "text" : "password"}
                    value={http.apiKey}
                    className={`${inputCls} font-mono text-[13px]`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className={buttonStyles.secondary}
                    aria-label={showKey ? "Hide API key" : "Show API key"}
                  >
                    {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => copy(http.apiKey)}
                    className={buttonStyles.secondary}
                    aria-label="Copy API key"
                  >
                    <Copy size={16} />
                  </button>
                  <button type="button" onClick={regenerate} className={buttonStyles.secondary}>
                    <RefreshCw size={16} />
                    New key
                  </button>
                </div>
              </Field>
            </div>
            <div className="space-y-1 rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
              <p>
                POST http://{host}:{status?.apiPort ?? 4000}
                /api/tag-values/batch
              </p>
              {http.port && (
                <p>
                  POST http://{host}:{http.port}/ingest
                </p>
              )}
            </div>
          </Section>

          <Section
            title="MQTT"
            description="Gateways publish to a broker; the backend subscribes. Best for many machines: one open connection, no request per reading."
            aside={<Toggle label="MQTT enabled" checked={mqtt.enabled} onChange={(v) => setMqtt({ enabled: v })} />}
          >
            <fieldset disabled={!mqtt.enabled} className="space-y-4 disabled:opacity-60">
              <div className="flex flex-wrap gap-4 text-sm text-slate-700">
                {(
                  [
                    ["external", "External broker", "Mosquitto, EMQX, … · MQTT 3.1.1 and 5.0 (recommended)"],
                    ["builtin", "Built-in broker", "The backend runs the broker itself · MQTT 3.1.1 only"],
                  ] as const
                ).map(([value, label, hint]) => (
                  <label key={value} className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="mqttMode"
                      checked={mqtt.mode === value}
                      onChange={() => setMqtt({ mode: value })}
                      className="mt-0.5 size-4 accent-(--brand)"
                    />
                    <span>
                      <span className="font-medium">{label}</span>
                      <span className="block text-xs text-slate-500">{hint}</span>
                    </span>
                  </label>
                ))}
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {mqtt.mode === "builtin" ? (
                  <Field label="Broker port" htmlFor="builtinPort" hint="Must not be used by another broker.">
                    <input
                      id="builtinPort"
                      type="number"
                      min={1024}
                      max={65535}
                      value={mqtt.builtinPort}
                      onChange={(e) => setMqtt({ builtinPort: Number(e.target.value) })}
                      className={inputCls}
                    />
                  </Field>
                ) : (
                  <>
                    <Field label="Broker URL" htmlFor="brokerUrl" hint="mqtt://host:1883 or mqtts://host:8883">
                      <input
                        id="brokerUrl"
                        value={mqtt.brokerUrl}
                        onChange={(e) => setMqtt({ brokerUrl: e.target.value })}
                        className={`${inputCls} font-mono text-[13px]`}
                      />
                    </Field>
                    <Field label="Client ID" htmlFor="clientId" hint="Unique per backend; keeps queued QoS 1 messages.">
                      <input
                        id="clientId"
                        value={mqtt.clientId}
                        onChange={(e) => setMqtt({ clientId: e.target.value })}
                        className={`${inputCls} font-mono text-[13px]`}
                      />
                    </Field>
                  </>
                )}
                <Field label="Topic filter" htmlFor="topic" hint='"#" = all levels below, "+" = one level'>
                  <input
                    id="topic"
                    value={mqtt.topic}
                    onChange={(e) => setMqtt({ topic: e.target.value })}
                    className={`${inputCls} font-mono text-[13px]`}
                  />
                </Field>
                <Field label="QoS" htmlFor="qos" hint="1 = delivered at least once (recommended)">
                  <select
                    id="qos"
                    value={mqtt.qos}
                    onChange={(e) => setMqtt({ qos: Number(e.target.value) as 0 | 1 | 2 })}
                    className={inputCls}
                  >
                    <option value={0}>0 – at most once</option>
                    <option value={1}>1 – at least once</option>
                    <option value={2}>2 – exactly once</option>
                  </select>
                </Field>
                <Field
                  label="Username"
                  htmlFor="mqttUser"
                  hint={mqtt.mode === "builtin" ? "Gateways must log in with this; empty = no login." : undefined}
                >
                  <input
                    id="mqttUser"
                    value={mqtt.username}
                    onChange={(e) => setMqtt({ username: e.target.value })}
                    autoComplete="off"
                    className={inputCls}
                  />
                </Field>
                <Field label="Password" htmlFor="mqttPass">
                  <input
                    id="mqttPass"
                    type="password"
                    value={mqtt.password ?? ""}
                    onChange={(e) => setMqtt({ password: e.target.value })}
                    placeholder={hasPassword ? "•••••• (unchanged)" : "None"}
                    autoComplete="new-password"
                    className={inputCls}
                  />
                </Field>
              </div>
              <div className="space-y-1 rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
                <p>Connect gateways / MQTTX to: {brokerAddress}</p>
                <p>One topic per machine: {publishTopic}</p>
              </div>
            </fieldset>
            {mqtt.mode === "external" && (
              // Outside the fieldset: the broker can be tested before MQTT is enabled.
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={testConnection} disabled={testing} className={buttonStyles.secondary}>
                  {testing ? <Loader2 size={16} className="animate-spin" /> : <PlugZap size={16} />}
                  {testing ? "Connecting…" : "Test connection"}
                </button>
                {shownTest ? (
                  <p
                    className={`flex items-start gap-1.5 text-sm ${shownTest.ok ? "text-emerald-700" : "text-red-600"}`}
                    role="status"
                  >
                    {shownTest.ok ? (
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                    ) : (
                      <XCircle size={16} className="mt-0.5 shrink-0" />
                    )}
                    <span>
                      {shownTest.message}
                      {shownTest.ms > 0 && <span className="text-slate-400"> · {shownTest.ms} ms</span>}
                      {shownTest.ok && !mqtt.enabled && (
                        <span className="block text-slate-500">Enable MQTT and Save & Apply to start receiving.</span>
                      )}
                    </span>
                  </p>
                ) : (
                  <p className="text-xs text-slate-500">Tries the values above without saving them.</p>
                )}
              </div>
            )}
          </Section>

          <Section
            title="Data storage"
            description="Current values are kept in memory for the dashboards; the history table only gets what is needed."
          >
            <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-700">Store only when the value changes</p>
                <p className="text-xs text-slate-500">
                  Gateways may send every second; unchanged values are not written again. Recommended.
                </p>
              </div>
              <Toggle
                label="Store only changes"
                checked={storage.onChangeOnly}
                onChange={(v) => setStorage({ onChangeOnly: v })}
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-slate-700">Reading time</p>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-700">
                {(
                  [
                    ["server", "When the backend receives it", "Recommended: correct even when the gateway clock is off."],
                    [
                      "gateway",
                      'The message "ts"',
                      "For gateways that buffer readings while offline. A ts that does not move forward uses the server time.",
                    ],
                  ] as const
                ).map(([value, label, hint]) => (
                  <label key={value} className="flex max-w-sm items-start gap-2">
                    <input
                      type="radio"
                      name="timestampSource"
                      checked={storage.timestampSource === value}
                      onChange={() => setStorage({ timestampSource: value })}
                      className="mt-0.5 size-4 accent-(--brand)"
                    />
                    <span>
                      <span className="font-medium">{label}</span>
                      <span className="block text-xs text-slate-500">{hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Monitoring tags: store at most every (seconds)"
                htmlFor="monInterval"
                hint="Speed, temperature, … 0 = every change. Status, output, reject and product are always stored on change."
              >
                <input
                  id="monInterval"
                  type="number"
                  min={0}
                  max={3600}
                  value={storage.monitoringIntervalSec}
                  onChange={(e) =>
                    setStorage({
                      monitoringIntervalSec: Number(e.target.value),
                    })
                  }
                  className={inputCls}
                />
              </Field>
              <Field
                label="Write to database every (ms)"
                htmlFor="flushInterval"
                hint="Readings are written together in one batch. 1000 is a good default."
              >
                <input
                  id="flushInterval"
                  type="number"
                  min={200}
                  max={60000}
                  step={100}
                  value={storage.flushIntervalMs}
                  onChange={(e) => setStorage({ flushIntervalMs: Number(e.target.value) })}
                  className={inputCls}
                />
              </Field>
            </div>
          </Section>

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={saving} className={buttonStyles.primary}>
              {saving && <Loader2 size={16} className="animate-spin" />}
              Save & Apply
            </button>
            {message && (
              <p className={`text-sm ${message.tone === "ok" ? "text-emerald-700" : "text-red-600"}`}>{message.text}</p>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

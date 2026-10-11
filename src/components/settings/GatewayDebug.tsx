"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Loader2, Pause, Play, Send, Trash2 } from "lucide-react";
import { buttonStyles } from "@/components/ui/Modal";
import { gatewayApi, machineTopic } from "@/lib/gateway-api";
import { machineApi } from "@/lib/machine-api";
import { skuApi } from "@/lib/sku-api";
import { tagApi } from "@/lib/tag-api";
import type { GatewayLogEntry, GatewayStatus } from "@/types/gateway";
import type { MachineRegistration } from "@/types/machine";

const inputCls =
  "h-10 w-full rounded-lg border border-slate-200 bg-surface px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400";
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const POLL_MS = 1000;
const MAX_LINES = 500;

const copy = (text: string) => navigator.clipboard?.writeText(text).catch(() => {});

/** A tag value as JSON: numbers stay numbers, other text is quoted. */
const jsonValue = (v: string) => (v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : v);

/** Every tag of the machine with its current value, or a placeholder when none was received yet. */
function samplePayload(m: MachineRegistration, latest: Map<string, string>, defaultSku: string) {
  const values: Record<string, string | number> = {};
  const put = (tag: string, fallback: string) => (values[tag] = jsonValue(latest.get(tag) ?? fallback));
  put(m.tagStatus, "1");
  put(m.tagOutput, "0");
  put(m.tagReject, "0");
  put(m.tagProduct, defaultSku);
  // Adaptive machines take the unit from the tag name ("Temp Limit,C").
  m.monitoringTags.forEach((t) => {
    const value = jsonValue(latest.get(t.tagName) ?? "0");
    values[m.realtimeMode === "adaptive" && t.unit ? `${t.tagName},${t.unit}` : t.tagName] = value;
  });
  return JSON.stringify({ ts: new Date().toISOString(), values }, null, 2);
}

interface DebugProps {
  status: GatewayStatus | null;
  /** Saved MQTT topic filter, e.g. "urc/oee/#". */
  topicFilter: string;
  /** Saved QoS, used as the publish default. */
  qos: 0 | 1 | 2;
  host: string;
  apiKey: string;
}

/** Sample message per machine, test publish, and the live console of gateway traffic. */
export default function GatewayDebug({ status, topicFilter, qos, host, apiKey }: DebugProps) {
  const [machines, setMachines] = useState<MachineRegistration[]>([]);
  const [latest, setLatest] = useState<Map<string, string>>(new Map());
  const [defaultSku, setDefaultSku] = useState("SKU-001");
  const [machineId, setMachineId] = useState("");
  const [publish, setPublish] = useState({ topic: "", payload: "", qos, retain: false });
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState<{ text: string; tone: "ok" | "error" } | null>(null);

  useEffect(() => {
    Promise.all([machineApi.list(), tagApi.latest().catch(() => []), skuApi.list().catch(() => [])]).then(
      ([m, readings, skus]) => {
        setMachines(m);
        setMachineId((id) => id || m[0]?.id || "");
        setLatest(new Map(readings.map((r) => [r.tagName, r.value])));
        if (skus[0]) setDefaultSku(skus[0].skuId);
      }
    );
  }, []);

  const machine = machines.find((m) => m.id === machineId);
  const topic = machine ? machineTopic(topicFilter, machine.machineNo) : "";
  const payload = machine ? samplePayload(machine, latest, defaultSku) : "";
  const curl = machine
    ? `curl -X POST http://${host}:${status?.apiPort ?? 4000}/api/tag-values/batch ^\n  -H "x-gateway-key: ${apiKey}" ^\n  -H "content-type: application/json" ^\n  -d "${payload.replace(/\s+/g, " ").replace(/"/g, '\\"')}"`
    : "";
  const mqttRunning = !!status?.mqtt.enabled && status.mqtt.connected;

  async function handlePublish(e: React.FormEvent) {
    e.preventDefault();
    setPublishing(true);
    setPublishMsg(null);
    try {
      await gatewayApi.publish(publish);
      setPublishMsg({ text: "Published. See the console below for how it was received.", tone: "ok" });
    } catch (err) {
      setPublishMsg({ text: err instanceof Error ? err.message : "Publish failed", tone: "error" });
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-xl border border-slate-200 bg-surface px-5 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900">Sample message</h3>
            <p className="text-sm text-slate-500">
              One topic per machine. The sample holds every tag registered on the machine, with its current value.
            </p>
          </div>
          <select
            value={machineId}
            onChange={(e) => setMachineId(e.target.value)}
            aria-label="Machine"
            className="h-10 min-w-48 rounded-lg border border-slate-200 bg-surface px-3 text-sm focus:border-blue-400 focus:outline-none"
          >
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.machineNo} – {m.machineName}
              </option>
            ))}
          </select>
        </div>

        {machine && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500">MQTT topic</p>
              <div className="flex gap-2">
                <code className="flex h-10 flex-1 items-center rounded-lg bg-slate-50 px-3 text-sm text-slate-800">{topic}</code>
                <button type="button" onClick={() => copy(topic)} className={buttonStyles.secondary} aria-label="Copy topic">
                  <Copy size={16} />
                </button>
              </div>
              <p className="text-xs font-medium text-slate-500">Payload (MQTT message, or HTTP body)</p>
              <pre className="max-h-72 overflow-auto theme-fixed rounded-lg bg-slate-900 px-3 py-2 text-xs text-slate-100">{payload}</pre>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => copy(payload)} className={buttonStyles.secondary}>
                  <Copy size={16} />
                  Copy payload
                </button>
                <button
                  type="button"
                  onClick={() => setPublish((p) => ({ ...p, topic, payload }))}
                  className={buttonStyles.secondary}
                >
                  <Send size={16} />
                  Use in test publish
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500">HTTP (Windows command prompt)</p>
              <pre className="max-h-40 overflow-auto theme-fixed rounded-lg bg-slate-900 px-3 py-2 text-xs whitespace-pre-wrap break-all text-slate-100">
                {curl}
              </pre>
              <button type="button" onClick={() => copy(curl)} className={buttonStyles.secondary}>
                <Copy size={16} />
                Copy command
              </button>
              <ul className="list-disc space-y-1 pl-5 pt-2 text-xs text-slate-600">
                <li>Tag names must match Machine Management exactly; unknown tags are ignored and shown in the console.</li>
                <li>
                  <code>ts</code> is optional (ISO text or epoch ms); without it the server time is used.
                </li>
                <li>Send on change, or every 1–5 s per machine. Output and reject should be cumulative counters.</li>
                {machine.realtimeMode === "adaptive" && (
                  <li>
                    Adaptive realtime tags: every other tag in the message is shown on the machine page (memory only).
                    Add a unit after a comma: <code>{'"Temp Limit,C": 45'}</code>; without one only the value is shown.
                  </li>
                )}
              </ul>
            </div>
          </div>
        )}
      </section>

      <form onSubmit={handlePublish} className="space-y-3 rounded-xl border border-slate-200 bg-surface px-5 py-4">
        <div>
          <h3 className="font-semibold text-slate-900">Test publish (MQTT)</h3>
          <p className="text-sm text-slate-500">
            Sends a message through the backend&apos;s MQTT connection; it is received like a gateway message, so the
            values are applied. {!mqttRunning && <span className="text-amber-700">MQTT is not running.</span>}
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_140px_auto]">
          <input
            value={publish.topic}
            onChange={(e) => setPublish((p) => ({ ...p, topic: e.target.value }))}
            placeholder="Topic, e.g. urc/oee/1A"
            aria-label="Publish topic"
            className={`${inputCls} font-mono text-[13px]`}
          />
          <select
            value={publish.qos}
            onChange={(e) => setPublish((p) => ({ ...p, qos: Number(e.target.value) as 0 | 1 | 2 }))}
            aria-label="Publish QoS"
            className={inputCls}
          >
            <option value={0}>QoS 0</option>
            <option value={1}>QoS 1</option>
            <option value={2}>QoS 2</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={publish.retain}
              onChange={(e) => setPublish((p) => ({ ...p, retain: e.target.checked }))}
              className="size-4 accent-(--brand)"
            />
            Retain
          </label>
        </div>
        <textarea
          value={publish.payload}
          onChange={(e) => setPublish((p) => ({ ...p, payload: e.target.value }))}
          placeholder='{"values": {"TAG": 1}}'
          aria-label="Publish payload"
          rows={6}
          className="w-full rounded-lg border border-slate-200 bg-surface px-3 py-2 font-mono text-xs text-slate-800 focus:border-blue-400 focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={publishing || !mqttRunning || !publish.topic.trim()} className={buttonStyles.primary}>
            {publishing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Publish
          </button>
          {publishMsg && (
            <p className={`text-sm ${publishMsg.tone === "ok" ? "text-emerald-700" : "text-red-600"}`}>{publishMsg.text}</p>
          )}
        </div>
      </form>

      <GatewayConsole />
    </div>
  );
}

const KIND_STYLE: Record<GatewayLogEntry["kind"], { label: string; cls: string }> = {
  in: { label: "IN", cls: "bg-emerald-500/20 text-emerald-300" },
  out: { label: "OUT", cls: "bg-sky-500/20 text-sky-300" },
  event: { label: "EVENT", cls: "bg-slate-500/30 text-slate-300" },
};

function resultText(e: GatewayLogEntry) {
  if (e.message && !e.result) return e.message;
  if (!e.result) return "";
  const { accepted, ignored, invalid } = e.result;
  const parts = [e.adaptive ? `${accepted} adaptive tag${accepted === 1 ? "" : "s"}` : `${accepted} accepted`];
  if (ignored) parts.push(`${ignored} unknown tag${ignored === 1 ? "" : "s"}`);
  if (invalid) parts.push(`${invalid} invalid`);
  if (e.machines?.length) parts.push(`machine ${e.machines.join(", ")}`);
  if (e.message) parts.push(e.message);
  return parts.join(" · ");
}

/** Live list of gateway traffic and connection events (polled from the backend). */
function GatewayConsole() {
  const [lines, setLines] = useState<GatewayLogEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<Set<number>>(new Set());
  const after = useRef(0);
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    if (paused) return;
    let alive = true;
    const tick = () =>
      gatewayApi
        .messages(after.current)
        .then(({ entries, last }) => {
          if (!alive) return;
          // The log was cleared or the backend restarted: start over.
          if (last < after.current) after.current = 0;
          if (!entries.length) return;
          after.current = entries[entries.length - 1].seq;
          setLines((l) => [...l, ...entries].slice(-MAX_LINES));
        })
        .catch(() => {});
    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [paused]);

  // Keep the newest line in view unless the user scrolled up.
  useEffect(() => {
    if (stick.current && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [lines]);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return lines;
    return lines.filter((e) =>
      [e.topic, e.client, e.payload, e.message, e.machines?.join(" ")].some((s) => s?.toLowerCase().includes(q))
    );
  }, [lines, filter]);

  async function clear() {
    await gatewayApi.clearMessages().catch(() => {});
    setLines([]);
    setOpen(new Set());
  }

  const toggle = (seq: number) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(seq)) next.delete(seq);
      else next.add(seq);
      return next;
    });

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-surface px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">Console</h3>
          <p className="text-sm text-slate-500">
            Messages received (HTTP and MQTT), test publishes and connections. Click a line to see the full payload.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter topic, client, tag…"
            aria-label="Filter console"
            className="h-9 w-56 rounded-lg border border-slate-200 bg-surface px-3 text-sm focus:border-blue-400 focus:outline-none"
          />
          <button type="button" onClick={() => setPaused((p) => !p)} className={buttonStyles.secondary}>
            {paused ? <Play size={16} /> : <Pause size={16} />}
            {paused ? "Resume" : "Pause"}
          </button>
          <button type="button" onClick={clear} className={buttonStyles.secondary}>
            <Trash2 size={16} />
            Clear
          </button>
        </div>
      </div>

      <div
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="h-96 overflow-y-auto theme-fixed rounded-lg bg-slate-950 p-2 font-mono text-xs text-slate-200"
        role="log"
        aria-live="polite"
      >
        {shown.length === 0 ? (
          <p className="p-2 text-slate-500">
            {lines.length ? "No lines match the filter." : "Waiting for messages… Connect a client or publish a test message."}
          </p>
        ) : (
          shown.map((e) => {
            const kind = KIND_STYLE[e.kind];
            const expanded = open.has(e.seq);
            return (
              <div
                key={e.seq}
                onClick={() => e.payload && toggle(e.seq)}
                className={`rounded px-2 py-1 ${e.payload ? "cursor-pointer hover:bg-white/5" : ""}`}
              >
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-slate-500">{timeFmt.format(new Date(e.at))}</span>
                  <span className={`rounded px-1.5 text-[10px] font-semibold ${kind.cls}`}>{kind.label}</span>
                  <span className="text-slate-400 uppercase">{e.channel}</span>
                  {e.topic && <span className="text-amber-200">{e.topic}</span>}
                  {e.client && <span className="text-slate-400">[{e.client}]</span>}
                  <span className={e.error ? "text-red-400" : "text-emerald-300"}>{resultText(e)}</span>
                </div>
                {e.payload && (
                  <pre
                    className={`mt-0.5 text-slate-400 ${expanded ? "whitespace-pre-wrap break-all" : "truncate"}`}
                  >
                    {expanded ? prettyJson(e.payload) : e.payload}
                  </pre>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function prettyJson(text: string) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

import type { MachineSpeed } from "@/types/oee";
import { SPEED_STYLES, speedText, speedUnit } from "@/components/dashboard/SpeedIndicator";

// Speed indicators of the plant layout labels, separate from the status lamp: a small LED, or "Speed" with
// the value and signal bars filled by speed / spec. Hex colours because they also drive the 3D marks.

export const SPEED_COLORS: Record<MachineSpeed["state"], string> = {
  ok: "#22c55e",
  low: "#f59e0b",
  idle: "#94a3b8",
  unknown: "#94a3b8",
};

export type SpeedStyle = "led" | "signal";

const BARS = 4;

const tip = (speed: MachineSpeed, outputUnit: string) =>
  `Speed ${speedText(speed.value)} / ${speedText(speed.spec)} ${speedUnit(outputUnit)} · ${SPEED_STYLES[speed.state].label}`;

/** Bars lit by speed / spec (all at or above the spec); none while not compared. */
function litBars(speed: MachineSpeed) {
  if ((speed.state !== "ok" && speed.state !== "low") || speed.value === null || !speed.spec) return 0;
  return Math.max(1, Math.min(BARS, Math.ceil((speed.value / speed.spec) * BARS)));
}

/** Small glowing LED with "SPD". */
export function SpeedLed({ speed, outputUnit }: { speed: MachineSpeed; outputUnit: string }) {
  const color = SPEED_COLORS[speed.state];
  const lit = speed.state === "ok" || speed.state === "low";
  return (
    <span title={tip(speed, outputUnit)} className="inline-flex items-center gap-1 text-[9px] font-semibold tracking-wide text-slate-500">
      <span
        className={`size-2 rounded-full ${speed.state === "low" ? "animate-pulse" : ""}`}
        style={{ background: color, boxShadow: lit ? `0 0 6px ${color}, 0 0 2px ${color}` : undefined, opacity: lit ? 1 : 0.6 }}
      />
      SPD
    </span>
  );
}

/** "Speed", the value / spec and signal bars. */
export function SpeedSignalBars({ speed, outputUnit }: { speed: MachineSpeed; outputUnit: string }) {
  const color = SPEED_COLORS[speed.state];
  const lit = litBars(speed);
  return (
    <span title={tip(speed, outputUnit)} className="inline-flex items-center gap-1.5 text-[10px] leading-none">
      <span className="font-medium text-slate-500">Speed</span>
      <span className="font-bold tabular-nums" style={{ color: speed.state === "ok" || speed.state === "low" ? color : undefined }}>
        {speedText(speed.value)}
        <span className="font-normal text-slate-400">/{speedText(speed.spec)}</span>
      </span>
      <span className="flex h-2.5 items-end gap-px" aria-hidden>
        {Array.from({ length: BARS }, (_, i) => (
          <span
            key={i}
            className="w-[3px] rounded-[1px]"
            style={{ height: `${((i + 1) / BARS) * 100}%`, background: i < lit ? color : "var(--color-slate-200)" }}
          />
        ))}
      </span>
    </span>
  );
}

export function SpeedIndicator({ style, speed, outputUnit }: { style: SpeedStyle; speed: MachineSpeed; outputUnit: string }) {
  return style === "led" ? <SpeedLed speed={speed} outputUnit={outputUnit} /> : <SpeedSignalBars speed={speed} outputUnit={outputUnit} />;
}

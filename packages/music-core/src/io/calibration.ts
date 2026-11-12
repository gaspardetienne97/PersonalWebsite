// Tap-along latency estimate (hardware notes §7, scoring rules §13).
// Positive offset = the input arrives late; the router subtracts it once.

export const CALIBRATION = {
  bpm: 90,
  clicks: 20,
  warmup: 4,
  minAnswered: 14,
  windowMs: 200,
  maxIqrMs: 30,
  maxOffsetMs: 500,
} as const;

export type CalibrationResult =
  | { ok: true; offsetMs: number; iqrMs: number; answered: number }
  | {
      ok: false;
      reason: "too-few-clicks" | "missed-clicks" | "too-loose" | "out-of-range";
      message: string;
      answered?: number;
      iqrMs?: number;
    };

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Exclusive method: the median splits the halves and belongs to neither. */
function iqr(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const half = s.length >> 1;
  return median(s.slice(s.length - half)) - median(s.slice(0, half));
}

/** Each click claims the nearest tap no earlier click has taken, within `reach` of `centre`. */
function claim(clicks: number[], taps: number[], centre: number, reach: number): number[] {
  const taken = new Set<number>();
  const diffs: number[] = [];
  for (const c of clicks) {
    let best = -1;
    for (let i = 0; i < taps.length; i++) {
      if (taken.has(i) || Math.abs(taps[i] - c - centre) > reach) continue;
      if (best < 0 || Math.abs(taps[i] - c - centre) < Math.abs(taps[best] - c - centre)) best = i;
    }
    if (best >= 0) {
      taken.add(best);
      diffs.push(taps[best] - c);
    }
  }
  return diffs;
}

export function estimateOffset(
  clickTimesMs: number[],
  tapTimesMs: number[],
  bpm = CALIBRATION.bpm,
): CalibrationResult {
  const C = CALIBRATION;
  if (clickTimesMs.length < C.clicks)
    return {
      ok: false,
      reason: "too-few-clicks",
      message: `The run stopped early. Let all ${C.clicks} clicks play, then tap along again.`,
    };
  const scored = clickTimesMs.slice(C.warmup, C.clicks);
  const taps = [...tapTimesMs].sort((a, b) => a - b);
  // A periodic grid cannot tell a tap later than half a beat from an early one.
  const coarse = claim(scored, taps, 0, 60000 / bpm / 2);
  const diffs = coarse.length ? claim(scored, taps, median(coarse), C.windowMs) : [];
  const answered = diffs.length;
  if (answered < C.minAnswered)
    return {
      ok: false,
      reason: "missed-clicks",
      answered,
      message: `Tap once on every click. ${answered} of the last ${scored.length} clicks had a tap; ${C.minAnswered} are needed.`,
    };
  const offsetMs = Math.round(median(diffs));
  const iqrMs = iqr(diffs);
  if (iqrMs > C.maxIqrMs)
    return {
      ok: false,
      reason: "too-loose",
      answered,
      iqrMs,
      message: `Your taps were too spread out to trust (they varied by ${Math.round(iqrMs)} ms; ${C.maxIqrMs} ms or less is needed). Try again with one steady tap per click.`,
    };
  if (Math.abs(offsetMs) > C.maxOffsetMs)
    return {
      ok: false,
      reason: "out-of-range",
      answered,
      iqrMs,
      message: `That came out at ${offsetMs} ms, beyond the ${C.maxOffsetMs} ms this can correct. Check the device and try again.`,
    };
  return { ok: true, offsetMs, iqrMs, answered };
}

// ---------------------------------------------------------------------------
// Where an offset applies. The tap-along measures input and output together,
// so a saved offset belongs to one input and output pair.

/** Offsets by pair: `"<input>|<output>"` to milliseconds. */
export type CalibrationMap = Record<string, number>;

/** Offsets saved before pairs existed: one per input, whatever the output was. */
export interface LegacyOffsets {
  audioMs: number;
  midiMs: number;
  deviceMs: Record<string, number>;
}

export const AUDIO_INPUT = "audio";
export const MIDI_INPUT = "midi";
export const deviceInput = (deviceId: string) => `midi:${deviceId}`;
export const pairKey = (input: string, output: string) => `${input}|${output}`;

/** Output latency at or above this reads as a wireless output (Bluetooth, AirPlay). */
export const DELAYED_OUTPUT_MS = 80;

/**
 * The names an output answers to, most specific first: the sink the app was
 * pointed at, the system default device by its label (known once the browser
 * shares device labels; ids and group ids change between sessions), then a
 * latency class.
 * ponytail: the class cannot tell two wired or two wireless outputs apart; it
 * is the fallback when the browser names no device.
 */
export function outputKeys(o: {
  sinkId?: string;
  device?: string;
  latencyMs?: number | null;
}): string[] {
  const keys: string[] = [];
  if (o.sinkId) keys.push(`sink:${o.sinkId}`);
  const device = o.device?.replace(/^Default - /, "").trim();
  if (device) keys.push(`dev:${device}`);
  keys.push(
    o.latencyMs == null || !(o.latencyMs > 0)
      ? "out:default"
      : o.latencyMs >= DELAYED_OUTPUT_MS
        ? "out:delayed"
        : "out:direct",
  );
  return keys;
}

/** The saved offset for an input on the current output; undefined when the pair was never calibrated. */
export function lookupOffset(
  map: CalibrationMap,
  input: string,
  outputs: readonly string[],
): number | undefined {
  for (const out of outputs) {
    const v = map[pairKey(input, out)];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
}

/** A MIDI device counts as calibrated through its own pair or the all-devices one. */
export function isCalibrated(
  map: CalibrationMap,
  input: string,
  outputs: readonly string[],
): boolean {
  if (lookupOffset(map, input, outputs) !== undefined) return true;
  return input.startsWith("midi:") && lookupOffset(map, MIDI_INPUT, outputs) !== undefined;
}

/**
 * Move offsets saved per input onto the current output, so they keep applying
 * where they were measured. A pair already saved for this output wins; a zero
 * microphone or all-devices offset was the old "none" and moves nothing.
 */
export function migrateOffsets(
  map: CalibrationMap,
  legacy: LegacyOffsets,
  outputs: readonly string[],
): CalibrationMap {
  if (!outputs.length) return map;
  const next = { ...map };
  const move = (input: string, ms: number | undefined) => {
    if (typeof ms !== "number" || !Number.isFinite(ms)) return;
    if (lookupOffset(next, input, outputs) !== undefined) return;
    next[pairKey(input, outputs[0])] = Math.round(ms);
  };
  move(AUDIO_INPUT, legacy.audioMs || undefined);
  move(MIDI_INPUT, legacy.midiMs || undefined);
  // A device's own offset was saved on purpose, so its zero moves too (it overrides the MIDI one).
  for (const [id, ms] of Object.entries(legacy.deviceMs)) move(deviceInput(id), ms);
  return next;
}

/**
 * What the router subtracts on this output. Offsets not yet moved to a pair
 * (the output is not known before audio starts) still apply.
 */
export function routerOffsets(
  map: CalibrationMap,
  legacy: LegacyOffsets,
  outputs: readonly string[],
): LegacyOffsets {
  const deviceMs = { ...legacy.deviceMs };
  for (const key of Object.keys(map)) {
    const m = /^midi:(.+)\|/.exec(key);
    if (!m) continue;
    const v = lookupOffset(map, deviceInput(m[1]), outputs);
    if (v !== undefined) deviceMs[m[1]] = v;
  }
  return {
    audioMs: lookupOffset(map, AUDIO_INPUT, outputs) ?? legacy.audioMs,
    midiMs: lookupOffset(map, MIDI_INPUT, outputs) ?? legacy.midiMs,
    deviceMs,
  };
}

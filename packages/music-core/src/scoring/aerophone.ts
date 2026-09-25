// Aerophone breath technique (hardware notes 2, catalog 4.9). Breath is CC 2.
import type { ControlEvent, Metric, NoteEvent } from "../types";
import { clamp01 } from "../theory/notes";
import { blend, type Graded, mean, noteOns, stdev } from "./grade";

/** Live traces keep this many samples. */
export const TRACE_SAMPLES = 64;
export const pushTrace = (trace: readonly number[], value: number, max = TRACE_SAMPLES) =>
  [...trace, value].slice(-max);

export const breathSamples = (controls: readonly ControlEvent[]) =>
  controls.filter((c) => c.kind === "cc" && c.controller === 2).sort((a, b) => a.at - b.at);

/** clamp01(1 - 4 x stdev), needing at least two samples. The x4 is the tuning knob. */
export const steadiness = (values: readonly number[]) =>
  values.length < 2 ? 0 : clamp01(1 - 4 * stdev(values));

interface Window {
  targetMidi: number;
  startAt: number;
  durationMs: number;
  /** When the run ended (a note still sounding is cut here). */
  endAt: number;
  notes: readonly NoteEvent[];
  breath: readonly ControlEvent[];
}

/** Sounding spans: a note ends at its note-off or at the next note-on (monophonic). */
function spans(notes: readonly NoteEvent[], endAt: number) {
  const sorted = [...notes].sort((a, b) => a.at - b.at);
  const out: { midi: number; on: number; off: number; released: boolean }[] = [];
  for (const e of sorted) {
    const open = out.find((s) => s.off === Infinity);
    if (e.kind === "noteon") {
      if (open) open.off = e.at;
      out.push({ midi: e.midi, on: e.at, off: Infinity, released: false });
    } else if (open && open.midi === e.midi) {
      open.off = e.at;
      open.released = true;
    }
  }
  for (const s of out) if (s.off === Infinity) s.off = endAt;
  return out;
}

/** The longest span inside the window: its pitch, the progress it made, and the breath under it. */
function hold(w: Window) {
  const end = w.startAt + w.durationMs;
  const clipped = spans(w.notes, w.endAt)
    .map((s) => ({ ...s, on: Math.max(s.on, w.startAt), off: Math.min(s.off, end) }))
    .filter((s) => s.off > s.on)
    .sort((a, b) => b.off - b.on - (a.off - a.on));
  const best = clipped[0];
  const pitchOk = !!best && best.midi === w.targetMidi;
  const progress = pitchOk ? clamp01((best.off - best.on) / w.durationMs) : 0;
  const all = breathSamples(w.breath);
  const under = best
    ? all.filter((b) => b.at >= best.on && b.at <= best.off).map((b) => b.value)
    : [];
  return {
    pitchOk,
    progress,
    // No breath at all (on-screen chart) is not measured; too few samples under the note is a 0.
    steadiness: all.length ? steadiness(under) : null,
    trace: all.slice(-TRACE_SAMPLES).map((b) => b.value),
  };
}

export interface BreathResult extends Graded {
  pitchCorrect: boolean;
  progress: number;
  steadiness: number | null;
}

const breathMetric = (steady: number | null, trace: number[], targetCurve?: number[]): Metric[] =>
  steady === null ? [] : [{ kind: "breath", steadiness: steady, actualCurve: trace, targetCurve }];

/** Long tone: steadiness x 0.7 + pitch 0.2 + progress x 0.1; correct on a full hold, steadiness 0.8, right pitch. */
export function gradeLongTone(w: Window): BreathResult {
  const h = hold(w);
  const score = blend([
    [0.7, h.steadiness],
    [0.2, h.pitchOk ? 1 : 0],
    [0.1, h.progress],
  ]);
  return {
    score,
    correct: h.pitchOk && h.progress >= 1 && (h.steadiness === null || h.steadiness >= 0.8),
    metrics: [
      { kind: "pitch", expectedMidi: w.targetMidi },
      ...breathMetric(h.steadiness, h.trace),
    ],
    notMeasured: h.steadiness === null ? ["breath"] : [],
    pitchCorrect: h.pitchOk,
    progress: h.progress,
    steadiness: h.steadiness,
  };
}

/** Interval landing: pitch 0.45 + steadiness x 0.45 + progress 0.1; correct on right pitch, full hold, steadiness 0.75. */
export function gradeIntervalLanding(w: Window): BreathResult {
  const h = hold(w);
  const score = blend([
    [0.45, h.pitchOk ? 1 : 0],
    [0.45, h.steadiness],
    [0.1, h.progress],
  ]);
  return {
    score,
    correct: h.pitchOk && h.progress >= 1 && (h.steadiness === null || h.steadiness >= 0.75),
    metrics: [
      { kind: "pitch", expectedMidi: w.targetMidi },
      ...breathMetric(h.steadiness, h.trace),
    ],
    notMeasured: h.steadiness === null ? ["breath"] : [],
    pitchCorrect: h.pitchOk,
    progress: h.progress,
    steadiness: h.steadiness,
  };
}

export const SWELL = { low: 0.2, peak: 0.9, smoothnessGain: 5 } as const;

/** The target rise-and-fall: low at the ends, peak at the middle, a raised cosine between. */
export function swellEnvelope(
  progress: number,
  low: number = SWELL.low,
  peak: number = SWELL.peak,
): number {
  const top = Math.max(peak, low + 0.1);
  return low + (top - low) * Math.sin(Math.PI * clamp01(progress)) ** 2;
}

export interface SwellResult extends BreathResult {
  shape: number | null;
  smoothness: number | null;
}

/**
 * Swell: shape x 0.5 + smoothness x 0.2 + pitch 0.2 + progress 0.1.
 * shape = clamp01(1 - 2 x mean|breath - envelope| / (peak - low)): zero when the
 * curve is off by half the swell's range on average.
 * smoothness = clamp01(1 - 5 x mean|second difference|) over consecutive samples.
 * Correct on a full hold at the right pitch with shape 0.8 and smoothness 0.75.
 */
export function gradeSwell(w: Window & { low?: number; peak?: number }): SwellResult {
  const low = w.low ?? SWELL.low;
  const peak = Math.max(w.peak ?? SWELL.peak, low + 0.1);
  const h = hold(w);
  const inside = breathSamples(w.breath).filter(
    (b) => b.at >= w.startAt && b.at <= w.startAt + w.durationMs,
  );
  const measured = h.steadiness !== null;
  const shape = !measured
    ? null
    : inside.length
      ? clamp01(
          1 -
            (2 *
              mean(
                inside.map((b) =>
                  Math.abs(b.value - swellEnvelope((b.at - w.startAt) / w.durationMs, low, peak)),
                ),
              )) /
              (peak - low),
        )
      : 0;
  const d2 = inside
    .slice(2)
    .map((b, i) => Math.abs(b.value - 2 * inside[i + 1].value + inside[i].value));
  const smoothness = !measured
    ? null
    : d2.length
      ? clamp01(1 - SWELL.smoothnessGain * mean(d2))
      : 0;
  const score = blend([
    [0.5, shape],
    [0.2, smoothness],
    [0.2, h.pitchOk ? 1 : 0],
    [0.1, h.progress],
  ]);
  const targetCurve = Array.from({ length: TRACE_SAMPLES }, (_, i) =>
    swellEnvelope(i / (TRACE_SAMPLES - 1), low, peak),
  );
  return {
    score,
    correct:
      h.pitchOk &&
      h.progress >= 1 &&
      (shape === null || shape >= 0.8) &&
      (smoothness === null || smoothness >= 0.75),
    metrics: [
      { kind: "pitch", expectedMidi: w.targetMidi },
      ...breathMetric(h.steadiness, h.trace, targetCurve),
    ],
    notMeasured: measured ? [] : ["breath"],
    pitchCorrect: h.pitchOk,
    progress: h.progress,
    steadiness: h.steadiness,
    shape,
    smoothness,
  };
}

export const ARTICULATION_TARGET = { staccato: 0.35, legato: 0.95 } as const;

export interface ArticulationResult extends Graded {
  pitch: number;
  /** Null when there are no note-offs or the input is on-screen. */
  articulation: number | null;
  meanSoundingFraction: number | null;
}

/**
 * Articulation: the first `count` notes. pitch x 0.5 + articulation x 0.5, where
 * articulation = max(0, 1 - |mean sounding fraction of the beat - target| / 0.6).
 * Correct when every pitch is right and articulation >= 0.7.
 */
export function gradeArticulation(input: {
  targetMidi: number;
  count: number;
  style: keyof typeof ARTICULATION_TARGET;
  beatMs: number;
  notes: readonly NoteEvent[];
}): ArticulationResult {
  const ons = noteOns(input.notes).slice(0, input.count);
  const pitch = input.count
    ? ons.filter((n) => n.midi === input.targetMidi).length / input.count
    : 0;
  const measured =
    ons.length > 0 &&
    ons.every((n) => n.source === "midi") &&
    input.notes.some((n) => n.kind === "noteoff");
  const ended = spans(input.notes, Infinity)
    .slice(0, input.count)
    .filter((s) => Number.isFinite(s.off));
  const meanSoundingFraction =
    measured && ended.length
      ? mean(ended.map((s) => clamp01((s.off - s.on) / input.beatMs)))
      : null;
  const articulation = !measured
    ? null
    : meanSoundingFraction === null
      ? 0
      : Math.max(0, 1 - Math.abs(meanSoundingFraction - ARTICULATION_TARGET[input.style]) / 0.6);
  const score = ons.length
    ? blend([
        [0.5, pitch],
        [0.5, articulation],
      ])
    : 0;
  return {
    score,
    correct: pitch === 1 && (articulation === null || articulation >= 0.7),
    metrics: ons.map((n) => ({
      kind: "pitch",
      expectedMidi: input.targetMidi,
      actualMidi: n.midi,
    })),
    notMeasured: measured ? [] : ["articulation"],
    pitch,
    articulation,
    meanSoundingFraction,
  };
}

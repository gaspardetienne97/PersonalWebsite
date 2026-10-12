// Rhythm trainer: tap the pulse, or read and tap a written pattern (scoring rules 10).
import type { Metric } from "../types";
import { type Graded, mean, stdev } from "./grade";
import { claim, timingVerdict, type TimingVerdict } from "./timing";

const PULSE_ZERO_MS = 160;
const DIRECTION_MS = 20;

export interface PulseResult extends Graded {
  matched: number;
  missed: number;
  extra: number;
  meanAbsErrorMs: number;
  meanErrorMs: number;
  /** Standard deviation of the signed errors. */
  jitterMs: number;
  direction: "ahead" | "behind" | "centered";
}

/**
 * Tap the beat. Each beat claims the nearest tap within half a beat.
 * score = max(0, 1 - meanAbsErr/160) x matched/beats (a skipped beat is not free).
 */
export function gradePulse(
  taps: readonly number[],
  beats: readonly number[],
  beatMs: number,
): PulseResult {
  const { claims, extras } = claim(
    beats.map((at) => ({ at })),
    taps.map((at) => ({ at })),
    beatMs / 2,
  );
  const errors = claims.flatMap((c) => (c ? [c.errorMs] : []));
  const meanAbsErrorMs = mean(errors.map(Math.abs));
  const meanErrorMs = mean(errors);
  const timing = errors.length ? Math.max(0, 1 - meanAbsErrorMs / PULSE_ZERO_MS) : 0;
  const score = beats.length ? timing * (errors.length / beats.length) : 0;
  const metrics: Metric[] = claims.flatMap((c, i) =>
    c
      ? [
          {
            kind: "timing" as const,
            expectedMs: beats[i],
            actualMs: taps[c.hit],
            errorMs: c.errorMs,
          },
        ]
      : [],
  );
  return {
    score,
    correct: score >= 0.85,
    metrics,
    notMeasured: [],
    matched: errors.length,
    missed: beats.length - errors.length,
    extra: extras.length,
    meanAbsErrorMs,
    meanErrorMs,
    jitterMs: stdev(errors),
    direction:
      meanErrorMs < -DIRECTION_MS ? "ahead" : meanErrorMs > DIRECTION_MS ? "behind" : "centered",
  };
}

export interface PatternEvent {
  id: string;
  beat: number;
  stroke?: "down" | "up" | "mute";
  durationBeats?: number;
  accent?: string;
}

export interface RhythmPattern {
  events: readonly PatternEvent[];
  rests?: readonly { startBeat: number; endBeat: number }[];
  chords?: readonly {
    symbol: string;
    pitchClasses: number[];
    startBeat: number;
    durationBeats: number;
  }[];
}

/** An onset, with the pitch classes heard at it when the detector heard any. */
export interface RhythmHit {
  at: number;
  pcs?: number[];
}

export interface PatternResult extends Graded {
  windowMs: number;
  timingScore: number;
  meanAbsErrorMs: number;
  matched: number;
  missed: number;
  extra: number;
  restHits: number;
  /** Per expected event, in pattern order. */
  grid: {
    id: string;
    beat: number;
    stroke?: PatternEvent["stroke"];
    expectedAt: number;
    at?: number;
    errorMs?: number;
    verdict: TimingVerdict | "missed";
  }[];
  /** Every hit and what it counted as. */
  hits: { at: number; kind: "matched" | "extra" | "rest" }[];
  /** Null when the pattern has no chords or no pitch was heard (timing only). */
  chords: { symbol: string; held: boolean; missing: number[] }[] | null;
}

const pitched = (h: RhythmHit) => (h.pcs?.length ?? 0) > 0;

export function gradePattern(
  pattern: RhythmPattern,
  hits: readonly RhythmHit[],
  clock: { startAt: number; beatMs: number },
): PatternResult {
  const { startAt, beatMs } = clock;
  const time = (beat: number) => startAt + beat * beatMs;
  const beats = [...new Set(pattern.events.map((e) => e.beat))].sort((a, b) => a - b);
  const spacing = Math.min(...beats.slice(1).map((b, i) => b - beats[i]), Infinity);
  const windowMs = (Number.isFinite(spacing) ? spacing : 1) * beatMs * 0.5;

  // A rest hit is one inside a rest and more than half a window from every event
  // (an early tap for the next beat is still that beat's).
  const nearEvent = (at: number) =>
    pattern.events.some((e) => Math.abs(at - time(e.beat)) <= windowMs / 2);
  const inRest = (at: number) =>
    (pattern.rests ?? []).some((r) => at >= time(r.startBeat) && at < time(r.endBeat)) &&
    !nearEvent(at);
  const eligible = hits.filter((h) => !inRest(h.at));
  const restHits = hits.length - eligible.length;

  const targets = pattern.events.map((e) => ({ ...e, at: time(e.beat) }));
  const { claims, extras } = claim(targets, eligible, windowMs);
  const claimedHits = new Set(claims.flatMap((c) => (c ? [c.hit] : [])));
  // A mute counts only when an onset landed and nothing pitched did.
  targets.forEach((t, i) => {
    const c = claims[i];
    if (t.stroke !== "mute" || !c) return;
    if (eligible.some((h) => pitched(h) && Math.abs(h.at - t.at) <= windowMs)) claims[i] = null;
  });

  const errors = claims.flatMap((c) => (c ? [c.errorMs] : []));
  const meanAbsErrorMs = mean(errors.map(Math.abs));
  const timingScore = errors.length ? Math.max(0, 1 - meanAbsErrorMs / PULSE_ZERO_MS) : 0;
  const missed = claims.filter((c) => !c).length;
  const score = Math.max(
    0,
    timingScore -
      Math.min(0.5, restHits * 0.2) -
      Math.min(0.6, missed * 0.2) -
      Math.min(0.3, extras.length * 0.1),
  );

  const heardPitch = hits.some(pitched);
  const chords =
    pattern.chords?.length && heardPitch
      ? pattern.chords.map((ch) => {
          const heard = new Set(
            hits
              .filter(
                (h) => h.at >= time(ch.startBeat) && h.at < time(ch.startBeat + ch.durationBeats),
              )
              .flatMap((h) => h.pcs ?? []),
          );
          const missing = ch.pitchClasses.filter((p) => !heard.has(p));
          return {
            symbol: ch.symbol,
            held: missing.length === 0,
            missing,
            heard: [...heard].sort((a, b) => a - b),
          };
        })
      : null;

  const metrics: Metric[] = [
    ...claims.flatMap((c, i) =>
      c
        ? [
            {
              kind: "timing" as const,
              expectedMs: targets[i].at,
              actualMs: eligible[c.hit].at,
              errorMs: c.errorMs,
            },
          ]
        : [],
    ),
    ...(chords ?? []).map((ch, i) => ({
      kind: "chord" as const,
      expectedPcs: pattern.chords![i].pitchClasses,
      actualPcs: ch.heard,
      missing: ch.missing,
      extra: ch.heard.filter((p) => !pattern.chords![i].pitchClasses.includes(p)),
    })),
  ];
  return {
    score,
    correct: score >= 0.85,
    metrics,
    notMeasured: pattern.chords?.length && !heardPitch ? ["chords"] : [],
    windowMs,
    timingScore,
    meanAbsErrorMs,
    matched: errors.length,
    missed,
    extra: extras.length,
    restHits,
    grid: targets.map((t, i) => {
      const c = claims[i];
      return {
        id: t.id,
        beat: t.beat,
        stroke: t.stroke,
        expectedAt: t.at,
        at: c ? eligible[c.hit].at : undefined,
        errorMs: c?.errorMs,
        verdict: c ? timingVerdict(c.errorMs) : "missed",
      };
    }),
    hits: hits
      .map((h) => ({
        at: h.at,
        kind: inRest(h.at)
          ? ("rest" as const)
          : claimedHits.has(eligible.indexOf(h))
            ? ("matched" as const)
            : ("extra" as const),
      }))
      .sort((a, b) => a.at - b.at),
    chords: chords?.map(({ symbol, held, missing }) => ({ symbol, held, missing })) ?? null,
  };
}

/**
 * A rhythm written down on a grid: the onsets (in beats) against the heard
 * ones. Score is the matched share of everything either side has (a missing
 * onset and an extra one both count against it); right only when equal.
 */
export function gradeOnsets(expected: readonly number[], answered: readonly number[]): Graded {
  const key = (b: number) => Math.round(b * 12);
  const want = new Set(expected.map(key));
  const got = new Set(answered.map(key));
  const matched = [...got].filter((b) => want.has(b)).length;
  const union = new Set([...want, ...got]).size;
  const score = union ? matched / union : 1;
  return {
    score,
    correct: score === 1,
    metrics: [
      {
        kind: "choice",
        expected: [...want].sort((a, b) => a - b).join(),
        actual: [...got].sort((a, b) => a - b).join(),
      },
    ],
    notMeasured: ["timing"],
  };
}

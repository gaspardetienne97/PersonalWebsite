// Chord follower: strumming a known progression, from pitch-class sets with onset times.
import type { Metric, Strictness } from "../types";
import { type Graded, mean } from "./grade";
import { verifyChordTones, type ToneVerification } from "./technique";
import { claim, matchWindowMs } from "./timing";

/** A chord counts as matched at this verification score (e.g. every tone plus one extra of four). */
export const CHORD_MATCH_SCORE = 0.75;

export interface ChordFollowResult extends Graded {
  matched: number;
  total: number;
  chords: {
    symbol: string;
    at: number;
    observedAt?: number;
    errorMs?: number;
    verification: ToneVerification | null;
    matched: boolean;
  }[];
}

/**
 * Each expected chord claims the nearest observation inside
 * matchWindowMs(beat, its duration, strictness), then verifies its tones
 * (coverage minus 0.25 x extra/expected). score = mean verification over chords.
 */
export function followChords(input: {
  chords: readonly {
    symbol: string;
    pcs: readonly number[];
    startBeat: number;
    durationBeats: number;
  }[];
  observed: readonly { at: number; pcs: readonly number[] }[];
  bpm: number;
  startAt: number;
  strictness: Strictness;
}): ChordFollowResult {
  const beatMs = 60000 / input.bpm;
  const targets = input.chords.map((c) => ({ ...c, at: input.startAt + c.startBeat * beatMs }));
  const { claims } = claim(targets, input.observed, (t) =>
    matchWindowMs(beatMs, t.durationBeats, input.strictness),
  );
  const chords = targets.map((t, i) => {
    const c = claims[i];
    const verification = c ? verifyChordTones(t.pcs, input.observed[c.hit].pcs) : null;
    return {
      symbol: t.symbol,
      at: t.at,
      observedAt: c ? input.observed[c.hit].at : undefined,
      errorMs: c?.errorMs,
      verification,
      matched: !!verification && verification.score >= CHORD_MATCH_SCORE,
    };
  });
  const matched = chords.filter((c) => c.matched).length;
  return {
    score: mean(chords.map((c) => c.verification?.score ?? 0)),
    correct: chords.length > 0 && matched === chords.length,
    metrics: chords.flatMap((c, i): Metric[] =>
      c.verification
        ? [
            {
              kind: "chord",
              expectedPcs: [...input.chords[i].pcs].sort((a, b) => a - b),
              actualPcs: c.verification.observed,
              missing: c.verification.missing,
              extra: c.verification.extra,
            },
            { kind: "timing", expectedMs: c.at, actualMs: c.observedAt!, errorMs: c.errorMs! },
          ]
        : [],
    ),
    notMeasured: [],
    matched,
    total: chords.length,
    chords,
  };
}

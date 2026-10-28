// Scales, fretboard patterns, fret finding, Chord-Perfect and the tempo ladder.
import type { Metric, NoteEvent, Strictness } from "../types";
import { pcOf } from "../theory/notes";
import { type Graded, mean, noteOns, notMeasured, pcSet, simultaneityMeasured } from "./grade";
import {
  alignChangeClusters,
  claim,
  clusterByGap,
  evenness,
  matchWindowMs,
  togetherBeats,
} from "./timing";

// ---------------------------------------------------------------------------
// Lines: scales, spider, positions (scoring rules 7).

export interface LineInput {
  /** Per beat, the expected notes: one, or one per hand when hands play together. */
  beats: readonly (readonly { midi: number; hand?: "left" | "right" }[])[];
  beatMs: number;
  notes: readonly NoteEvent[];
  /** Report how many beats the hands struck within 40 ms (scales, hands both). */
  handsTogether?: boolean;
  /** A checkpoint bar that evenness must also clear ("Hands together, one octave, 80" is 0.85). */
  minEvenness?: number;
}

export interface LineResult extends Graded {
  pitch: number;
  evenness: number;
  evennessErrorMs: number;
  /** Expected notes played at the right pitch. */
  clean: number;
  total: number;
  /** Mean absolute error of each beat's onset against the grid anchored on the first onset. */
  meanTimingErrorMs: number;
  together: { count: number; beats: number } | null;
  /** Blocked chords: how many struck with each hand's notes within CHORD_TOGETHER_MS, and their mean spread. */
  chordTogether: { count: number; chords: number; meanSpreadMs: number } | null;
}

/** A blocked chord's notes count as struck together inside this spread. */
export const CHORD_TOGETHER_MS = 40;

/** Missed notes the line matcher will skip past before it treats a note as extra. */
const LINE_LOOKAHEAD_BEATS = 2;

/**
 * Pitch follows the order of the line, not the clock: each played note claims the
 * next unclaimed matching note within a couple of beats of where the player is, so a
 * late start, a skipped note or a drifting tempo never shifts every later note to
 * "wrong". The grid for timing is anchored on the first matched note.
 */
function followLine(beats: LineInput["beats"], ons: NoteEvent[], beatMs: number) {
  const flat = beats.flatMap((notes, beat) => notes.map((n) => ({ ...n, beat })));
  const hitOf: (number | null)[] = flat.map(() => null);
  const last = flat.length ? flat[flat.length - 1].beat : -1;
  let cursor = 0;
  let started = false;
  for (let h = 0; h < ons.length; h++) {
    const reach = started ? cursor + LINE_LOOKAHEAD_BEATS : Infinity;
    const ti = flat.findIndex(
      (t, i) => hitOf[i] === null && t.midi === ons[h].midi && t.beat >= cursor && t.beat <= reach,
    );
    if (ti === -1) continue;
    hitOf[ti] = h;
    started = true;
    cursor = Math.max(cursor, flat[ti].beat);
    // Past every step that is played, and past empty ones (a hold, a burst's rest).
    while (cursor <= last && flat.every((t, i) => t.beat !== cursor || hitOf[i] !== null)) cursor++;
  }
  const first = hitOf.findIndex((h) => h !== null);
  const anchor =
    first === -1 ? (ons[0]?.at ?? 0) : ons[hitOf[first]!].at - flat[first].beat * beatMs;
  const targets = flat.map((t) => ({ ...t, at: anchor + t.beat * beatMs }));
  const claims = hitOf.map((h, i) =>
    h === null ? null : { hit: h, errorMs: ons[h].at - targets[i].at },
  );
  const used = new Set(hitOf.filter((h): h is number => h !== null));
  const extras = ons.flatMap((_, h) => (used.has(h) ? [] : [h]));
  return { targets, claims, extras };
}

/**
 * Pitch per expected note (each note claims the nearest same-pitch onset within a
 * beat of its grid slot), evenness per beat on a grid anchored on the first onset.
 * score = pitch x 0.85 + evenness x 0.15, correct at 0.9.
 */
export function gradeLine(input: LineInput): LineResult {
  const { beatMs } = input;
  const ons = noteOns(input.notes);
  const { targets, claims, extras } = followLine(input.beats, ons, beatMs);
  // For the confusion matrix: what was played where a note was missed.
  const missedIdx = targets.flatMap((_, i) => (claims[i] ? [] : [i]));
  const wrong = claim(
    missedIdx.map((i) => targets[i]),
    extras.map((h) => ons[h]),
    beatMs / 2,
  ).claims;
  const actualOf = new Map(
    missedIdx.map((ti, k) => [ti, wrong[k] ? ons[extras[wrong[k]!.hit]].midi : undefined]),
  );

  const beatOnsets = input.beats.map((_, beat) => {
    const ats = targets.flatMap((t, i) =>
      t.beat === beat && claims[i] ? [ons[claims[i]!.hit].at] : [],
    );
    return ats.length ? Math.min(...ats) : undefined;
  });
  const points = beatOnsets.flatMap((actual, beat) =>
    actual === undefined ? [] : [{ expected: targets[0].at + beat * beatMs, actual }],
  );
  const even = evenness(points, beatMs);
  const clean = claims.filter(Boolean).length;
  const pitch = targets.length ? clean / targets.length : 0;

  const measuredTogether = simultaneityMeasured(ons);
  let together: LineResult["together"] = null;
  if (input.handsTogether && measuredTogether) {
    const hand = (h: "left" | "right") =>
      targets.flatMap((t, i) => (t.hand === h && claims[i] ? [ons[claims[i]!.hit].at] : []));
    together = {
      count: togetherBeats(hand("left"), hand("right"), beatMs).together,
      beats: input.beats.filter(
        (b) => b.some((n) => n.hand === "left") && b.some((n) => n.hand === "right"),
      ).length,
    };
  }

  // Blocked chords: the spread of each hand's notes within a step (informative, not in the score).
  let chordTogether: LineResult["chordTogether"] = null;
  const chordSteps = input.beats.flatMap((notes, beat) =>
    (["left", "right"] as const).flatMap((h) => {
      const mine = notes.filter((n) => (n.hand ?? "right") === h);
      if (mine.length < 2) return [];
      const ats = targets.flatMap((t, i) =>
        t.beat === beat && (t.hand ?? "right") === h && claims[i] ? [ons[claims[i]!.hit].at] : [],
      );
      return ats.length === mine.length ? [Math.max(...ats) - Math.min(...ats)] : [];
    }),
  );
  if (chordSteps.length && measuredTogether)
    chordTogether = {
      count: chordSteps.filter((d) => d <= CHORD_TOGETHER_MS).length,
      chords: chordSteps.length,
      meanSpreadMs: mean(chordSteps),
    };

  const score = ons.length ? pitch * 0.85 + even.score * 0.15 : 0;
  const metrics: Metric[] = [
    ...targets.map((t, i) => ({
      kind: "pitch" as const,
      expectedMidi: t.midi,
      actualMidi: claims[i] ? t.midi : actualOf.get(i),
    })),
    ...points.map((p) => ({
      kind: "timing" as const,
      expectedMs: p.expected,
      actualMs: p.actual,
      errorMs: p.actual - p.expected,
    })),
  ];
  return {
    score,
    correct: score >= 0.9 && (input.minEvenness === undefined || even.score >= input.minEvenness),
    metrics,
    notMeasured: input.handsTogether ? notMeasured({ together: measuredTogether }) : [],
    pitch,
    evenness: even.score,
    evennessErrorMs: even.errorMs,
    clean,
    total: targets.length,
    meanTimingErrorMs: mean(points.map((p) => Math.abs(p.actual - p.expected))),
    together,
    chordTogether,
  };
}

// ---------------------------------------------------------------------------
// Note finder and interval recall: binary.

export interface FretPosition {
  midi: number;
  string: number;
  fret: number;
}

/**
 * `acceptable` lists every position that answers the prompt. Pitch always counts;
 * the string/fret is verified only for on-screen taps that carry one.
 */
export function gradeFretFind(
  acceptable: readonly FretPosition[],
  answer: NoteEvent | null,
): Graded & { positionVerified: boolean | null } {
  const pitchOk = !!answer && acceptable.some((a) => a.midi === answer.midi);
  const measured =
    !!answer &&
    answer.source === "onscreen" &&
    answer.string !== undefined &&
    answer.fret !== undefined;
  const positionOk =
    measured && acceptable.some((a) => a.string === answer!.string && a.fret === answer!.fret);
  const correct = pitchOk && (!measured || positionOk);
  return {
    score: correct ? 1 : 0,
    correct,
    metrics: [{ kind: "pitch", expectedMidi: acceptable[0]?.midi ?? 0, actualMidi: answer?.midi }],
    notMeasured: notMeasured({ position: measured }),
    positionVerified: measured ? positionOk : null,
  };
}

// ---------------------------------------------------------------------------
// Chord-Perfect.

/** Build and Pick: every voiced string, graded low to high; correct only if all matched. */
export function gradeChordStrings(
  voiced: readonly number[],
  played: readonly number[],
): Graded & {
  strings: { midi: number; matched: boolean }[];
  matched: number;
  total: number;
  extra: number[];
} {
  const pool = [...played];
  const strings = [...voiced]
    .sort((a, b) => a - b)
    .map((midi) => {
      const k = pool.indexOf(midi);
      if (k >= 0) pool.splice(k, 1);
      return { midi, matched: k >= 0 };
    });
  const matched = strings.filter((s) => s.matched).length;
  return {
    score: strings.length ? matched / strings.length : 0,
    correct: strings.length > 0 && matched === strings.length,
    metrics: strings.map((s) => ({
      kind: "pitch",
      expectedMidi: s.midi,
      actualMidi: s.matched ? s.midi : undefined,
    })),
    notMeasured: [],
    strings,
    matched,
    total: strings.length,
    extra: pool,
  };
}

export interface ToneVerification {
  coverage: number;
  /** coverage - 0.25 x extra/expected, floored at 0. */
  score: number;
  correct: boolean;
  observed: number[];
  missing: number[];
  extra: number[];
}

/** Chord-tone verification: full coverage with no extra tones is the only correct answer. */
export function verifyChordTones(
  expectedPcs: readonly number[],
  observedPcs: readonly number[],
): ToneVerification {
  const expected = pcSet(expectedPcs);
  const observed = pcSet(observedPcs);
  const missing = expected.filter((p) => !observed.includes(p));
  const extra = observed.filter((p) => !expected.includes(p));
  const coverage = expected.length ? (expected.length - missing.length) / expected.length : 0;
  const score = Math.max(0, coverage - (0.25 * extra.length) / Math.max(1, expected.length));
  return {
    coverage,
    score,
    correct: coverage === 1 && extra.length === 0,
    observed,
    missing,
    extra,
  };
}

const chordMetric = (expectedPcs: readonly number[], v: ToneVerification): Metric => ({
  kind: "chord",
  expectedPcs: pcSet(expectedPcs),
  actualPcs: v.observed,
  missing: v.missing,
  extra: v.extra,
});

/** Same chord symbol, spelling-tolerant on the root (C#m = Dbm). */
export function sameChordSymbol(a: string, b: string): boolean {
  const split = (s: string) => /^([A-G](?:#|b)?)(.*)$/.exec(s.trim());
  const x = split(a);
  const y = split(b);
  return !!x && !!y && pcOf(x[1]) === pcOf(y[1]) && x[2] === y[2];
}

/**
 * Strum & identify. `candidates` is the identifier's ranked list (best first).
 * score = confidence x 0.35 + verification x 0.65, where confidence is the
 * identifier's confidence in the expected symbol; correct needs the top
 * candidate to be the expected symbol and a full, extra-free verification.
 */
export function gradeStrumIdentify(input: {
  expectedSymbol: string;
  expectedPcs: readonly number[];
  observedPcs: readonly number[];
  candidates: readonly { symbol: string; confidence: number }[];
}): Graded & { identified: string | null; confidence: number; verification: ToneVerification } {
  const verification = verifyChordTones(input.expectedPcs, input.observedPcs);
  const confidence =
    input.candidates.find((c) => sameChordSymbol(c.symbol, input.expectedSymbol))?.confidence ?? 0;
  const identified = input.candidates[0]?.symbol ?? null;
  const score = input.observedPcs.length ? confidence * 0.35 + verification.score * 0.65 : 0;
  return {
    score,
    correct:
      identified !== null &&
      sameChordSymbol(identified, input.expectedSymbol) &&
      verification.correct,
    metrics: [
      { kind: "choice", expected: input.expectedSymbol, actual: identified ?? undefined },
      chordMetric(input.expectedPcs, verification),
    ],
    notMeasured: [],
    identified,
    confidence,
    verification,
  };
}

export interface ChangesResult extends Graded {
  /** Arrivals on the next chord of the cycle. */
  completed: number;
  /** Completed changes whose arriving chord verified with every tone and no extras. */
  clean: number;
  changesPerMinute: number;
  /** Timed mode only: completed changes that landed inside their beat's window. */
  onTime: number | null;
  clusters: { start: number; target: number; verification: ToneVerification; errorMs?: number }[];
}

/**
 * Chord changes over clusters split by silence (scoring rules 9), round a cycle
 * of `chords` (or the `from` and `to` pair). The score is
 * the mean verification score; correct when every completed change was clean
 * (and, against a clock, on time).
 */
export function gradeChanges(input: {
  from: { id: string; pcs: readonly number[] };
  to: { id: string; pcs: readonly number[] };
  /** Three or more chords in order; replaces from and to. */
  chords?: readonly { id: string; pcs: readonly number[] }[];
  tuningId: string;
  notes: readonly { midi: number; at: number }[];
  durationMs: number;
  clock?: { bpm: number; beatsPerChord: number; anchorAt?: number; strictness?: Strictness };
}): ChangesResult {
  const clusters = clusterByGap(input.notes);
  const beatMs = input.clock ? 60000 / input.clock.bpm : 0;
  const pair = input.chords?.length ? input.chords : [input.from, input.to];
  const { slots } = alignChangeClusters(
    clusters,
    input.clock && { periodMs: beatMs * input.clock.beatsPerChord, anchorAt: input.clock.anchorAt },
    pair.length,
  );
  const graded = slots.map((s) => ({
    start: clusters[s.cluster].start,
    target: s.target,
    errorMs: s.errorMs,
    verification: verifyChordTones(pair[s.target].pcs, clusters[s.cluster].midis),
  }));
  const windowMs = input.clock
    ? matchWindowMs(beatMs, input.clock.beatsPerChord, input.clock.strictness ?? "normal")
    : 0;
  let completed = 0;
  let clean = 0;
  let onTime = 0;
  for (let i = 1; i < graded.length; i++) {
    if (graded[i].target === graded[i - 1].target) continue;
    completed++;
    if (graded[i].verification.correct) clean++;
    if (input.clock && Math.abs(graded[i].errorMs ?? Infinity) <= windowMs) onTime++;
  }
  const changesPerMinute = input.durationMs > 0 ? completed / (input.durationMs / 60000) : 0;
  const score = mean(graded.map((g) => g.verification.score));
  return {
    score,
    correct: completed > 0 && clean === completed && (!input.clock || onTime === completed),
    metrics: [
      {
        kind: "chord-changes",
        tuningId: input.tuningId,
        durationMs: input.durationMs,
        fromShapeId: input.from.id,
        toShapeId: input.to.id,
        completedChanges: completed,
        cleanChanges: clean,
        changesPerMinute,
      },
      ...graded.map((g) => chordMetric(pair[g.target].pcs, g.verification)),
    ],
    notMeasured: [],
    completed,
    clean,
    changesPerMinute,
    onTime: input.clock ? onTime : null,
    clusters: graded,
  };
}

// ---------------------------------------------------------------------------
// Tempo ladder (scoring rules 11, promotion tightened to two clean runs).

export const LADDER = {
  baseBpm: 100,
  stepBpm: 10,
  ceilingBpm: 180,
  shown: 6,
  slowestBpm: 60,
} as const;

export interface LadderState {
  unlockedBpm: number;
  /** Consecutive clean runs at or above the rung. */
  streak: number;
}

export const baseLadder = (): LadderState => ({ unlockedBpm: LADDER.baseBpm, streak: 0 });

/** Two consecutive clean runs at or above the rung promote it; anything else resets the streak. A rung never drops. */
export function ladderAfterRun(
  state: LadderState | undefined,
  run: { bpm: number; correct: boolean },
): LadderState {
  const s = state ?? baseLadder();
  if (!run.correct || run.bpm < s.unlockedBpm) return { unlockedBpm: s.unlockedBpm, streak: 0 };
  if (s.streak + 1 < 2) return { unlockedBpm: s.unlockedBpm, streak: s.streak + 1 };
  return { unlockedBpm: Math.min(LADDER.ceilingBpm, s.unlockedBpm + LADDER.stepBpm), streak: 0 };
}

export type RungStatus = "unlocked" | "next" | "locked";

/** Six rungs around the unlocked one, plus faster/slower practice suggestions (not earned rungs). */
export function ladderProjection(
  state: LadderState | undefined,
  currentBpm: number,
): { rungs: { bpm: number; status: RungStatus }[]; nextBpm: number; slowerBpm: number } {
  const { baseBpm, stepBpm, ceilingBpm, shown, slowestBpm } = LADDER;
  const unlocked = (state ?? baseLadder()).unlockedBpm;
  const start = Math.max(
    baseBpm,
    Math.min(unlocked - 2 * stepBpm, ceilingBpm - (shown - 1) * stepBpm),
  );
  const rungs = Array.from({ length: shown }, (_, i) => {
    const bpm = start + i * stepBpm;
    const status: RungStatus =
      bpm <= unlocked ? "unlocked" : bpm === unlocked + stepBpm ? "next" : "locked";
    return { bpm, status };
  });
  return {
    rungs,
    nextBpm: Math.min(ceilingBpm, currentBpm + stepBpm),
    slowerBpm: Math.max(slowestBpm, currentBpm - stepBpm),
  };
}

/** Merge two stored ladders (another tab may have unlocked a variant): the higher rung wins per variant. */
export function mergeLadders(
  a: Readonly<Record<string, LadderState>>,
  b: Readonly<Record<string, LadderState>>,
): Record<string, LadderState> {
  const out: Record<string, LadderState> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const cur = out[k];
    out[k] =
      !cur || v.unlockedBpm > cur.unlockedBpm
        ? { ...v }
        : v.unlockedBpm === cur.unlockedBpm
          ? { unlockedBpm: v.unlockedBpm, streak: Math.max(v.streak, cur.streak) }
          : { ...cur };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Legato: was a hammered or pulled note sounded without a new pick attack?
// Partly measurable (docs/research/guitar-ukulele-drills.md): a hard hammer-on
// can trip the onset detector like a pick does, so this is reported, not scored.

/** An attack within this of a note's start belongs to it. */
export const LEGATO_ATTACK_MS = 50;

export type LegatoVerdict = "legato" | "picked" | "missed";

/**
 * For each note marked h, p or s (a slide): "picked" when an onset landed within
 * LEGATO_ATTACK_MS of the note starting, "legato" when none did, "missed"
 * when the note wasn't played. Picked notes (P) get null.
 */
export function legatoAttacks(
  labels: readonly (string | undefined)[],
  startedAt: readonly (number | undefined)[],
  onsets: readonly { at: number }[],
): (LegatoVerdict | null)[] {
  return labels.map((l, i) => {
    if (l !== "h" && l !== "p" && l !== "s") return null;
    const at = startedAt[i];
    if (at === undefined) return "missed";
    return onsets.some((o) => Math.abs(o.at - at) <= LEGATO_ATTACK_MS) ? "picked" : "legato";
  });
}

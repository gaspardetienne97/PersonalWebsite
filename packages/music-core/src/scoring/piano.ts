// Piano: two-hand independence, voicings and voice leading, comping, licks, chord-scales.
import type { Metric, NoteEvent, Strictness } from "../types";
import { clamp01, pc } from "../theory/notes";
import {
  blend,
  type Graded,
  mean,
  noteOns,
  notMeasured,
  pcSet,
  simultaneityMeasured,
  velocityMeasured,
} from "./grade";
import {
  claim,
  clusterByGap,
  evenness,
  matchWindowMs,
  timingCredit,
  togetherBeats,
} from "./timing";

type Hand = "left" | "right";

/** The smallest spacing between distinct beats (one beat when there is only one). */
const smallestSpacing = (beats: readonly number[]) => {
  const u = [...new Set(beats)].sort((a, b) => a - b);
  const s = Math.min(...u.slice(1).map((b, i) => b - u[i]), Infinity);
  return Number.isFinite(s) ? s : 1;
};

// ---------------------------------------------------------------------------
// Two-hand independence.

export interface TwoHandInput {
  targets: readonly { hand: Hand; midi: number; beat: number }[];
  /** Notes below this are the left hand. */
  splitMidi: number;
  /** Only patterns that ask the hands to strike together measure it (Mirror hands). */
  measuresTogether: boolean;
  melodyHand: Hand;
  dynamics: boolean;
  beatMs: number;
  /** The count-in downbeat; without one the first onset stands for the first target beat. */
  startAt?: number;
  notes: readonly NoteEvent[];
}

export interface HandResult {
  hand: Hand;
  matched: number;
  total: number;
  pitch: number;
  evenness: number;
  spacingErrorMs: number;
  meanVelocity: number | null;
}

export interface TwoHandResult extends Graded {
  hands: HandResult[];
  pitch: number;
  evenness: number;
  /** clamp01(melody mean velocity - accompaniment mean velocity) / 0.2), null when not measured or off. */
  dynamics: number | null;
  together: { count: number; beats: number } | null;
}

/**
 * Each hand (split by register) is graded on its own: pitch order by claiming the
 * nearest same-pitch onset, and spacing evenness between its matched notes.
 * score = pitch x 0.8 + evenness x 0.2; with dynamics 0.7 / 0.15 / 0.15.
 */
export function gradeTwoHand(input: TwoHandInput): TwoHandResult {
  const { beatMs } = input;
  const ons = noteOns(input.notes);
  const firstBeat = Math.min(...input.targets.map((t) => t.beat));
  const anchor = input.startAt ?? (ons[0]?.at ?? 0) - firstBeat * beatMs;
  const handOf = (midi: number): Hand => (midi < input.splitMidi ? "left" : "right");
  const matchedAt: Record<Hand, number[]> = { left: [], right: [] };
  const metrics: Metric[] = [];

  const hands = (["left", "right"] as const).flatMap((hand): HandResult[] => {
    const targets = input.targets
      .filter((t) => t.hand === hand)
      .map((t) => ({ ...t, at: anchor + t.beat * beatMs }));
    if (!targets.length) return [];
    const played = ons.filter((n) => handOf(n.midi) === hand);
    const spacingBeats = smallestSpacing(targets.map((t) => t.beat));
    const { claims } = claim(
      targets,
      played,
      spacingBeats * beatMs * 0.5,
      (t, h) => t.midi === h.midi,
    );
    targets.forEach((t, i) => {
      const c = claims[i];
      metrics.push({ kind: "pitch", expectedMidi: t.midi, actualMidi: c ? t.midi : undefined });
      if (c)
        metrics.push({
          kind: "timing",
          expectedMs: t.at,
          actualMs: played[c.hit].at,
          errorMs: c.errorMs,
        });
    });
    const hits = claims.flatMap((c, i) =>
      c ? [{ expected: targets[i].at, actual: played[c.hit].at, v: played[c.hit].velocity }] : [],
    );
    matchedAt[hand] = hits.map((h) => h.actual);
    const even = evenness(hits, spacingBeats * beatMs);
    return [
      {
        hand,
        matched: hits.length,
        total: targets.length,
        pitch: hits.length / targets.length,
        evenness: even.score,
        spacingErrorMs: even.errorMs,
        meanVelocity: hits.length ? mean(hits.map((h) => h.v)) : null,
      },
    ];
  });

  const pitch =
    hands.reduce((s, h) => s + h.matched, 0) /
    Math.max(
      1,
      hands.reduce((s, h) => s + h.total, 0),
    );
  const even = mean(hands.map((h) => h.evenness));
  const melody = hands.find((h) => h.hand === input.melodyHand)?.meanVelocity ?? null;
  const accomp = hands.find((h) => h.hand !== input.melodyHand)?.meanVelocity ?? null;
  const velOk = velocityMeasured(ons) && melody !== null && accomp !== null;
  const dynamics = input.dynamics && velOk ? clamp01((melody! - accomp!) / 0.2) : null;
  const togetherOk = simultaneityMeasured(ons);
  const sharedBeats = new Set(
    input.targets
      .filter((t) => t.hand === "left")
      .map((t) => t.beat)
      .filter((b) => input.targets.some((t) => t.hand === "right" && t.beat === b)),
  ).size;
  const together =
    input.measuresTogether && togetherOk
      ? {
          count: togetherBeats(matchedAt.left, matchedAt.right, beatMs).together,
          beats: sharedBeats,
        }
      : null;

  const score = !ons.length
    ? 0
    : input.dynamics
      ? blend([
          [0.7, pitch],
          [0.15, even],
          [0.15, dynamics],
        ])
      : pitch * 0.8 + even * 0.2;
  return {
    score,
    correct: score >= 0.9,
    metrics,
    notMeasured: notMeasured({
      ...(input.dynamics ? { dynamics: velOk } : {}),
      ...(input.measuresTogether ? { together: togetherOk } : {}),
    }),
    hands,
    pitch,
    evenness: even,
    dynamics,
    together,
  };
}

// ---------------------------------------------------------------------------
// ii-V-I voicings.

export interface VoicingResult extends Graded {
  membership: boolean;
  /** Null when the target has no bass/root gate. */
  bassOk: boolean | null;
  coverage: number;
  missing: number[];
  extra: number[];
}

/**
 * `played` is the held chord (strict) or every note collected since the prompt
 * (non-strict: extras tolerated, no simultaneity needed). In arpeggio mode
 * (monophonic instruments) the first note is the bass, otherwise the lowest.
 * Full credit: membership and the bass gate pass. Half: membership only.
 * Otherwise half the coverage.
 */
export function gradeVoicing(input: {
  expectedPcs: readonly number[];
  expectedBassPc?: number;
  played: readonly number[];
  strict: boolean;
  arpeggio?: boolean;
}): VoicingResult {
  const expected = pcSet(input.expectedPcs);
  const actual = pcSet(input.played);
  const missing = expected.filter((p) => !actual.includes(p));
  const extra = actual.filter((p) => !expected.includes(p));
  const coverage = expected.length ? (expected.length - missing.length) / expected.length : 0;
  const membership =
    missing.length === 0 && (!input.strict || extra.length === 0) && input.played.length > 0;
  const bass = input.played.length
    ? input.arpeggio
      ? input.played[0]
      : Math.min(...input.played)
    : undefined;
  const bassOk =
    input.expectedBassPc === undefined
      ? null
      : bass !== undefined && pc(bass) === input.expectedBassPc;
  const score = membership ? (bassOk === false ? 0.5 : 1) : 0.5 * coverage;
  return {
    score,
    correct: score === 1,
    metrics: [
      {
        kind: "chord",
        expectedPcs: expected,
        actualPcs: actual,
        missing,
        extra,
        expectedBassPc: input.expectedBassPc,
        actualBassPc: bass === undefined ? undefined : pc(bass),
        inversionCorrect: bassOk ?? undefined,
      },
    ],
    notMeasured: [],
    membership,
    bassOk,
    coverage,
    missing,
    extra,
  };
}

/** Total movement pairing voices low to high. */
const movement = (a: readonly number[], b: readonly number[]) => {
  const x = [...a].sort((p, q) => p - q);
  const y = [...b].sort((p, q) => p - q);
  return x.reduce((s, v, i) => s + Math.abs(v - y[i]), 0);
};

/** Least total movement from `from` to any voicing of `targetPcs` inside the register. */
export function minimumMovement(
  from: readonly number[],
  targetPcs: readonly number[],
  register: [number, number],
): number {
  const options = targetPcs.map((p) => {
    const out: number[] = [];
    for (let m = register[0]; m <= register[1]; m++) if (pc(m) === pc(p)) out.push(m);
    return out;
  });
  let best = Infinity;
  const walk = (i: number, picked: number[]) => {
    if (i === options.length) return void (best = Math.min(best, movement(from, picked)));
    for (const m of options[i]) if (!picked.includes(m)) walk(i + 1, [...picked, m]);
  };
  walk(0, []);
  return best;
}

/**
 * Inversions / voice leading: 1 when membership is right and the movement is
 * within `toleranceSemitones` of the least possible, 0.5 for membership only, else 0.
 */
export function gradeVoiceLeading(input: {
  fromMidi: readonly number[];
  targetPcs: readonly number[];
  register: [number, number];
  played: readonly number[];
  toleranceSemitones?: number;
}): Graded & {
  membership: boolean;
  minimumSemitones: number;
  actualSemitones?: number;
  maxVoiceMove?: number;
} {
  const tolerance = input.toleranceSemitones ?? 2;
  const [lo, hi] = input.register;
  const membership =
    input.played.length === input.targetPcs.length &&
    new Set(input.played).size === input.played.length &&
    input.played.every((m) => m >= lo && m <= hi) &&
    pcSet(input.played).join() === pcSet(input.targetPcs).join();
  const minimumSemitones = minimumMovement(input.fromMidi, input.targetPcs, input.register);
  const comparable = input.played.length === input.fromMidi.length;
  const actualSemitones = comparable ? movement(input.fromMidi, input.played) : undefined;
  const from = [...input.fromMidi].sort((a, b) => a - b);
  const maxVoiceMove = comparable
    ? Math.max(...[...input.played].sort((a, b) => a - b).map((m, i) => Math.abs(m - from[i])))
    : undefined;
  const score = !membership
    ? 0
    : actualSemitones !== undefined && actualSemitones - minimumSemitones <= tolerance
      ? 1
      : 0.5;
  return {
    score,
    correct: score === 1,
    metrics: [
      {
        kind: "voice-leading",
        fromMidi: [...input.fromMidi],
        actualMidi: [...input.played],
        register: input.register,
        membershipCorrect: membership,
        actualSemitones,
        minimumSemitones,
      },
    ],
    notMeasured: [],
    membership,
    minimumSemitones,
    actualSemitones,
    maxVoiceMove,
  };
}

// ---------------------------------------------------------------------------
// Comping: a right-hand lick over left-hand hits on the Charleston rhythm.

/** Left-hand notes closer than this form one comp hit (a shell struck as one chord). */
export const COMP_CHORD_GAP_MS = 100;
const SWUNG_OFFBEAT = 2 / 3;

export interface CompingResult extends Graded {
  lick: { matched: number; total: number };
  comp: { matched: number; total: number; extra: number };
  extra: number;
  meanAbsErrorMs: number;
  windowMs: number;
}

/**
 * Lick notes (octave-exact) and left-hand hits, each claiming inside
 * matchWindowMs(beat, 0.5, strictness). With swing, an off-beat eighth may land
 * anywhere from straight (0.5) to swung (0.67) with zero error.
 * score = completion x 0.7 + timing credit x 0.3; correct when every lick note
 * and every comp hit landed.
 */
export function gradeComping(input: {
  lick: readonly { midi: number; startBeat: number }[];
  compRhythm: readonly { beat: number }[];
  bars: number;
  beatsPerBar: number;
  swing: boolean;
  beatMs: number;
  startAt: number;
  strictness: Strictness;
  notes: readonly NoteEvent[];
}): CompingResult {
  const { beatMs, startAt } = input;
  const windowMs = matchWindowMs(beatMs, 0.5, input.strictness);
  const slack = (beat: number) =>
    input.swing && Math.abs((beat % 1) - 0.5) < 1e-6 ? (SWUNG_OFFBEAT - 0.5) * beatMs : 0;
  const target = (beat: number) => ({ at: startAt + beat * beatMs, slackMs: slack(beat) });
  const split = Math.min(...input.lick.map((n) => n.midi));
  const ons = noteOns(input.notes);
  const rh = ons.filter((n) => n.midi >= split);
  const lhHits = clusterByGap(
    ons.filter((n) => n.midi < split),
    COMP_CHORD_GAP_MS,
  ).map((c) => ({ at: c.start }));

  const lickTargets = input.lick.map((n) => ({ ...target(n.startBeat), midi: n.midi }));
  const compTargets = Array.from({ length: input.bars }, (_, bar) =>
    input.compRhythm.map((c) => target(bar * input.beatsPerBar + c.beat)),
  ).flat();
  const lick = claim(lickTargets, rh, windowMs, (t, h) => t.midi === h.midi);
  const comp = claim(compTargets, lhHits, windowMs);
  const errors = [...lick.claims, ...comp.claims].flatMap((c) => (c ? [c.errorMs] : []));
  const total = lickTargets.length + compTargets.length;
  const lickMatched = lick.claims.filter(Boolean).length;
  const compMatched = comp.claims.filter(Boolean).length;
  const completion = total ? errors.length / total : 0;
  const timing = errors.length ? mean(errors.map((e) => timingCredit(e, windowMs))) : 0;
  const score = completion * 0.7 + timing * 0.3;
  return {
    score,
    correct: total > 0 && errors.length === total,
    metrics: [
      ...lickTargets.map((t, i) => ({
        kind: "pitch" as const,
        expectedMidi: t.midi,
        actualMidi: lick.claims[i] ? t.midi : undefined,
      })),
      ...[
        ...lick.claims.map((c, i) => [c, lickTargets[i].at, rh] as const),
        ...comp.claims.map((c, i) => [c, compTargets[i].at, lhHits] as const),
      ].flatMap(([c, at, hits]) =>
        c
          ? [
              {
                kind: "timing" as const,
                expectedMs: at,
                actualMs: hits[c.hit].at,
                errorMs: c.errorMs,
              },
            ]
          : [],
      ),
    ],
    notMeasured: [],
    lick: { matched: lickMatched, total: lickTargets.length },
    comp: { matched: compMatched, total: compTargets.length, extra: comp.extras.length },
    extra: lick.extras.length + comp.extras.length,
    meanAbsErrorMs: mean(errors.map(Math.abs)),
    windowMs,
  };
}

// ---------------------------------------------------------------------------
// Jazz licks.

export interface LickResult extends Graded {
  matched: number;
  total: number;
  onTime: number;
  /** Fretted instruments, on-screen taps only; null when not measured. */
  positions: number | null;
  /** First note that is wrong or missing, null when all right. */
  firstWrong: number | null;
  /** The four-note window around the first wrong note, [start, end). */
  practiceWindow: [number, number] | null;
}

/**
 * Positional pitch-class match (octave-lenient, extras past the phrase ignored).
 * score = matched/total, correct at 0.9. On time within min(180, beat/4) of a grid
 * anchored on the count-in or the first note.
 */
export function gradeLick(input: {
  expected: readonly { midi: number; startBeat: number; string?: number; fret?: number }[];
  notes: readonly NoteEvent[];
  beatMs: number;
  startAt?: number;
}): LickResult {
  const { expected, beatMs } = input;
  const played = noteOns(input.notes).slice(0, expected.length);
  const anchor = input.startAt ?? (played[0]?.at ?? 0) - (expected[0]?.startBeat ?? 0) * beatMs;
  const onTimeMs = Math.min(180, beatMs / 4);
  const right = expected.map(
    (e, i) => played[i] !== undefined && pc(played[i].midi) === pc(e.midi),
  );
  const matched = right.filter(Boolean).length;
  const onTime = expected.filter(
    (e, i) => right[i] && Math.abs(played[i].at - (anchor + e.startBeat * beatMs)) <= onTimeMs,
  ).length;
  const fretted = expected.map((e, i) => {
    const p = played[i];
    const measurable =
      e.string !== undefined &&
      p?.source === "onscreen" &&
      p.string !== undefined &&
      p.fret !== undefined;
    return measurable ? p.string === e.string && p.fret === e.fret : null;
  });
  const positionsMeasured =
    expected.some((e) => e.string !== undefined) && fretted.some((f) => f !== null);
  const wrongAt = right.indexOf(false);
  const firstWrong = wrongAt < 0 ? null : wrongAt;
  const start =
    firstWrong === null ? 0 : Math.max(0, Math.min(firstWrong - 1, expected.length - 4));
  const score = expected.length ? matched / expected.length : 0;
  return {
    score,
    correct: score >= 0.9,
    metrics: [
      ...expected.map((e, i) => ({
        kind: "pitch" as const,
        expectedMidi: e.midi,
        actualMidi: played[i]?.midi,
      })),
      ...expected.flatMap((e, i) =>
        played[i]
          ? [
              {
                kind: "timing" as const,
                expectedMs: anchor + e.startBeat * beatMs,
                actualMs: played[i].at,
                errorMs: played[i].at - (anchor + e.startBeat * beatMs),
              },
            ]
          : [],
      ),
    ],
    notMeasured: expected.some((e) => e.string !== undefined)
      ? notMeasured({ position: positionsMeasured })
      : [],
    matched,
    total: expected.length,
    onTime,
    positions: positionsMeasured ? fretted.filter((f) => f === true).length : null,
    firstWrong,
    practiceWindow: firstWrong === null ? null : [start, Math.min(expected.length, start + 4)],
  };
}

// ---------------------------------------------------------------------------
// Chord-scales.

export interface ChordScaleResult extends Graded {
  chords: { symbol: string; chord: number; scale: number; avoid: number; score: number }[];
  /** Chords with at least one note played. */
  graded: number;
}

/**
 * Each chord's notes are checked against its go-to scale: chord tones, other
 * scale tones, and avoid (outside) tones. A chord scores its in-scale fraction
 * (0 when nothing was played); correct when every chord was played and the mean is 0.9.
 */
export function gradeChordScales(
  chords: readonly {
    symbol: string;
    chordPcs: readonly number[];
    scalePcs: readonly number[];
    played: readonly number[];
  }[],
): ChordScaleResult {
  const rows = chords.map((c) => {
    const chord = c.played.filter((m) => c.chordPcs.includes(pc(m))).length;
    const scale = c.played.filter(
      (m) => !c.chordPcs.includes(pc(m)) && c.scalePcs.includes(pc(m)),
    ).length;
    const avoid = c.played.length - chord - scale;
    return {
      symbol: c.symbol,
      chord,
      scale,
      avoid,
      score: c.played.length ? (chord + scale) / c.played.length : 0,
    };
  });
  const graded = chords.filter((c) => c.played.length > 0).length;
  const score = mean(rows.map((r) => r.score));
  return {
    score,
    correct: graded === chords.length && chords.length > 0 && score >= 0.9,
    metrics: chords.map((c) => {
      const actual = pcSet(c.played);
      const scale = pcSet(c.scalePcs);
      return {
        kind: "chord" as const,
        expectedPcs: scale,
        actualPcs: actual,
        missing: scale.filter((p) => !actual.includes(p)),
        extra: actual.filter((p) => !scale.includes(p)),
      };
    }),
    notMeasured: [],
    chords: rows,
    graded,
  };
}

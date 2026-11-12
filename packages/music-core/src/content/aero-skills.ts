// Aerophone technique beyond the fingering lessons and breath holds (docs/
// research/pads-aerophone-gaps.md): timed scales and arpeggios in all twelve
// keys, tonguing patterns told apart by the breath, register crossings, trills,
// breath-level targets and bite vibrato. Written pitch, sax fingering mode.
// Thresholds are proposals to tune on the owner's AE-20.

import type { ControlEvent, NoteEvent } from "../types";
import { FLAT_NAMES, pc } from "../theory/notes";
import { AEROPHONE_RANGE, fingeringFor } from "./winds-pads";

// ---------------------------------------------------------------------------
// Scales and arpeggios, any key, inside the fingering chart.

export const AERO_SCALES: readonly {
  id: string;
  label: string;
  steps: readonly number[];
  /** Coming down, when it differs (melodic minor descends natural). */
  down?: readonly number[];
}[] = [
  { id: "major", label: "Major scale", steps: [0, 2, 4, 5, 7, 9, 11, 12] },
  { id: "natural-minor", label: "Natural minor scale", steps: [0, 2, 3, 5, 7, 8, 10, 12] },
  { id: "harmonic-minor", label: "Harmonic minor scale", steps: [0, 2, 3, 5, 7, 8, 11, 12] },
  { id: "chromatic", label: "Chromatic scale", steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
  { id: "major-arpeggio", label: "Major arpeggio", steps: [0, 4, 7, 12] },
  { id: "minor-arpeggio", label: "Minor arpeggio", steps: [0, 3, 7, 12] },
  {
    id: "melodic-minor",
    label: "Melodic minor scale",
    steps: [0, 2, 3, 5, 7, 9, 11, 12],
    down: [0, 2, 3, 5, 7, 8, 10, 12],
  },
  { id: "blues", label: "Blues scale", steps: [0, 3, 5, 6, 7, 10, 12] },
  { id: "minor-pentatonic", label: "Minor pentatonic scale", steps: [0, 3, 5, 7, 10, 12] },
];

/** Interval patterns through a scale (Klosé, the Universal Method), on its own notes. */
export const AERO_PATTERNS = [
  { id: "straight", label: "Straight up and down" },
  { id: "thirds", label: "In thirds" },
  { id: "1231", label: "1-2-3-1" },
  { id: "triads", label: "Broken triads" },
] as const;
/** Patterns only make sense on a seven-note scale. */
export const patternFits = (scaleId: string) =>
  ["major", "natural-minor", "harmonic-minor", "melodic-minor"].includes(scaleId);

/**
 * Minimum speeds from the New Zealand Music Examinations Board saxophone
 * syllabus: a crotchet click with one, two or four notes to it.
 */
export const AERO_GRADE_SPEEDS = [
  { id: "grade-1", label: "Grade 1: 100 BPM, a note a click", bpm: 100, perBeat: 1 },
  { id: "grade-3", label: "Grade 3: 72 BPM, two notes a click", bpm: 72, perBeat: 2 },
  { id: "grade-5", label: "Grade 5: 66 BPM, four notes a click", bpm: 66, perBeat: 4 },
] as const;

/** The lowest tonic of `pcOf` whose scale fits the chart, so every note has a fingering. */
export function scaleTonic(rootPc: number, top: number): number | null {
  for (let t = AEROPHONE_RANGE.lowestMidi; t <= AEROPHONE_RANGE.highestMidi; t++)
    if (pc(t) === pc(rootPc) && t + top <= AEROPHONE_RANGE.highestMidi) return t;
  return null;
}

/** A scale's steps over `octaves` octaves, the tonic on top once. */
const spanSteps = (steps: readonly number[], octaves: number) => [
  ...Array.from({ length: octaves }, (_, o) => steps.slice(0, -1).map((s) => s + 12 * o)).flat(),
  12 * octaves,
];

/**
 * Indexes of a pattern over a scale of `n` notes (tonic to tonic), up then
 * back down, as the books print them: thirds C E D F .. A C, then B G A F ..
 * E C; 1-2-3-1 C D E C .. A B C A, then C B A C .. E D C E, C; broken triads
 * C E G .. F A C, then B G E .. G E C.
 */
export function patternIndexes(pattern: string, n: number): number[] {
  const top = n - 1;
  const cell = (i: number, dir: 1 | -1) =>
    pattern === "1231"
      ? [i, i + dir, i + 2 * dir, i]
      : pattern === "thirds"
        ? [i, i + 2 * dir]
        : [i, i + 2 * dir, i + 4 * dir];
  const reach = pattern === "triads" ? 4 : 2;
  if (!["thirds", "1231", "triads"].includes(pattern) || top < reach)
    return [
      ...Array.from({ length: n }, (_, i) => i),
      ...Array.from({ length: top }, (_, i) => top - 1 - i),
    ];
  const out: number[] = [];
  for (let i = 0; i + reach <= top; i++) out.push(...cell(i, 1));
  for (let i = pattern === "1231" ? top : top - 1; i - reach >= 0; i--) out.push(...cell(i, -1));
  if (pattern === "1231") out.push(0);
  return out;
}

/**
 * Up and back down (the top note once), written pitch, over one or two
 * octaves, straight or in an interval pattern. Melodic minor comes down
 * natural (patterns use its rising form throughout).
 */
export function scaleLine(
  scaleId: string,
  rootPc: number,
  opts: { octaves?: number; pattern?: string } = {},
): number[] {
  const sc = AERO_SCALES.find((s) => s.id === scaleId) ?? AERO_SCALES[0];
  const octaves = opts.octaves === 2 ? 2 : 1;
  const steps = spanSteps(sc.steps, octaves);
  const tonic = scaleTonic(rootPc, steps.at(-1)!);
  if (tonic === null) return [];
  const up = steps.map((s) => tonic + s);
  const pattern = opts.pattern && patternFits(sc.id) ? opts.pattern : "straight";
  if (pattern !== "straight") return patternIndexes(pattern, up.length).map((i) => up[i]);
  const down = sc.down ? spanSteps(sc.down, octaves).map((s) => tonic + s) : up;
  return [...up, ...down.slice(0, -1).reverse()];
}
export const keyName = (rootPc: number) => FLAT_NAMES[pc(rootPc)];

// ---------------------------------------------------------------------------
// Tonguing: which notes start with the tongue (a fresh attack) and which are
// slurred from the one before. The Aerophone ends a note when the breath falls
// under its threshold, so a tongued note shows as a dip in CC 2 (or a gap
// between notes); a slurred one changes key with the breath still going.

export const TONGUING = [
  { id: "all-tongued", label: "Every note tongued", group: "TTTT" },
  { id: "all-slurred", label: "All slurred", group: "TSSS" },
  { id: "slur2-tongue2", label: "Slur two, tongue two", group: "TSTT" },
  { id: "tongue2-slur2", label: "Tongue two, slur two", group: "TTTS" },
  { id: "slur3-tongue1", label: "Slur three, tongue one", group: "TSST" },
  { id: "phrase", label: "Phrase: slur eight, breathe", group: "TSSSSSSS" },
] as const;

/** "T" (tongued) or "S" (slurred) for each note of a line of `n` notes. */
export const tonguingMarks = (id: string, n: number) => {
  const g = (TONGUING.find((t) => t.id === id) ?? TONGUING[0]).group;
  return Array.from({ length: n }, (_, i) => g[i % g.length] as "T" | "S");
};

export const JOIN = {
  /** A breath dip under this share of the phrase's median breath is a tongue stop. */
  dip: 0.45,
  /** Or the previous note released this long before the next began. */
  gapMs: 25,
} as const;

/**
 * How each played note began: "T" with a fresh attack (a breath dip between it
 * and the note before, or a gap after the last note-off), "S" slurred. The
 * first note is always "T". Breath may be empty (MIDI without CC 2): then only
 * gaps count.
 */
export function joinTypes(
  notes: readonly NoteEvent[],
  breath: readonly ControlEvent[],
): ("T" | "S")[] {
  const ons = notes.filter((n) => n.kind === "noteon").sort((a, b) => a.at - b.at);
  const offs = notes.filter((n) => n.kind === "noteoff").sort((a, b) => a.at - b.at);
  const b = breath.filter((c) => c.kind === "cc" && c.controller === 2).sort((x, y) => x.at - y.at);
  const sorted = b.map((c) => c.value).sort((x, y) => x - y);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  return ons.map((on, i) => {
    if (i === 0) return "T";
    const prev = ons[i - 1];
    const released = offs.some(
      (o) => o.midi === prev.midi && o.at >= prev.at && o.at <= on.at - JOIN.gapMs,
    );
    const dipped =
      median > 0 && b.some((c) => c.at > prev.at && c.at < on.at && c.value < median * JOIN.dip);
    return released || dipped ? "T" : "S";
  });
}

/**
 * The line's grade with the tonguing folded in, half and half. Without breath
 * (CC 2) the joins are read from gaps alone, which is a guess: then the
 * tonguing is not measured and the line's grade stands on its own.
 */
export function tonguingVerdict(
  line: { score: number; correct: boolean },
  tonguing: number,
  breathSeen: boolean,
) {
  if (!breathSeen) return { score: line.score, correct: line.correct };
  return { score: line.score * 0.5 + tonguing * 0.5, correct: line.correct && tonguing >= 0.8 };
}

/** Share of joins (after the first note) that matched the pattern. */
export function tonguingScore(want: readonly ("T" | "S")[], got: readonly ("T" | "S")[]) {
  const n = Math.min(want.length, got.length);
  let right = 0;
  for (let i = 1; i < n; i++) if (want[i] === got[i]) right++;
  return n > 1 ? right / (n - 1) : 0;
}

// ---------------------------------------------------------------------------
// Register crossings: the octave keys and the palm keys are the hurdle
// (Patchman); pairs across the break, played back and forth.

export const REGISTER_PAIRS = [
  { id: "cs5-d5", label: "C#5 to D5", detail: "all open to the octave key", notes: [73, 74] },
  { id: "c5-d5", label: "C5 to D5", detail: "", notes: [72, 74] },
  { id: "a4-d5", label: "A4 to D5", detail: "", notes: [69, 74] },
  { id: "d4-d5", label: "D4 to D5", detail: "the octave key alone", notes: [62, 74] },
  { id: "g4-g5", label: "G4 to G5", detail: "the octave key alone", notes: [67, 79] },
  { id: "b4-e5", label: "B4 to E5", detail: "", notes: [71, 76] },
  // The pinky table: the left little finger sliding between its keys.
  { id: "cs4-b3", label: "C#4 to B3", detail: "left pinky, C# to B", notes: [61, 59] },
  { id: "b3-bb3", label: "B3 to Bb3", detail: "left pinky, B to Bb", notes: [59, 58] },
  { id: "eb4-c4", label: "Eb4 to C4", detail: "right pinky, Eb to C", notes: [63, 60] },
  // Into and out of the palm keys.
  { id: "cs6-d6", label: "C#6 to D6", detail: "open to the first palm key", notes: [85, 86] },
  { id: "b5-d6", label: "B5 to D6", detail: "", notes: [83, 86] },
  { id: "d6-f6", label: "D6 to F6", detail: "palm keys stacking up", notes: [86, 89] },
] as const;
export const crossingLine = (id: string, notes = 16) => {
  const p = REGISTER_PAIRS.find((x) => x.id === id) ?? REGISTER_PAIRS[0];
  return Array.from({ length: notes }, (_, i) => p.notes[i % 2]);
};

/** Notes heard that weren't either target: the glitches a crossing makes between fingerings. */
export const glitches = (notes: readonly NoteEvent[], wanted: readonly number[]) =>
  notes.filter((n) => n.kind === "noteon" && !wanted.includes(n.midi)).length;

// ---------------------------------------------------------------------------
// Trills: two fingerings back and forth as fast and even as you can.

export const TRILL_PAIRS = [
  { id: "g4-a4", label: "G4 A4", detail: "ring finger", notes: [67, 69] },
  { id: "a4-b4", label: "A4 B4", detail: "middle finger", notes: [69, 71] },
  { id: "f4-g4", label: "F4 G4", detail: "index finger, right hand", notes: [65, 67] },
  { id: "b4-c5", label: "B4 C5", detail: "across the left hand", notes: [71, 72] },
  { id: "c5-d5", label: "C5 D5", detail: "across the break", notes: [72, 74] },
  { id: "e4-fs4", label: "E4 F#4", detail: "", notes: [64, 66] },
] as const;
export const TRILL_SECONDS = 4;

/**
 * A trill: notes a second, evenness (1 minus the spread of the gaps over
 * their mean), and stray notes; it counts once at least 4 notes a second are
 * even to 0.7 or better with no strays (proposals).
 */
export function gradeTrill(notes: readonly NoteEvent[], pair: readonly number[]) {
  const ons = notes.filter((n) => n.kind === "noteon").sort((a, b) => a.at - b.at);
  const inPair = ons.filter((n) => pair.includes(n.midi));
  const strays = ons.length - inPair.length;
  if (inPair.length < 3) return { perSecond: 0, evenness: 0, strays, score: 0, correct: false };
  const gaps = inPair.slice(1).map((n, i) => n.at - inPair[i].at);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const sd = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length);
  const evenness = Math.max(0, Math.min(1, 1 - sd / mean));
  const perSecond = 1000 / mean;
  const score = Math.min(1, perSecond / 8) * 0.4 + evenness * 0.5 + (strays ? 0 : 0.1);
  return {
    perSecond,
    evenness,
    strays,
    score,
    correct: perSecond >= 4 && evenness >= 0.7 && strays === 0,
  };
}

// ---------------------------------------------------------------------------
// Breath-level targets: hold a dynamic, not just a steady note.

export const BREATH_LEVELS = [
  { id: "pp", label: "pp (very soft)", band: [0.1, 0.28] },
  { id: "p", label: "p (soft)", band: [0.25, 0.42] },
  { id: "mf", label: "mf (moderately loud)", band: [0.45, 0.65] },
  { id: "f", label: "f (loud)", band: [0.65, 0.85] },
] as const;

/** Share of breath samples inside the band while the note sounded. */
export function inBandShare(values: readonly number[], band: readonly [number, number]) {
  return values.length
    ? values.filter((v) => v >= band[0] && v <= band[1]).length / values.length
    : 0;
}

// ---------------------------------------------------------------------------
// Bite vibrato: pulses a beat at a tempo (Larry Teal's going rate is four a
// beat at 80 to 84); the bite reaches MIDI as pitch bend.

export const VIBRATO_SETS = [
  { id: "2-at-60", label: "Two a beat at 60", pulses: 2, bpm: 60 },
  { id: "3-at-60", label: "Three a beat at 60", pulses: 3, bpm: 60 },
  { id: "4-at-60", label: "Four a beat at 60", pulses: 4, bpm: 60 },
  { id: "4-at-80", label: "Four a beat at 80 (the going rate)", pulses: 4, bpm: 80 },
] as const;
export const VIBRATO = { rateTolerance: 0.15, evenness: 0.6, seconds: 4 } as const;

/** A wobble's cycles a second, how even, and how deep (in bend units 0..1), from pitch-bend values. */
export function bendWobble(points: readonly { at: number; value: number }[], minMs = 1000) {
  const p = [...points].sort((a, b) => a.at - b.at);
  if (p.length < 8 || p.at(-1)!.at - p[0].at < minMs) return null;
  const centre = p.reduce((a, x) => a + x.value, 0) / p.length;
  const crossings: number[] = [];
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1].value - centre;
    const b = p[i].value - centre;
    if (a !== 0 && Math.sign(a) !== Math.sign(b))
      crossings.push(
        p[i - 1].at + ((p[i].at - p[i - 1].at) * Math.abs(a)) / (Math.abs(a) + Math.abs(b)),
      );
  }
  const vals = p.map((x) => x.value).sort((a, b) => a - b);
  const depth = (vals[Math.floor(vals.length * 0.95)] - vals[Math.floor(vals.length * 0.05)]) / 2;
  if (crossings.length < 3 || depth < 0.01) return { rateHz: null, evenness: null, depth };
  const halves = crossings.slice(1).map((t, i) => t - crossings[i]);
  const m = halves.reduce((a, b) => a + b, 0) / halves.length;
  const sd = Math.sqrt(halves.reduce((a, h) => a + (h - m) ** 2, 0) / halves.length);
  return { rateHz: 1000 / (2 * m), evenness: Math.max(0, 1 - sd / m), depth };
}

/** The slip a played note probably came from, when it's the target an octave off. */
export const octaveSlip = (target: number, played: number) =>
  Math.abs(played - target) === 12 && fingeringFor(target)
    ? played > target
      ? "the octave key was down"
      : "the octave key was up"
    : null;

// ---------------------------------------------------------------------------
// Swing articulation (Niehaus, "doo-DAH"): eighths swung long-short, each
// off-beat tongued and slurred into the next beat. The off-beat's place in
// the beat is the swing: 0.5 is straight, 0.67 a triplet feel (2:1).

export const SWING = {
  /** Full credit for an off-beat this far through the beat. */
  full: [0.6, 0.71],
  /** No credit at or beyond these (straight, or dotted-eighth-sixteenth). */
  zero: [0.5, 0.8],
  /** Where the demo and the guide put the off-beat. */
  ideal: 2 / 3,
} as const;

/** Doo-DAH: the first note and every off-beat tongued, each beat slurred into from the off-beat. */
export const swingMarks = (n: number) =>
  Array.from({ length: n }, (_, i) => (i === 0 || i % 2 === 1 ? "T" : "S") as "T" | "S");

/** Credit for one off-beat's place in the beat. */
export function swingCredit(frac: number) {
  const [lo, hi] = SWING.full;
  const [z0, z1] = SWING.zero;
  if (frac >= lo && frac <= hi) return 1;
  if (frac <= z0 || frac >= z1) return 0;
  return frac < lo ? (frac - z0) / (lo - z0) : (z1 - frac) / (z1 - hi);
}

export interface SwingResult {
  score: number;
  correct: boolean;
  /** Line notes played at the right pitch, near their slot. */
  pitch: number;
  /** Mean place of the off-beats in the beat (0.5 straight, 0.67 two to one), null with none paired. */
  frac: number | null;
  /** Credit for the swing, 0..1. */
  swing: number;
  /** Doo-DAH joins as marked, null when no breath arrived. */
  articulation: number | null;
  joins: ("T" | "S")[];
}

/**
 * A swung line: note i sits on beat floor(i / 2), the odd ones late in the
 * beat. Each target takes the first unused onset of its pitch within half a
 * beat of its swung slot. Score: pitch 0.4, swing 0.3, articulation 0.3; with
 * no breath the articulation is not measured and pitch 0.55, swing 0.45.
 * Correct at 0.8 with pitch 0.9, swing 0.6 and, when measured, joins 0.8.
 */
export function gradeSwing(input: {
  line: readonly number[];
  beatMs: number;
  downbeat: number;
  notes: readonly NoteEvent[];
  breath: readonly ControlEvent[];
}): SwingResult {
  const { line, beatMs, downbeat } = input;
  const ons = input.notes.filter((n) => n.kind === "noteon").sort((a, b) => a.at - b.at);
  const used = new Set<number>();
  const hit = line.map((midi, i) => {
    const slot = downbeat + Math.floor(i / 2) * beatMs + (i % 2 ? SWING.ideal * beatMs : 0);
    const k = ons.findIndex(
      (n, j) => !used.has(j) && n.midi === midi && Math.abs(n.at - slot) <= beatMs / 2,
    );
    if (k === -1) return null;
    used.add(k);
    return ons[k].at;
  });
  const pitch = line.length ? hit.filter((h) => h !== null).length / line.length : 0;
  const fracs: number[] = [];
  for (let i = 1; i < line.length; i += 2)
    if (hit[i - 1] !== null && hit[i] !== null) fracs.push((hit[i]! - hit[i - 1]!) / beatMs);
  const frac = fracs.length ? fracs.reduce((a, b) => a + b, 0) / fracs.length : null;
  const swing = fracs.length ? fracs.reduce((a, f) => a + swingCredit(f), 0) / fracs.length : 0;
  const breathSeen = input.breath.some((c) => c.kind === "cc" && c.controller === 2);
  const joins = joinTypes(input.notes, input.breath);
  const articulation = breathSeen ? tonguingScore(swingMarks(line.length), joins) : null;
  const score = ons.length
    ? articulation === null
      ? pitch * 0.55 + swing * 0.45
      : pitch * 0.4 + swing * 0.3 + articulation * 0.3
    : 0;
  return {
    score,
    correct:
      score >= 0.8 &&
      pitch >= 0.9 &&
      swing >= 0.6 &&
      (articulation === null || articulation >= 0.8),
    pitch,
    frac,
    swing,
    articulation,
    joins,
  };
}

// ---------------------------------------------------------------------------
// Long-tone scale: each note of a scale held four beats at one level.

export const LONG_SCALE_BEATS = 4;

/** Share of breath samples in the band from the first note to the end, or null with none. */
export function heldBand(
  breath: readonly ControlEvent[],
  band: readonly [number, number],
  from: number,
  to: number,
) {
  const v = breath
    .filter((c) => c.kind === "cc" && c.controller === 2 && c.at >= from && c.at <= to)
    .map((c) => c.value);
  return v.length ? inBandShare(v, band) : null;
}

// ---------------------------------------------------------------------------
// Set-up check: is the AE-20 sending what the app reads, and does the breath
// reach from p to f without clipping?

/** The reading keys the AE-20's transpose can match: semitones from written to concert. */
const KEY_FOR_GAP: Record<number, "C" | "Eb" | "Bb"> = { 0: "C", 9: "Eb", 14: "Bb" };

export interface CalibrationResult {
  score: number;
  correct: boolean;
  /** The written note asked for came in as the concert note the reading key expects. */
  keyOk: boolean;
  /** When it did not: the reading key that would match what arrived, if any. */
  keyFits: "C" | "Eb" | "Bb" | null;
  breathSeen: boolean;
  /** Median breath of the softest note, and whether it sits at p or under. */
  floor: number | null;
  floorOk: boolean;
  /** 95th percentile of the loudest note, and whether it reaches f without clipping. */
  ceiling: number | null;
  clipped: number;
  ceilingOk: boolean;
}

const quantile = (v: readonly number[], q: number) => {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

/**
 * Four checks, a quarter each: the key (written G4 arrives as 67 minus the
 * reading key's offset), CC 2 arrives, the softest held note sits at p or
 * under (median 0.05 to 0.42), the loudest reaches f (0.65) with no more than
 * a tenth of it pinned at the top. Thresholds are the BREATH_LEVELS bands.
 */
export function gradeCalibration(input: {
  writtenTarget: number;
  /** Semitones from concert to written in the app's reading key. */
  shift: number;
  received: number | null;
  soft: readonly number[];
  loud: readonly number[];
}): CalibrationResult {
  const { writtenTarget, shift, received } = input;
  const keyOk = received !== null && received + shift === writtenTarget;
  const keyFits =
    received === null || keyOk ? null : (KEY_FOR_GAP[writtenTarget - received] ?? null);
  const breathSeen = input.soft.length + input.loud.length > 0;
  const floor = input.soft.length ? quantile(input.soft, 0.5) : null;
  const floorOk = floor !== null && floor >= 0.05 && floor <= BREATH_LEVELS[1].band[1];
  const ceiling = input.loud.length ? quantile(input.loud, 0.95) : null;
  const clipped = input.loud.length
    ? input.loud.filter((v) => v >= 0.99).length / input.loud.length
    : 0;
  const ceilingOk = ceiling !== null && ceiling >= BREATH_LEVELS[3].band[0] && clipped <= 0.1;
  const passes = [keyOk, breathSeen, floorOk, ceilingOk].filter(Boolean).length;
  return {
    score: passes / 4,
    correct: passes === 4,
    keyOk,
    keyFits,
    breathSeen,
    floor,
    floorOk,
    ceiling,
    clipped,
    ceilingOk,
  };
}

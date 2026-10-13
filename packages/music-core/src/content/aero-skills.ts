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

export const AERO_SCALES = [
  { id: "major", label: "Major scale", steps: [0, 2, 4, 5, 7, 9, 11, 12] },
  { id: "natural-minor", label: "Natural minor scale", steps: [0, 2, 3, 5, 7, 8, 10, 12] },
  { id: "harmonic-minor", label: "Harmonic minor scale", steps: [0, 2, 3, 5, 7, 8, 11, 12] },
  { id: "chromatic", label: "Chromatic scale", steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
  { id: "major-arpeggio", label: "Major arpeggio", steps: [0, 4, 7, 12] },
  { id: "minor-arpeggio", label: "Minor arpeggio", steps: [0, 3, 7, 12] },
] as const;

/**
 * Minimum speeds from the New Zealand Music Examinations Board saxophone
 * syllabus: a crotchet click with one, two or four notes to it.
 */
export const AERO_GRADE_SPEEDS = [
  { id: "grade-1", label: "Grade 1: 100, a note a click", bpm: 100, perBeat: 1 },
  { id: "grade-3", label: "Grade 3: 72, two notes a click", bpm: 72, perBeat: 2 },
  { id: "grade-5", label: "Grade 5: 66, four notes a click", bpm: 66, perBeat: 4 },
] as const;

/** The lowest tonic of `pcOf` whose scale fits the chart, so every note has a fingering. */
export function scaleTonic(rootPc: number, top: number): number | null {
  for (let t = AEROPHONE_RANGE.lowestMidi; t <= AEROPHONE_RANGE.highestMidi; t++)
    if (pc(t) === pc(rootPc) && t + top <= AEROPHONE_RANGE.highestMidi) return t;
  return null;
}

/** Up and back down (the top note once), written pitch. */
export function scaleLine(scaleId: string, rootPc: number): number[] {
  const sc = AERO_SCALES.find((s) => s.id === scaleId) ?? AERO_SCALES[0];
  const tonic = scaleTonic(rootPc, sc.steps.at(-1)!);
  if (tonic === null) return [];
  const up = sc.steps.map((s) => tonic + s);
  return [...up, ...up.slice(0, -1).reverse()];
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
export function bendWobble(points: readonly { at: number; value: number }[]) {
  const p = [...points].sort((a, b) => a.at - b.at);
  if (p.length < 8 || p.at(-1)!.at - p[0].at < 1000) return null;
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

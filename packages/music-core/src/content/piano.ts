// Piano content: two-hand patterns, comping, ii-V-I voicings, voice leading,
// licks and the chord-scale drill.

import {
  COMPING,
  JAZZ,
  SCALE_DATA,
  TWO_HAND,
  type ChordScaleRow,
  type HandMode,
  type TwoHandPatternId,
  type TwoHandRendering,
  type TwoHandTargetEvent,
  type VoicingTarget,
} from "../data";
import type { Score, ScoreNote } from "../types";
import { FLAT_NAMES, pc, pcOf } from "../theory/notes";
import { parseChordSymbol, toneRoles, transposeSymbol, type ToneRole } from "../theory/chords";
import { scaleSemitones } from "../theory/scales";

// ---------------------------------------------------------------------------
// Two-hand independence

export const TWO_HAND_TONICS = [
  { name: "C4", midi: 60 },
  { name: "G4", midi: 67 },
  { name: "F4", midi: 65 },
  { name: "D4", midi: 62 },
];
export const TWO_HAND_TEMPOS = [60, 80, 100, 120];
export const TWO_HAND_DEFAULTS = {
  tempo: 80,
  pattern: "lh-pulse-rh-line" as TwoHandPatternId,
  handMode: "both" as HandMode,
};
export const TWO_HAND_PATTERNS = TWO_HAND.options;
export const TWO_HAND_MODES = TWO_HAND.handModes;

const {
  majorSteps,
  leftShell,
  rightFragment,
  alberti,
  holds,
  mirrorLeftSteps,
  mirrorRightSteps,
  mirrorFingers,
} = TWO_HAND;
/** Up the major ladder and back, repeating the ends: 0..6, 6..0, 0.. */
const ladder = (i: number) => majorSteps[i % 14 < 7 ? i % 14 : 13 - (i % 14)];
/** The same ladder mirrored downward from the octave, staying in key. */
const ladderDown = (i: number) => {
  const k = i % 14 < 7 ? i % 14 : 13 - (i % 14);
  return k === 0 ? 0 : majorSteps[7 - k] - 12;
};

/**
 * Target events for a pattern. The accompaniment sits two octaves below the
 * tonic, except Mirror hands (thumbs an octave apart). Hands split by register
 * at floor((lhRoot + rhRoot) / 2).
 */
export function twoHandPattern(opts: {
  pattern: TwoHandPatternId;
  tonic: number;
  bars: number;
  handMode: HandMode;
}): TwoHandRendering {
  const { pattern, tonic } = opts;
  const beats = opts.bars * 4;
  const mirror = pattern === "contrary-five";
  const lhRoot = tonic - (mirror ? 12 : 24);
  const perBeat = (fn: (b: number) => number) =>
    Array.from({ length: beats }, (_, b) => ({ beat: b, midi: fn(b) }));
  const perEighth = (fn: (e: number) => number) =>
    Array.from({ length: beats * 2 }, (_, e) => ({ beat: e / 2, midi: fn(e) }));
  const lines: Record<
    TwoHandPatternId,
    [left: { beat: number; midi: number }[], right: { beat: number; midi: number }[]]
  > = {
    "lh-pulse-rh-line": [perBeat(() => lhRoot), perEighth((e) => tonic + ladder(e))],
    "rh-pulse-lh-line": [perEighth((e) => lhRoot + ladder(e)), perBeat(() => tonic)],
    "lh-shell-rh-line": [
      perBeat((b) => lhRoot + leftShell[b % 4]),
      perEighth((e) => tonic + rightFragment[e % 8]),
    ],
    "alberti-rh-holds": [
      perEighth((e) => lhRoot + alberti[e % 4]),
      perBeat((b) => tonic + holds[b % 4]),
    ],
    "contrary-motion-scale": [
      perEighth((e) => lhRoot + ladder(e)),
      perEighth((e) => tonic + 12 + ladderDown(e)),
    ],
    "contrary-five": [
      perBeat((b) => lhRoot + mirrorLeftSteps[b % 8]),
      perBeat((b) => tonic + mirrorRightSteps[b % 8]),
    ],
  };
  const [left, right] = lines[pattern];
  const events: TwoHandTargetEvent[] = [
    ...left.map((n) => ({ hand: "left" as const, midiNote: n.midi, beat: n.beat })),
    ...right.map((n) => ({ hand: "right" as const, midiNote: n.midi, beat: n.beat })),
  ]
    .map((e) => (mirror ? { ...e, finger: mirrorFingers[e.beat % 8] } : e))
    .sort((a, b) => a.beat - b.beat || (a.hand === "left" ? -1 : 1))
    .filter((e) => opts.handMode === "both" || e.hand === opts.handMode);
  return {
    patternKind: pattern,
    patternLabel: TWO_HAND.options.find((o) => o.id === pattern)!.label,
    splitMidi: Math.floor((lhRoot + tonic) / 2),
    measuresTogether: mirror,
    melodyHand: pattern === "rh-pulse-lh-line" ? "left" : "right",
    togetherWindowMs: SCALE_DATA.togetherWindowMs,
    targetEvents: events,
  };
}

export const twoHandSkills = (pattern: TwoHandPatternId) =>
  pattern === "lh-shell-rh-line"
    ? ["technique.piano.two-hand-independence", "technique.piano.independence.shell-line"]
    : ["technique.piano.two-hand-independence"];

// ---------------------------------------------------------------------------
// Comping (blue third over a shell: C7, then F7 and G7)

export const COMPING_PATTERNS = COMPING.patterns;

/** A comping pattern as a Score: the lick in the right hand, the shell on the comp rhythm in every bar. */
export function compingScore(id: string, bpm?: number): Score {
  const p = COMPING.patterns.find((x) => x.id === id) ?? COMPING.patterns[0];
  const root = parseChordSymbol(p.chord)!.rootPc;
  const lh: ScoreNote[] = Array.from({ length: p.bars }, (_, bar) =>
    p.compRhythm.flatMap((hit) =>
      p.shellMidi.map((midi) => ({
        midi,
        startBeat: bar * 4 + hit.beat,
        durationBeats: hit.durationBeats,
      })),
    ),
  ).flat();
  return {
    id: `comping-${p.id}`,
    title: p.label,
    bpm: bpm ?? p.bpm,
    meter: { beats: 4, beatUnit: 4 },
    // ponytail: key signature of the chord root's major key (C 0, F -1, G 1); the blues notes stay accidentals.
    keyFifths: [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5][root],
    keyMode: "major",
    voices: [
      {
        id: COMPING.rightHandVoice,
        name: "Right hand",
        clef: "treble",
        hand: "right",
        notes: p.lick.map((n) => ({
          midi: n.midiNote,
          startBeat: n.startBeat,
          durationBeats: n.durationBeats,
          finger: n.finger,
        })),
      },
      { id: COMPING.leftHandVoice, name: "Left hand", clef: "bass", hand: "left", notes: lh },
    ],
    lengthBeats: p.bars * 4,
    chords: [{ symbol: p.chord, startBeat: 0, durationBeats: p.bars * 4 }],
    source: { kind: "generated" },
  };
}

// ---------------------------------------------------------------------------
// ii-V-I voicings

export const KEY_CYCLE = JAZZ.TWELVE_KEY_CYCLE;
export type VoicingVariant = "major" | "minor" | "altered";
type Position = "A" | "B";

/** Rootless A = 3 5 7 9, B = 7 9 3 5 (3rd and 5th up an octave), from a chord's 3rd, 5th and 7th. */
function rootless([third, fifth, seventh]: number[], position: Position): number[] {
  return position === "A" ? [third, fifth, seventh, 14] : [seventh, 14, third + 12, fifth + 12];
}
const TONES: Record<string, number[]> = {
  m7: [3, 7, 10],
  "7": [4, 7, 10],
  maj7: [4, 7, 11],
};
const dominant = (id: string) => JAZZ.DOMINANT_VOICINGS.find((v) => v.id === id)!.offsets;

function voicingTarget(
  key: string,
  symbol: string,
  root: number,
  offsets: number[],
  skillIds: string[],
  mode: VoicingTarget["mode"],
): VoicingTarget {
  const displayMidi = [root, ...offsets.filter((o) => o !== 0).map((o) => root + o)];
  return {
    id: `${key}-${symbol}`,
    skillIds,
    symbol,
    expectedPitchClasses: [...new Set(displayMidi.map(pc))],
    expectedBassPc: pc(root),
    mode,
    displayMidi,
  };
}

/**
 * The drill's targets through the 12-key cycle, root in the left hand (shown first).
 * Tonic = 60 + key; ii = tonic + 2, V = tonic + 7, I = tonic.
 * - major: rootless ii-V-I, positions A-B-A (or B-A-B).
 * - minor: iiø7 rootless A (b3 b5 b7 1), V7alt (7 b9 3 b13), i-m7 rootless B.
 * - altered: V7b9 (3 7 b9 5), V7alt, then the II-major upper structure over a 1 3 7 shell.
 */
export function voicingTargets(opts: {
  variant: VoicingVariant;
  startPosition?: Position;
  mode?: VoicingTarget["mode"];
}): VoicingTarget[] {
  const mode = opts.mode ?? "chord";
  const skills = ["harmony.ii-v-i", `harmony.ii-v-i.voicings.${opts.variant}`];
  const [p1, p2]: Position[] = opts.startPosition === "B" ? ["B", "A"] : ["A", "B"];
  return KEY_CYCLE.flatMap((key) => {
    const tonic = 60 + pcOf(key)!;
    const ii = tonic + 2;
    const v = tonic + 7;
    const name = (m: number) => FLAT_NAMES[pc(m)];
    const t = (symbol: string, root: number, offsets: number[]) =>
      voicingTarget(key, symbol, root, offsets, skills, mode);
    if (opts.variant === "major")
      return [
        t(`${name(ii)}m7`, ii, rootless(TONES.m7, p1)),
        t(`${name(v)}7`, v, rootless(TONES["7"], p2)),
        t(`${key}maj7`, tonic, rootless(TONES.maj7, p1)),
      ];
    if (opts.variant === "minor")
      return [
        // iiø7 rootless A as b3 b5 b7 1 (Dm7b5: F Ab C D): a natural 9 (E) would clash
        // with the minor key's b3 (Eb), so the root takes the 9th's place on top.
        t(`${name(ii)}m7b5`, ii, [3, 6, 10, 12]),
        t(`${name(v)}7alt`, v, dominant("altered")),
        t(`${key}m7`, tonic, rootless(TONES.m7, "B")),
      ];
    const us = JAZZ.UPPER_STRUCTURES.find((u) => u.id === "us-II")!;
    const triad = (us.quality === "maj" ? [0, 4, 7] : [0, 3, 7]).map((o) => 12 + us.triadRoot + o);
    return [
      t(`${name(v)}7b9`, v, dominant("rootlessB9")),
      t(`${name(v)}7alt`, v, dominant("altered")),
      t(`${name(v)}13#11`, v, [0, 4, 10, ...triad]),
    ];
  });
}

// ---------------------------------------------------------------------------
// Voice leading

/** "Closest chords" accepts a total movement within this many semitones of the minimum. */
export const CLOSEST_TOLERANCE = 2;

/**
 * The placement of `pcs` inside `register` (one hand: span <= an octave) that moves
 * least from `from`, voices paired low to high. Ties go to the lower placement.
 */
export function nearestVoicing(from: number[], pcs: number[], register: [number, number]) {
  const placements = pcs.map((p) => {
    const out: number[] = [];
    for (let m = register[0]; m <= register[1]; m++) if (pc(m) === pc(p)) out.push(m);
    return out;
  });
  const combos = placements.reduce<number[][]>(
    (acc, opts) => acc.flatMap((c) => opts.map((m) => [...c, m])),
    [[]],
  );
  const src = [...from].sort((a, b) => a - b);
  let best: { midi: number[]; movement: number } | undefined;
  for (const c of combos) {
    const midi = [...c].sort((a, b) => a - b);
    if (new Set(midi).size !== midi.length || midi[midi.length - 1] - midi[0] > 12) continue;
    const movement = midi.reduce((s, m, i) => s + Math.abs(m - src[i]), 0);
    const lower =
      best &&
      movement === best.movement &&
      midi.reduce((a, b) => a + b) < best.midi.reduce((a, b) => a + b);
    if (!best || movement < best.movement || lower) best = { midi, movement };
  }
  return best!;
}

export interface VoiceLeadingTarget {
  id: string;
  symbol: string;
  skillIds: string[];
  /** The guide tones (3rd, 7th) to find. */
  pcs: number[];
  fromMidi: number[];
  targetMidi: number[];
  register: [number, number];
  minimumSemitones: number;
}

/**
 * Inversions / voice-leading variant: through the 12-key ii-V-I chain, find each
 * next chord's 3rd and 7th with the least total movement inside the register.
 * The first chord (Dm7) is given, placed nearest the register's middle.
 */
export function voiceLeadingTargets(register: [number, number] = [53, 72]): VoiceLeadingTarget[] {
  const symbols = KEY_CYCLE.flatMap((key) => {
    const t = pcOf(key)!;
    return [`${FLAT_NAMES[pc(t + 2)]}m7`, `${FLAT_NAMES[pc(t + 7)]}7`, `${key}maj7`];
  });
  const guide = (s: string) => {
    const c = parseChordSymbol(s)!;
    return [
      c.intervals.find((i) => i === 3 || i === 4)!,
      c.intervals.find((i) => i === 10 || i === 11)!,
    ].map((i) => pc(c.rootPc + i));
  };
  const mid = Math.round((register[0] + register[1]) / 2);
  let current = nearestVoicing([mid, mid], guide(symbols[0]), register).midi;
  return symbols.slice(1).map((symbol, i) => {
    const pcs = guide(symbol);
    const next = nearestVoicing(current, pcs, register);
    const target: VoiceLeadingTarget = {
      id: `voice-leading-${i + 1}-${symbol}`,
      symbol,
      skillIds: ["harmony.ii-v-i", "harmony.ii-v-i.voice-leading"],
      pcs,
      fromMidi: current,
      targetMidi: next.midi,
      register,
      minimumSemitones: next.movement,
    };
    current = next.midi;
    return target;
  });
}

export interface ClosestChordBar {
  id: string;
  bar: number;
  symbol: string;
  rightHand: number[];
  leftHand: number;
  /** 0 root, 1 first, 2 second inversion. */
  inversion: number;
  /** Lowest right-hand pitch class. */
  expectedBassPc: number;
  /** Semitones moved from the previous bar (0 for bar 1). */
  movement: number;
}

/**
 * Piano path "Closest chords": I IV V I, one chord per bar, the right hand moving
 * least from a root-position I, the left hand on roots (F2..E3).
 */
export function closestChords(keyPc = 0, register: [number, number] = [55, 76]): ClosestChordBar[] {
  const tonic = 60 + pc(keyPc);
  let rh = [tonic, tonic + 4, tonic + 7];
  return [0, 5, 7, 0].map((degree, bar) => {
    const root = pc(keyPc + degree);
    const pcs = [root, root + 4, root + 7].map(pc);
    const next = bar === 0 ? { midi: rh, movement: 0 } : nearestVoicing(rh, pcs, register);
    rh = next.midi;
    return {
      id: `closest-${FLAT_NAMES[pc(keyPc)]}-${bar + 1}`,
      bar: bar + 1,
      symbol: FLAT_NAMES[root],
      rightHand: rh,
      leftHand: 36 + pc(root - 5) + 5,
      inversion: pcs.indexOf(pc(rh[0])),
      expectedBassPc: pc(rh[0]),
      movement: next.movement,
    };
  });
}

export interface CadenceChord extends ClosestChordBar {
  /** Roman numeral, I IV I V7 I (major) or i iv i V7 i (minor). */
  roman: string;
}

/** A progression to voice: [roman numeral, scale degree in semitones, chord intervals]. */
type Plan = [string, number, number[]][];

/**
 * Chords through `plan` in a key, the root in the left hand (F2..E3) and three
 * notes in the right moving the shortest way from a root-position tonic.
 */
function voiceLed(
  keyPc: number,
  plan: Plan,
  prefix: string,
  register: [number, number],
): CadenceChord[] {
  const tonic = register[0] + pc(keyPc - register[0]);
  let rh: number[] = [];
  return plan.map(([roman, degree, iv], bar) => {
    const root = pc(keyPc + degree);
    const pcs = iv.map((i) => pc(root + i));
    const next =
      bar === 0
        ? { midi: iv.map((i) => tonic + i), movement: 0 }
        : nearestVoicing(rh, pcs, register);
    rh = next.midi;
    const lowest = pc(rh[0] - root);
    const quality = roman === "V7" ? "7" : iv[1] === 3 ? "m" : "";
    return {
      id: `${prefix}-${FLAT_NAMES[pc(keyPc)]}-${bar + 1}`,
      bar: bar + 1,
      roman,
      symbol: `${FLAT_NAMES[root]}${quality}`,
      rightHand: rh,
      leftHand: 36 + pc(root - 5) + 5,
      inversion: lowest === 0 ? 0 : lowest === 3 || lowest === 4 ? 1 : lowest === 7 ? 2 : 3,
      expectedBassPc: pc(rh[0]),
      movement: next.movement,
    };
  });
}

const MAJ = [0, 4, 7];
const MIN = [0, 3, 7];

/**
 * The keyboard cadence piano proficiency exams ask for in every key: I IV I V7 I
 * (i iv i V7 i in harmonic minor), the root in the left hand and three notes in
 * the right moving the shortest way from a root-position tonic (the V7 drops its
 * 5th, the usual three-note keyboard voicing).
 */
export function cadenceChords(
  keyPc: number,
  minor = false,
  register: [number, number] = [55, 76],
): CadenceChord[] {
  const t = minor ? MIN : MAJ;
  const i = minor ? "i" : "I";
  return voiceLed(
    keyPc,
    [
      [i, 0, t],
      [minor ? "iv" : "IV", 5, t],
      [i, 0, t],
      ["V7", 7, [0, 4, 10]],
      [i, 0, t],
    ],
    `cadence-${minor ? "minor" : "major"}`,
    register,
  );
}

/** Progressions for the pedal drill: a chord a bar, voiced as the cadences are. */
export const PEDAL_PROGRESSIONS: { id: string; label: string; plan: Plan }[] = [
  {
    id: "I-IV-V-I",
    label: "I IV V I",
    plan: [
      ["I", 0, MAJ],
      ["IV", 5, MAJ],
      ["V", 7, MAJ],
      ["I", 0, MAJ],
    ],
  },
  {
    id: "I-vi-IV-V",
    label: "I vi IV V",
    plan: [
      ["I", 0, MAJ],
      ["vi", 9, MIN],
      ["IV", 5, MAJ],
      ["V", 7, MAJ],
    ],
  },
  {
    id: "I-V-vi-IV",
    label: "I V vi IV",
    plan: [
      ["I", 0, MAJ],
      ["V", 7, MAJ],
      ["vi", 9, MIN],
      ["IV", 5, MAJ],
    ],
  },
];
export const pedalChords = (
  keyPc: number,
  progressionId: string,
  register: [number, number] = [55, 76],
) =>
  voiceLed(
    keyPc,
    (PEDAL_PROGRESSIONS.find((p) => p.id === progressionId) ?? PEDAL_PROGRESSIONS[0]).plan,
    `pedal-${progressionId}`,
    register,
  );

// ---------------------------------------------------------------------------
// Licks

export const LICKS = JAZZ.JAZZ_LICKS;
export const LICK_CATEGORIES = JAZZ.JAZZ_LICK_CATEGORIES;
export const lickSkills = (category: string) => [`harmony.ii-v-i.licks.${category}`];

export interface LickNote {
  index: number;
  midi: number;
  startBeat: number;
  durationBeats: number;
  string?: number;
  fret?: number;
  finger?: number;
}

/** A lick's playable notes (rests advance time only). Transposing drops the fretted positions. */
export function lickNotes(lickNumber: number, transpose = 0): LickNote[] {
  let beat = 0;
  const out: LickNote[] = [];
  for (const [midi, beats, pos] of JAZZ.LICK_PHRASES[String(lickNumber)] ?? []) {
    if (midi !== null)
      out.push({
        index: out.length,
        midi: midi + transpose,
        startBeat: beat,
        durationBeats: beats,
        ...(pos && transpose === 0 ? pos : {}),
      });
    beat += beats;
  }
  return out;
}

/** Semitones from C to a cycle key, kept within -6..+5 so the line stays in register. */
export const cycleTranspose = (key: string) => ((pcOf(key)! + 6) % 12) - 6;

/** A lick as a one-voice Score (chord symbols transposed along). */
export function lickScore(lickNumber: number, opts: { bpm: number; transpose?: number }): Score {
  const lick = LICKS.find((l) => l.number === lickNumber)!;
  const t = opts.transpose ?? 0;
  const notes = lickNotes(lickNumber, t);
  const end = notes.length
    ? notes[notes.length - 1].startBeat + notes[notes.length - 1].durationBeats
    : 0;
  return {
    id: `lick-${lickNumber}${t ? `-t${t}` : ""}`,
    title: `Lick ${lickNumber}: ${lick.progression.map((s) => transposeSymbol(s, t)).join(" ")}`,
    bpm: opts.bpm,
    meter: { beats: 4, beatUnit: 4 },
    voices: [{ id: "lick", name: "Lick", notes: notes.map(({ index: _, ...n }) => n) }],
    lengthBeats: Math.max(4, Math.ceil(end / 4) * 4),
    source: { kind: "generated" },
  };
}

/** A contiguous chunk, first and last note inclusive, re-timed from 0. */
export function lickChunk(notes: LickNote[], first: number, last: number): LickNote[] {
  const chunk = notes.slice(first, last + 1);
  const t0 = chunk[0]?.startBeat ?? 0;
  return chunk.map((n) => ({ ...n, startBeat: n.startBeat - t0 }));
}

/** The four-note window around an index (one note before it), clamped to the phrase. */
export function lickWindow(notes: LickNote[], index: number): [first: number, last: number] {
  const first = Math.max(0, Math.min(index - 1, notes.length - 4));
  return [first, Math.min(notes.length - 1, first + 3)];
}

// ---------------------------------------------------------------------------
// Chord-scale drill

export const CHORD_SCALE_CHANGES: Record<"major" | "minor", string[]> = {
  major: ["Dm7", "G7", "Cmaj7"],
  minor: ["Dm7b5", "G7alt", "Cm7"],
};

/** CHORD_SCALE_MAP family of a chord symbol (undefined for plain triads). */
export function chordFamily(symbol: string): string | undefined {
  const s = parseChordSymbol(symbol)?.suffix;
  if (s === undefined) return undefined;
  if (s.startsWith("mMaj")) return "mMaj7";
  if (s.startsWith("m7b5")) return "m7b5";
  if (s.startsWith("dim7")) return "dim7";
  if (s.startsWith("m6")) return "min6";
  if (/^m(7|9|11)/.test(s)) return "m7";
  if (s.startsWith("maj")) return "maj7";
  if (s.startsWith("6")) return "maj6";
  if (/^(7|9|13)/.test(s)) return "dom7";
  return undefined;
}

/** The go-to (recommended) scale for a chord; a 7alt chord takes the altered scale. */
export function goToScale(symbol: string): (ChordScaleRow & { semitones: number[] }) | undefined {
  const family = chordFamily(symbol);
  const alt = symbol.includes("alt");
  const row = JAZZ.CHORD_SCALE_MAP.find((r) =>
    alt ? r.family === "dom7" && r.scale === "altered" : r.family === family && r.recommended,
  );
  const semitones = row && scaleSemitones(row.scale);
  return row && semitones ? { ...row, semitones } : undefined;
}

export interface ChordScaleTarget {
  symbol: string;
  rootPc: number;
  scaleLabel: string;
  /** The scale up one octave from the chord root at octave 4. */
  midi: number[];
  roles: ToneRole[];
  skillIds: string[];
}

/** Per chord of a change set: the go-to scale to play and the 12-pc tone roles. */
export function chordScaleTargets(changes: "major" | "minor", transpose = 0): ChordScaleTarget[] {
  return CHORD_SCALE_CHANGES[changes].map((original) => {
    const symbol = transposeSymbol(original, transpose);
    const chord = parseChordSymbol(symbol)!;
    const scale = goToScale(symbol)!;
    return {
      symbol,
      rootPc: chord.rootPc,
      scaleLabel: `${chord.rootName} ${scale.label}`,
      midi: scale.semitones.map((s) => 60 + chord.rootPc + s),
      roles: toneRoles(
        chord.pcs,
        scale.semitones.map((s) => chord.rootPc + s),
      ),
      skillIds: [`harmony.ii-v-i.chord-scales.${changes}`],
    };
  });
}

// Aerophone fingerings and technique setups; MPC rudiments and grooves as timed hits.

import {
  AEROPHONE_FINGERINGS,
  MPC_GROOVES,
  MPC_RUDIMENTS,
  type DrumVoiceId,
  type GrooveDef,
  type RudimentDef,
} from "../data";
import { clamp, octaveOf, pc, SHARP_NAMES } from "../theory/notes";

// ---------------------------------------------------------------------------
// Aerophone (sax fingering mode, written pitch, Bb3 58 .. C#6 85; G5 and up
// are the low fingerings with the +1 octave key, as on a sax)

/** Verified on the owner's instrument; everything else in the chart is best-effort. */
export const AEROPHONE_VERIFIED_MIDI = [60, 62, 64, 65, 67, 69, 71, 73, 74, 75];
export const AEROPHONE_DEFAULT_TARGET = 67;
export const AEROPHONE_KEYS = AEROPHONE_FINGERINGS.keys;

/** Chart spelling: sharps, except Eb and Bb. */
const aeroName = (midi: number) =>
  (pc(midi) === 3 ? "Eb" : pc(midi) === 10 ? "Bb" : SHARP_NAMES[pc(midi)]) + octaveOf(midi);

export interface AerophoneChartEntry {
  midi: number;
  name: string;
  keys: string[];
  octave: boolean;
  verified: boolean;
}

export function fingeringFor(midi: number): AerophoneChartEntry | undefined {
  const f = AEROPHONE_FINGERINGS.fingeringsByMidi[String(midi)];
  return (
    f && {
      midi,
      name: aeroName(midi),
      keys: f.keys,
      octave: f.octave,
      verified: AEROPHONE_VERIFIED_MIDI.includes(midi),
    }
  );
}
export const AEROPHONE_CHART = AEROPHONE_FINGERINGS.chart.map((c) => fingeringFor(c.midi)!);
export const AEROPHONE_RANGE = AEROPHONE_FINGERINGS.range;
export const aerophoneKeyLabel = (id: string) =>
  id === "octave"
    ? (AEROPHONE_KEYS.find((k) => k.id === "oct+1")?.label ?? "octave key")
    : (AEROPHONE_KEYS.find((k) => k.id === id)?.label ?? id);

/**
 * What probably went wrong when `played` came out instead of `target`: the
 * keys of the played note's chart fingering that the target does not use
 * (down by mistake) and the target's keys that are missing. A guess: the
 * Aerophone sends the note, not the keys, and alternate fingerings exist.
 */
export function fingeringSlip(target: number, played: number) {
  const t = fingeringFor(target);
  const p = fingeringFor(played);
  if (!t || !p || target === played) return null;
  const down = p.keys.filter((k) => !t.keys.includes(k));
  const up = t.keys.filter((k) => !p.keys.includes(k));
  if (p.octave && !t.octave) down.push("octave");
  if (t.octave && !p.octave) up.push("octave");
  const say = (ids: string[]) => ids.map(aerophoneKeyLabel).join(", ");
  const text = [down.length ? `lift ${say(down)}` : "", up.length ? `press ${say(up)}` : ""]
    .filter(Boolean)
    .join(" and ");
  return { down, up, text: text.charAt(0).toUpperCase() + text.slice(1) };
}

/**
 * Fingering lessons in the order Roland's Aerophone Lesson app teaches them
 * (three notes, five, C major, the octave key, then the keys by flats and
 * sharps), each played up and back down. Written pitch.
 */
export const FINGERING_LESSONS = [
  { id: "g-a-b", label: "G A B", notes: [67, 69, 71] },
  { id: "e-f-g", label: "E F G", notes: [64, 65, 67] },
  { id: "c-d-e", label: "C D E", notes: [60, 62, 64] },
  { id: "c-to-g", label: "C to G", notes: [60, 62, 64, 65, 67] },
  { id: "g-to-c", label: "G to C", notes: [67, 69, 71, 72] },
  { id: "c-major", label: "C major", notes: [60, 62, 64, 65, 67, 69, 71, 72] },
  { id: "octave", label: "The octave key: G to D", notes: [67, 69, 71, 72, 74] },
  { id: "f-major", label: "F major", notes: [65, 67, 69, 70, 72, 74, 76, 77] },
  { id: "g-major", label: "G major", notes: [67, 69, 71, 72, 74, 76, 78, 79] },
  { id: "bb-major", label: "Bb major", notes: [58, 60, 62, 63, 65, 67, 69, 70] },
  { id: "d-major", label: "D major", notes: [62, 64, 66, 67, 69, 71, 73, 74] },
  { id: "eb-major", label: "Eb major", notes: [63, 65, 67, 68, 70, 72, 74, 75] },
] as const;
/** A lesson's notes up and back down (the top note once). */
export const lessonSequence = (notes: readonly number[]) => [
  ...notes,
  ...notes.slice(0, -1).reverse(),
];

export type AerophoneMode =
  | "fingering"
  | "long-tone"
  | "swell"
  | "articulation"
  | "interval-landing"
  | "scales"
  | "tonguing"
  | "register"
  | "trills"
  | "vibrato";
export const AEROPHONE_MODES = [
  { id: "fingering", label: "Fingering" },
  { id: "long-tone", label: "Long tone", seconds: [3, 5, 8] },
  { id: "swell", label: "Swell", seconds: [4, 6, 8] },
  { id: "articulation", label: "Articulation", bpm: [70, 90, 110], count: 8 },
  { id: "interval-landing", label: "Interval landing" },
  { id: "scales", label: "Scales and arpeggios" },
  { id: "tonguing", label: "Tonguing patterns" },
  { id: "register", label: "Register crossings" },
  { id: "trills", label: "Trills" },
  { id: "vibrato", label: "Bite vibrato" },
] as const;
/** Target sounding fraction of each beat. */
export const ARTICULATION_TARGET = { staccato: 0.35, legato: 0.95 } as const;
export const LANDING_INTERVALS = [
  { semitones: 5, label: "Perfect fourth" },
  { semitones: 7, label: "Perfect fifth" },
  { semitones: 12, label: "Octave" },
  { semitones: 4, label: "Major third" },
  { semitones: 3, label: "Minor third" },
] as const;

const AERO_SKILLS: Record<AerophoneMode, string[]> = {
  fingering: ["technique.aerophone", "technique.aerophone.fingering"],
  "long-tone": ["technique.aerophone", "technique.aerophone.breath-steadiness"],
  swell: ["technique.aerophone", "technique.aerophone.dynamic-control"],
  articulation: ["technique.aerophone", "technique.aerophone.articulation"],
  "interval-landing": [
    "technique.aerophone",
    "technique.aerophone.interval-landing",
    "intonation.interval-landing",
  ],
  scales: ["technique.aerophone", "technique.aerophone.scales"],
  tonguing: ["technique.aerophone", "technique.aerophone.tonguing"],
  register: ["technique.aerophone", "technique.aerophone.register"],
  trills: ["technique.aerophone", "technique.aerophone.trills"],
  vibrato: ["technique.aerophone", "technique.aerophone.vibrato"],
};
export const aerophoneSkills = (mode: AerophoneMode) => AERO_SKILLS[mode];

/** The note to land on against a drone; undefined when it leaves the fingering chart. */
export function landingTarget(
  droneMidi: number,
  semitones: number,
  direction: "up" | "down",
): number | undefined {
  const target = droneMidi + (direction === "up" ? semitones : -semitones);
  return fingeringFor(target) ? target : undefined;
}

/** Repeated-note articulation: one attack per beat, expected to sound for the style's fraction. */
export function articulationTargets(opts: {
  midi: number;
  bpm: number;
  count: number;
  style: "staccato" | "legato";
}) {
  const beat = 60000 / opts.bpm;
  return Array.from({ length: opts.count }, (_, i) => ({
    index: i,
    midi: opts.midi,
    atMs: i * beat,
    soundingMs: beat * ARTICULATION_TARGET[opts.style],
  }));
}

// ---------------------------------------------------------------------------
// MPC rudiments

/**
 * The table's rudiments, then the finger-drumming ones the app adds from the
 * research (Melodics' exercises, the PAS rudiments): two-finger rolls on one
 * pad, a one-pad pyramid, accents and ghosts, and three more PAS stickings.
 */
export const RUDIMENTS: RudimentDef[] = [
  ...MPC_RUDIMENTS.patterns,
  {
    id: "finger-roll",
    label: "Two-finger roll",
    unit: ["right", "left"],
    subdivision: 4,
    onePad: true,
  },
  {
    id: "roll-32",
    label: "Thirty-second roll (trap)",
    unit: ["right", "left"],
    subdivision: 8,
    onePad: true,
  },
  {
    id: "roll-16t",
    label: "Triplet roll, 1/16T (trap)",
    unit: ["right", "left"],
    subdivision: 6,
    onePad: true,
  },
  {
    id: "pyramid",
    label: "One-pad pyramid (1 2 3 4 3 2)",
    unit: ["right", "left"],
    onePad: true,
    perBeat: [1, 2, 3, 4, 3, 2],
  },
  {
    id: "accents-ghosts",
    label: "Accents and ghosts",
    unit: ["right", "left", "right", "left"],
    subdivision: 4,
    accents: [0],
  },
  {
    id: "six-stroke",
    label: "Six-stroke roll",
    unit: ["right", "left", "left", "right", "right", "left"],
    subdivision: 3,
    accents: [0, 5],
  },
  {
    id: "paradiddle-diddle",
    label: "Paradiddle-diddle",
    unit: ["right", "left", "right", "right", "left", "left"],
    subdivision: 3,
    accents: [0],
  },
  {
    id: "double-paradiddle",
    label: "Double paradiddle",
    unit: [
      "right",
      "left",
      "right",
      "left",
      "right",
      "right",
      "left",
      "right",
      "left",
      "right",
      "left",
      "left",
    ],
    subdivision: 3,
    accents: [0, 6],
  },
];
export const RUDIMENT_TEMPOS = [60, 80, 100, 120];
/** Names for every grid a rudiment can be on (the rolls go past sixteenths). */
export const SUBDIVISION_NAMES: Record<number, string> = {
  2: "eighths",
  3: "triplets",
  4: "sixteenths",
  6: "sixteenth triplets",
  8: "thirty-seconds",
};
/** The grid a rudiment is timed on: its own, a pyramid's closest spacing, else the chosen one. */
export const rudimentPerBeat = (p: RudimentDef, chosen: 2 | 3 | 4) =>
  p.subdivision ?? (p.perBeat ? Math.max(...p.perBeat) : chosen);
export const RUDIMENT_HIT_COUNTS = [8, 16, 32] as const;
export const RUDIMENT_DEFAULTS = {
  bpm: 80,
  hits: 16,
  subdivision: 2 as const,
  pads: [36, 38] as [number, number],
};
export const VELOCITY_BANDS = {
  accent: [0.75, 1] as [number, number],
  tap: [0.25, 0.7] as [number, number],
};

export interface PadHit {
  index: number;
  atMs: number;
  hand: "left" | "right";
  pad: number;
  accent: boolean;
  /** A flam grace note (not counted in the hit count). */
  grace: boolean;
  velocityBand?: [number, number];
}

export const rudimentSkills = (patternId: string) => {
  const p = RUDIMENTS.find((r) => r.id === patternId);
  return [
    "technique.mpc",
    /paradiddle/.test(patternId)
      ? "technique.mpc.paradiddles"
      : p?.onePad || patternId === "six-stroke"
        ? "technique.mpc.rolls"
        : p?.accents
          ? "technique.mpc.accents"
          : "technique.mpc.single-strokes",
  ];
};

/**
 * Expand a rudiment to timed hits from the downbeat. The pattern's own grid wins over
 * the chosen subdivision; tempo is clamped 30..240. Moving accent accents one note per
 * beat, one position later each beat, and writes velocity bands. A flam adds a grace
 * note on the other hand's pad 30 ms before each main hit.
 */
export function rudimentHits(opts: {
  patternId: string;
  subdivision: 2 | 3 | 4;
  hits: number;
  bpm: number;
  pads?: [number, number];
}): PadHit[] {
  const p = RUDIMENTS.find((r) => r.id === opts.patternId) ?? RUDIMENTS[0];
  const [leftPad, chosenRight] = opts.pads ?? RUDIMENT_DEFAULTS.pads;
  if (leftPad === chosenRight) throw new Error("A rudiment needs two different pads.");
  // A roll is two fingers on one pad: the right-hand pad.
  const rightPad = chosenRight;
  const padOf = (hand: "left" | "right") =>
    p.onePad ? rightPad : hand === "left" ? leftPad : rightPad;
  const sub = p.subdivision ?? opts.subdivision;
  const beatMs = 60000 / clamp(opts.bpm, 30, 240);
  const step = beatMs / sub;
  // A pyramid changes notes per beat; everything else keeps one grid.
  const times: number[] = [];
  if (p.perBeat)
    for (let beat = 0; times.length < opts.hits; beat++) {
      const n = p.perBeat[beat % p.perBeat.length];
      for (let k = 0; k < n && times.length < opts.hits; k++) times.push((beat + k / n) * beatMs);
    }
  const out: PadHit[] = [];
  for (let i = 0; i < opts.hits; i++) {
    const hand = p.unit[i % p.unit.length];
    const moving = p.accentMode === "moving";
    const marked = !!p.accents;
    const accent = moving
      ? i % sub === Math.floor(i / sub) % sub
      : marked && p.accents!.includes(i % p.unit.length);
    const atMs = p.perBeat ? times[i] : i * step;
    if (p.flam) {
      const other = hand === "left" ? "right" : "left";
      out.push({
        index: -1,
        atMs: atMs - MPC_RUDIMENTS.flamGraceMs,
        hand: other,
        pad: padOf(other),
        accent: false,
        grace: true,
      });
    }
    out.push({
      index: i,
      atMs,
      hand,
      pad: padOf(hand),
      accent,
      grace: false,
      ...(moving || marked
        ? { velocityBand: accent ? VELOCITY_BANDS.accent : VELOCITY_BANDS.tap }
        : {}),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// MPC grooves

export const GROOVES = MPC_GROOVES.catalog;
/** The table's six voices, and the ones the repertoire adds on their General MIDI notes in bank A. */
export const GROOVE_VOICES = [
  ...MPC_GROOVES.voices,
  { id: "rim", name: "Rim", midi: 37 },
  { id: "pedalhat", name: "Pedal hat", midi: 44 },
  { id: "tom-low", name: "Low tom", midi: 41 },
  { id: "tom-mid", name: "Mid tom", midi: 45 },
  { id: "tom-high", name: "High tom", midi: 48 },
  { id: "crash", name: "Crash", midi: 49 },
  { id: "ride", name: "Ride", midi: 51 },
  // GM's cowbell (56) is off bank A: the app's kit puts it on A12.
  { id: "cowbell", name: "Cowbell", midi: 47 },
] as { id: DrumVoiceId; name: string; midi: number }[];
const kitNotes = GROOVE_VOICES.map((v) => v.midi);
/** Accepted pad range, widened for the 808 below bank A. */
export const GROOVE_PAD_RANGE: [number, number] = [
  Math.min(36, ...kitNotes),
  Math.max(51, ...kitNotes),
];
/** MIDI velocity bands (0..127) for groove accents. */
export const GROOVE_VELOCITY = { accentMin: 90, normal: [50, 89] as [number, number] };
export const grooveSkills = (grooveId: string) => [
  "technique.mpc",
  `technique.mpc.groove.${grooveId}`,
];

export interface GrooveTarget {
  index: number;
  beat: number;
  bar: number;
  atMs: number;
  voice: DrumVoiceId;
  pad: number;
  accent: boolean;
  /** A soft note under the groove. */
  ghost: boolean;
  section: string;
}

/**
 * A groove's targets from the downbeat, with the voice's pad note and the bar's
 * section (a target past the last bar, like turnaround-fill's bar-5 kick, belongs
 * to the last section). Match window = min(180 ms, beat / 8).
 */
export function grooveTargets(grooveId: string, bpm: number) {
  return grooveTargetsFor(GROOVES.find((x) => x.value === grooveId) ?? GROOVES[0], bpm);
}

/** The same for any groove (the repertoire's too). */
export function grooveTargetsFor(g: GrooveDef, bpm: number) {
  const beat = 60000 / bpm;
  const pad = (v: DrumVoiceId) => GROOVE_VOICES.find((x) => x.id === v)!.midi;
  const targets: GrooveTarget[] = g.targets.map((t, index) => {
    const bar = Math.floor(t.beat / 4);
    return {
      index,
      beat: t.beat,
      bar,
      atMs: t.beat * beat,
      voice: t.voice,
      pad: pad(t.voice),
      accent: t.accent === "accent",
      ghost: t.accent === "ghost",
      section: g.sectionLabels[Math.min(bar, g.sectionLabels.length - 1)],
    };
  });
  return {
    groove: g,
    targets,
    matchWindowMs: Math.min(180, beat / 8),
    lengthMs: g.bars * 4 * beat,
  };
}

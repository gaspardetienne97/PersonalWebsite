// Aerophone fingerings and technique setups; MPC rudiments and grooves as timed hits.

import {
  AEROPHONE_FINGERINGS,
  MPC_GROOVES,
  MPC_RUDIMENTS,
  type DrumVoiceId,
  type GrooveDef,
  type RudimentDef,
} from "../data";
import { ARTICULATION_TARGET } from "../scoring/aerophone";
import { clamp, octaveOf, pc, SHARP_NAMES } from "../theory/notes";
import { m } from "@repo/i18n/messages.js";

// ---------------------------------------------------------------------------
// Aerophone (sax fingering mode, written pitch, Bb3 58 .. F#6 90; G5 and up
// are the low fingerings with the +1 octave key, as on a sax; D6 and up add
// the palm keys)

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

/**
 * The palm keys above C#6, beside the verified data: the standard sax
 * fingerings (octave key, palm D, palm Eb, side E, palm F, high F#) on Roland's
 * key names. Best-effort until checked on the owner's AE-20. Front F (X with
 * key 1) is the common alternate for F6.
 */
export const PALM_FINGERINGS: Record<string, { keys: string[]; octave: boolean }> = {
  "86": { keys: ["C1"], octave: true },
  "87": { keys: ["C1", "C2"], octave: true },
  "88": { keys: ["C1", "C2", "C3"], octave: true },
  "89": { keys: ["C1", "C2", "C3", "C4"], octave: true },
  "90": { keys: ["C1", "C2", "C3", "C4", "C5"], octave: true },
};

export function fingeringFor(midi: number): AerophoneChartEntry | undefined {
  const f = AEROPHONE_FINGERINGS.fingeringsByMidi[String(midi)] ?? PALM_FINGERINGS[String(midi)];
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
export const AEROPHONE_CHART = [
  ...AEROPHONE_FINGERINGS.chart.map((c) => c.midi),
  ...Object.keys(PALM_FINGERINGS).map(Number),
].map((m) => fingeringFor(m)!);
export const AEROPHONE_RANGE = {
  lowestMidi: AEROPHONE_FINGERINGS.range.lowestMidi,
  highestMidi: AEROPHONE_CHART.at(-1)!.midi,
};
export const aerophoneKeyLabel = (id: string) =>
  id === "octave"
    ? (AEROPHONE_KEYS.find((k) => k.id === "oct+1")?.label ?? m.music_rep_winds_key_octave())
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
  const text =
    down.length && up.length
      ? m.music_rep_winds_slip_both({ down: say(down), up: say(up) })
      : down.length
        ? m.music_rep_winds_slip_lift({ keys: say(down) })
        : up.length
          ? m.music_rep_winds_slip_press({ keys: say(up) })
          : "";
  return { down, up, text };
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
  {
    id: "c-to-g",
    label: m.music_rep_winds_lesson_span({ from: "C", to: "G" }),
    notes: [60, 62, 64, 65, 67],
  },
  {
    id: "g-to-c",
    label: m.music_rep_winds_lesson_span({ from: "G", to: "C" }),
    notes: [67, 69, 71, 72],
  },
  {
    id: "c-major",
    label: m.music_rep_winds_lesson_major({ key: "C" }),
    notes: [60, 62, 64, 65, 67, 69, 71, 72],
  },
  { id: "octave", label: m.music_rep_winds_lesson_octave(), notes: [67, 69, 71, 72, 74] },
  {
    id: "f-major",
    label: m.music_rep_winds_lesson_major({ key: "F" }),
    notes: [65, 67, 69, 70, 72, 74, 76, 77],
  },
  {
    id: "g-major",
    label: m.music_rep_winds_lesson_major({ key: "G" }),
    notes: [67, 69, 71, 72, 74, 76, 78, 79],
  },
  {
    id: "bb-major",
    label: m.music_rep_winds_lesson_major({ key: "Bb" }),
    notes: [58, 60, 62, 63, 65, 67, 69, 70],
  },
  {
    id: "d-major",
    label: m.music_rep_winds_lesson_major({ key: "D" }),
    notes: [62, 64, 66, 67, 69, 71, 73, 74],
  },
  {
    id: "eb-major",
    label: m.music_rep_winds_lesson_major({ key: "Eb" }),
    notes: [63, 65, 67, 68, 70, 72, 74, 75],
  },
  // Beyond Roland's order: the path's chosen sets.
  {
    id: "fs-bb",
    label: m.music_rep_winds_lesson_fs_bb(),
    notes: [66, 70],
    // 20 cards, each F# or Bb between a neighbour it is easily confused with.
    line: [67, 66, 67, 69, 70, 69, 66, 64, 66, 70, 71, 70, 66, 65, 66, 70, 72, 70, 66, 67],
  },
  { id: "palm-keys", label: m.music_rep_winds_lesson_palm(), notes: [85, 86, 87, 88, 89] },
] as const satisfies readonly {
  id: string;
  label: string;
  notes: readonly number[];
  line?: readonly number[];
}[];
/** A lesson's notes up and back down (the top note once). */
export const lessonSequence = (notes: readonly number[]) => [
  ...notes,
  ...notes.slice(0, -1).reverse(),
];
/** What a lesson plays: its own line when it has one, else up and back down. */
export const lessonLine = (lesson: (typeof FINGERING_LESSONS)[number]) =>
  "line" in lesson ? [...lesson.line] : lessonSequence(lesson.notes);

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
  | "vibrato"
  | "swing"
  | "long-scale"
  | "calibrate";
export const AEROPHONE_MODES = [
  { id: "fingering", label: m.music_rep_winds_mode_fingering() },
  { id: "long-tone", label: m.music_rep_winds_mode_long_tone(), seconds: [3, 5, 8] },
  { id: "swell", label: m.music_rep_winds_mode_swell(), seconds: [4, 6, 8] },
  {
    id: "articulation",
    label: m.music_rep_winds_mode_articulation(),
    bpm: [70, 90, 110],
    count: 8,
  },
  { id: "interval-landing", label: m.music_rep_winds_mode_interval_landing() },
  { id: "scales", label: m.music_rep_winds_mode_scales() },
  { id: "tonguing", label: m.music_rep_winds_mode_tonguing() },
  { id: "register", label: m.music_rep_winds_mode_register() },
  { id: "trills", label: m.music_rep_winds_mode_trills() },
  { id: "vibrato", label: m.music_rep_winds_mode_vibrato() },
  { id: "swing", label: m.music_rep_winds_mode_swing() },
  { id: "long-scale", label: m.music_rep_winds_mode_long_scale() },
  { id: "calibrate", label: m.music_rep_winds_mode_calibrate() },
] as const;
/** Target sounding fraction of each beat: the grader's own table. */
export { ARTICULATION_TARGET };
/** How long a landing is held, in ms. */
export const LANDING_HOLD_MS = 3000;
export const LANDING_INTERVALS = [
  { semitones: 5, label: m.music_rep_winds_interval_fourth() },
  { semitones: 7, label: m.music_rep_winds_interval_fifth() },
  { semitones: 12, label: m.music_rep_winds_interval_octave() },
  { semitones: 4, label: m.music_rep_winds_interval_major_third() },
  { semitones: 3, label: m.music_rep_winds_interval_minor_third() },
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
  swing: [
    "technique.aerophone",
    "technique.aerophone.articulation",
    "technique.aerophone.tonguing",
  ],
  "long-scale": [
    "technique.aerophone",
    "technique.aerophone.breath-steadiness",
    "technique.aerophone.dynamic-control",
  ],
  // Checking the set-up is not a skill.
  calibrate: [],
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
    label: m.music_rep_winds_rud_finger_roll(),
    unit: ["right", "left"],
    subdivision: 4,
    onePad: true,
  },
  {
    id: "roll-32",
    label: m.music_rep_winds_rud_roll_32(),
    unit: ["right", "left"],
    subdivision: 8,
    onePad: true,
  },
  {
    id: "roll-16t",
    label: m.music_rep_winds_rud_roll_16t(),
    unit: ["right", "left"],
    subdivision: 6,
    onePad: true,
  },
  {
    id: "pyramid",
    label: m.music_rep_winds_rud_pyramid(),
    unit: ["right", "left"],
    onePad: true,
    perBeat: [1, 2, 3, 4, 3, 2],
  },
  {
    id: "accents-ghosts",
    label: m.music_rep_winds_rud_accents_ghosts(),
    unit: ["right", "left", "right", "left"],
    subdivision: 4,
    accents: [0],
  },
  {
    id: "six-stroke",
    label: m.music_rep_winds_rud_six_stroke(),
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
    label: m.music_rep_winds_rud_double_paradiddle(),
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
  // Counting in 5 and 7: alternating singles, the accents marking the groups.
  {
    id: "fives",
    label: m.music_rep_winds_rud_fives(),
    unit: ["right", "left", "right", "left", "right", "left", "right", "left", "right", "left"],
    accents: [0, 3, 5, 8],
  },
  {
    id: "sevens",
    label: m.music_rep_winds_rud_sevens(),
    unit: [
      "right",
      "left",
      "right",
      "left",
      "right",
      "left",
      "right",
      "left",
      "right",
      "left",
      "right",
      "left",
      "right",
      "left",
    ],
    accents: [0, 2, 4, 7, 9, 11],
  },
];
/**
 * Stick Control, page one (George Lawrence Stone): every four-note sticking of
 * R and L, eighth notes, 20 repetitions each. One pad a hand, so the grader
 * sees the sticking, which no acoustic practice app can.
 */
export const STICK_CONTROL: RudimentDef[] = [
  "RLRL",
  "LRLR",
  "RRLL",
  "LLRR",
  "RLRR",
  "LRLL",
  "RRLR",
  "LLRL",
  "RLLR",
  "LRRL",
  "RRRL",
  "LLLR",
  "RLLL",
  "LRRR",
  "RRRR",
  "LLLL",
].map((s) => ({
  id: `stick-${s.toLowerCase()}`,
  label: `Stick Control: ${s.split("").join(" ")}`,
  unit: [...s].map((c) => (c === "R" ? "right" : "left")),
  subdivision: 2,
  hits: 80,
}));
RUDIMENTS.push(...STICK_CONTROL);

export const RUDIMENT_TEMPOS = [60, 80, 100, 120];
/** Names for every grid a rudiment can be on (the rolls go past sixteenths). */
export const SUBDIVISION_NAMES: Record<number, string> = {
  2: m.music_rep_winds_sub_eighths(),
  3: m.music_rep_winds_sub_triplets(),
  4: m.music_rep_winds_sub_sixteenths(),
  6: m.music_rep_winds_sub_sixteenth_triplets(),
  8: m.music_rep_winds_sub_thirty_seconds(),
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
  const count = p.hits ?? opts.hits;
  const beatMs = 60000 / clamp(opts.bpm, 30, 240);
  const step = beatMs / sub;
  // A pyramid changes notes per beat; everything else keeps one grid.
  const times: number[] = [];
  if (p.perBeat)
    for (let beat = 0; times.length < count; beat++) {
      const n = p.perBeat[beat % p.perBeat.length];
      for (let k = 0; k < n && times.length < count; k++) times.push((beat + k / n) * beatMs);
    }
  const out: PadHit[] = [];
  for (let i = 0; i < count; i++) {
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
  { id: "rim", name: m.music_rep_winds_voice_rim(), midi: 37 },
  { id: "pedalhat", name: m.music_rep_winds_voice_pedalhat(), midi: 44 },
  { id: "tom-low", name: m.music_rep_winds_voice_tom_low(), midi: 41 },
  { id: "tom-mid", name: m.music_rep_winds_voice_tom_mid(), midi: 45 },
  { id: "tom-high", name: m.music_rep_winds_voice_tom_high(), midi: 48 },
  { id: "crash", name: "Crash", midi: 49 },
  { id: "ride", name: "Ride", midi: 51 },
  // GM's cowbell (56) is off bank A: the app's kit puts it on A12.
  { id: "cowbell", name: m.music_rep_winds_voice_cowbell(), midi: 47 },
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
/** `pads` places voices the kit lacks (a written piece's slices). */
export function grooveTargetsFor(
  g: GrooveDef,
  bpm: number,
  pads?: Readonly<Record<string, number>>,
) {
  const beat = 60000 / bpm;
  const pad = (v: DrumVoiceId) => pads?.[v] ?? GROOVE_VOICES.find((x) => x.id === v)!.midi;
  const perBar = g.beatsPerBar ?? 4;
  const targets: GrooveTarget[] = g.targets.map((t, index) => {
    const bar = Math.floor(t.beat / perBar + 1e-9);
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
    lengthMs: g.bars * perBar * beat,
  };
}

// ---------------------------------------------------------------------------
// Drum parts in songs: General MIDI drums on the app's kit

/** General MIDI drums to the kit's voices; the toms and cymbals the kit lacks fold to its nearest. */
const GM_VOICE: Record<number, DrumVoiceId> = {
  35: "kick",
  36: "kick",
  37: "rim",
  38: "snare",
  39: "perc",
  40: "snare",
  41: "tom-low",
  42: "hats",
  43: "tom-low",
  44: "pedalhat",
  45: "tom-mid",
  46: "openhat",
  47: "tom-mid",
  48: "tom-high",
  49: "crash",
  50: "tom-high",
  51: "ride",
  52: "crash",
  53: "ride",
  55: "crash",
  56: "cowbell",
  57: "crash",
  59: "ride",
};
/** Hits that count for each other: any hat for a hat, the 808 for the kick. */
const DRUM_FAMILY: Partial<Record<DrumVoiceId, DrumVoiceId>> = {
  "808": "kick",
  pedalhat: "hats",
  openhat: "hats",
};
const kitPad = (v: DrumVoiceId) => GROOVE_VOICES.find((x) => x.id === v)!.midi;

/** The kit voice a score's GM drum note plays; any other percussion is the kit's perc. */
export const scoreDrumVoice = (gm: number): DrumVoiceId => GM_VOICE[gm] ?? "perc";

/** The kit pad that sounds a score's GM drum note (GM's cowbell 56 is the kit's 47, its 47 tom is 45). */
export const scoreDrumPad = (gm: number) => kitPad(scoreDrumVoice(gm));

/** The voice of a pad hit: the kit's own pad first (canonical, after the device's pad map), then GM. */
export const padDrumVoice = (note: number): DrumVoiceId | undefined =>
  GROOVE_VOICES.find((v) => v.midi === note)?.id ?? GM_VOICE[note];

const familyKey = (v: DrumVoiceId) => kitPad(DRUM_FAMILY[v] ?? v);

/** What grading compares for a score note: one number per drum family. */
export const drumKey = (gm: number) => familyKey(scoreDrumVoice(gm));

/** The same for a pad hit. A note that is no drum keeps its number, which is no key, so it matches nothing. */
export function hitDrumKey(note: number): number {
  const v = padDrumVoice(note);
  return v ? familyKey(v) : note;
}

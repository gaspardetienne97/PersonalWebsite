// Aerophone fingerings and technique setups; MPC rudiments and grooves as timed hits.

import { AEROPHONE_FINGERINGS, MPC_GROOVES, MPC_RUDIMENTS, type DrumVoiceId } from "../data";
import { clamp, octaveOf, pc, SHARP_NAMES } from "../theory/notes";

// ---------------------------------------------------------------------------
// Aerophone (sax fingering mode, written pitch, Bb3 58 .. F#5 78)

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

export type AerophoneMode = "long-tone" | "swell" | "articulation" | "interval-landing";
export const AEROPHONE_MODES = [
  { id: "long-tone", label: "Long tone", seconds: [3, 5, 8] },
  { id: "swell", label: "Swell", seconds: [4, 6, 8] },
  { id: "articulation", label: "Articulation", bpm: [70, 90, 110], count: 8 },
  { id: "interval-landing", label: "Interval landing" },
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
  "long-tone": ["technique.aerophone", "technique.aerophone.breath-steadiness"],
  swell: ["technique.aerophone", "technique.aerophone.dynamic-control"],
  articulation: ["technique.aerophone", "technique.aerophone.articulation"],
  "interval-landing": [
    "technique.aerophone",
    "technique.aerophone.interval-landing",
    "intonation.interval-landing",
  ],
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

export const RUDIMENTS = MPC_RUDIMENTS.patterns;
export const RUDIMENT_TEMPOS = [60, 80, 100, 120];
export const RUDIMENT_HIT_COUNTS = [8, 16] as const;
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

export const rudimentSkills = (patternId: string) => [
  "technique.mpc",
  patternId === "paradiddle" ? "technique.mpc.paradiddles" : "technique.mpc.single-strokes",
];

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
  const [leftPad, rightPad] = opts.pads ?? RUDIMENT_DEFAULTS.pads;
  if (leftPad === rightPad) throw new Error("A rudiment needs two different pads.");
  const sub = p.subdivision ?? opts.subdivision;
  const step = 60000 / clamp(opts.bpm, 30, 240) / sub;
  const out: PadHit[] = [];
  for (let i = 0; i < opts.hits; i++) {
    const hand = p.unit[i % p.unit.length];
    const moving = p.accentMode === "moving";
    const accent = moving && i % sub === Math.floor(i / sub) % sub;
    const atMs = i * step;
    if (p.flam) {
      const other = hand === "left" ? "right" : "left";
      out.push({
        index: -1,
        atMs: atMs - MPC_RUDIMENTS.flamGraceMs,
        hand: other,
        pad: other === "left" ? leftPad : rightPad,
        accent: false,
        grace: true,
      });
    }
    out.push({
      index: i,
      atMs,
      hand,
      pad: hand === "left" ? leftPad : rightPad,
      accent,
      grace: false,
      ...(moving ? { velocityBand: accent ? VELOCITY_BANDS.accent : VELOCITY_BANDS.tap } : {}),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// MPC grooves

export const GROOVES = MPC_GROOVES.catalog;
export const GROOVE_VOICES = MPC_GROOVES.voices;
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
  section: "groove" | "fill";
}

/**
 * A groove's targets from the downbeat, with the voice's pad note and the bar's
 * section (a target past the last bar, like turnaround-fill's bar-5 kick, belongs
 * to the last section). Match window = min(180 ms, beat / 8).
 */
export function grooveTargets(grooveId: string, bpm: number) {
  const g = GROOVES.find((x) => x.value === grooveId) ?? GROOVES[0];
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

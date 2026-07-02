import type { NoteEvent, NoteOnEvent } from "@repo/music-core/domain";
import { chordNotes, midiToNote, pitchClass, scaleNotes } from "@repo/music-core/engines/theory";

export type ToneRole = "chord" | "scale" | "avoid";

export interface TargetTone {
  pitchClass: number;
  note: string;
  role: ToneRole;
}

export interface JamChord {
  symbol: string;
  roman: string;
  scale: string;
  bars: number;
}

export interface JamProgression {
  id: string;
  name: string;
  key: string;
  style: "jazz" | "blues" | "modal";
  chords: JamChord[];
}

export const JAM_PROGRESSIONS: JamProgression[] = [
  {
    id: "ii-v-i",
    name: "ii–V–I",
    key: "C major",
    style: "jazz",
    chords: [
      { symbol: "Dm7", roman: "ii", scale: "D dorian", bars: 2 },
      { symbol: "G7", roman: "V", scale: "G mixolydian", bars: 2 },
      { symbol: "Cmaj7", roman: "I", scale: "C major", bars: 2 },
      { symbol: "A7", roman: "VI", scale: "A mixolydian", bars: 2 },
    ],
  },
  {
    id: "minor-ii-v-i",
    name: "Minor ii–V–i",
    key: "C minor",
    style: "jazz",
    chords: [
      { symbol: "Dm7b5", roman: "iiø", scale: "D locrian", bars: 2 },
      { symbol: "G7alt", roman: "V7alt", scale: "G altered", bars: 2 },
      { symbol: "Cm7", roman: "i", scale: "C dorian", bars: 2 },
    ],
  },
  {
    id: "blues",
    name: "12-bar blues",
    key: "C",
    style: "blues",
    chords: [
      { symbol: "C7", roman: "I7", scale: "C mixolydian", bars: 4 },
      { symbol: "F7", roman: "IV7", scale: "F mixolydian", bars: 2 },
      { symbol: "C7", roman: "I7", scale: "C mixolydian", bars: 2 },
      { symbol: "G7", roman: "V7", scale: "G mixolydian", bars: 2 },
      { symbol: "C7", roman: "I7", scale: "C mixolydian", bars: 2 },
    ],
  },
  {
    id: "modal",
    name: "Modal vamp",
    key: "D dorian",
    style: "modal",
    chords: [
      { symbol: "Dm7", roman: "i", scale: "D dorian", bars: 4 },
      { symbol: "Em7", roman: "ii", scale: "E dorian", bars: 4 },
    ],
  },
];

export interface ChordProgressionDrillConfig {
  progressionId: string;
  bpm: number;
}

export type JamBackingMode = "drums" | "chords";

export interface JamPracticeConfig {
  progressionId: string;
  backingMode: JamBackingMode;
  drumTrackId: string;
  bpm: number;
}

export type ChordProgressionDrillConfigSource =
  | URLSearchParams
  | {
      progression?: unknown;
      progressionId?: unknown;
      bpm?: unknown;
      tempo?: unknown;
    };

export type JamPracticeConfigSource =
  | URLSearchParams
  | {
      progression?: unknown;
      progressionId?: unknown;
      backing?: unknown;
      backingMode?: unknown;
      source?: unknown;
      drums?: unknown;
      drumTrack?: unknown;
      drumTrackId?: unknown;
      bpm?: unknown;
      tempo?: unknown;
    };

export interface JamPracticeConfigOptions {
  drumTrackIds?: readonly string[];
  defaultDrumTrackId?: string;
}

export const CHORD_PROGRESSION_DRILL_DEFAULT_CONFIG: ChordProgressionDrillConfig = {
  progressionId: JAM_PROGRESSIONS[0]!.id,
  bpm: 90,
};

export const JAM_PRACTICE_DEFAULT_CONFIG: JamPracticeConfig = {
  progressionId: JAM_PROGRESSIONS[0]!.id,
  backingMode: "drums",
  drumTrackId: "swing-125",
  bpm: 96,
};

export function normalizeChordProgressionDrillConfig(
  source: ChordProgressionDrillConfigSource,
): ChordProgressionDrillConfig {
  return {
    progressionId: normalizeProgressionId(
      readProgressionConfigValue(source, ["progression", "progressionId"]),
    ),
    bpm: normalizeProgressionTempo(readProgressionConfigValue(source, ["bpm", "tempo"])),
  };
}

export function normalizeJamPracticeConfig(
  source: JamPracticeConfigSource,
  options: JamPracticeConfigOptions = {},
): JamPracticeConfig {
  const defaultDrumTrackId = normalizeDefaultDrumTrackId(options);
  return {
    progressionId: normalizeProgressionId(
      readJamConfigValue(source, ["progression", "progressionId"]),
    ),
    backingMode: normalizeJamBackingMode(
      readJamConfigValue(source, ["backing", "backingMode", "source"]),
    ),
    drumTrackId: normalizeJamDrumTrackId(
      readJamConfigValue(source, ["drums", "drumTrack", "drumTrackId"]),
      options.drumTrackIds,
      defaultDrumTrackId,
    ),
    bpm: normalizeProgressionTempo(
      readJamConfigValue(source, ["bpm", "tempo"]),
      JAM_PRACTICE_DEFAULT_CONFIG.bpm,
    ),
  };
}

/** Roles for all 12 pitch classes against the current chord + scale. */
export function targetTones(chordSymbol: string, scaleName: string): TargetTone[] {
  const chordPitchClasses = new Set(chordNotes(chordSymbol).map((name) => pitchClass(name)));
  const scalePitchClasses = new Set(scaleNotes(scaleName).map((name) => pitchClass(name)));

  return Array.from({ length: 12 }, (_, pitchClass) => {
    let role: ToneRole;
    if (chordPitchClasses.has(pitchClass)) role = "chord";
    else if (scalePitchClasses.has(pitchClass)) role = "scale";
    else role = "avoid";
    return { pitchClass, note: midiToNote(60 + pitchClass), role };
  });
}

export class JamSession {
  #progression: JamProgression;
  #index = 0;
  #recorded: NoteOnEvent[] = [];

  constructor(progression: JamProgression) {
    this.#progression = progression;
  }

  get progression(): JamProgression {
    return this.#progression;
  }

  get index(): number {
    return this.#index;
  }

  get current(): JamChord {
    return this.#progression.chords[this.#index]!;
  }

  get next(): JamChord {
    const chords = this.#progression.chords;
    return chords[(this.#index + 1) % chords.length]!;
  }

  advance(): JamChord {
    this.#index = (this.#index + 1) % this.#progression.chords.length;
    return this.current;
  }

  reset(): void {
    this.#index = 0;
  }

  targetTones(): TargetTone[] {
    return targetTones(this.current.symbol, this.current.scale);
  }

  record(event: NoteEvent): void {
    if (event.type === "noteOn") this.#recorded.push(event);
  }

  recorded(): NoteOnEvent[] {
    return [...this.#recorded];
  }

  clearRecording(): void {
    this.#recorded = [];
  }
}

function readProgressionConfigValue(
  source: ChordProgressionDrillConfigSource,
  keys: string[],
): string | undefined {
  if (source instanceof URLSearchParams) {
    for (const key of keys) {
      const value = source.get(key);
      if (value !== null) return value;
    }
    return undefined;
  }

  for (const key of keys) {
    const value = source[key as keyof typeof source];
    if (typeof value === "string") return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function normalizeProgressionId(value: string | undefined): string {
  return (
    JAM_PROGRESSIONS.find((entry) => entry.id === value)?.id ??
    CHORD_PROGRESSION_DRILL_DEFAULT_CONFIG.progressionId
  );
}

function normalizeProgressionTempo(
  value: string | undefined,
  defaultBpm = CHORD_PROGRESSION_DRILL_DEFAULT_CONFIG.bpm,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultBpm;
  return Math.min(220, Math.max(40, Math.round(parsed)));
}

function readJamConfigValue(source: JamPracticeConfigSource, keys: string[]): string | undefined {
  if (source instanceof URLSearchParams) {
    for (const key of keys) {
      const value = source.get(key);
      if (value !== null) return value;
    }
    return undefined;
  }

  for (const key of keys) {
    const value = source[key as keyof typeof source];
    if (typeof value === "string") return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function normalizeJamBackingMode(value: string | undefined): JamBackingMode {
  if (value === "chords" || value === "generated" || value === "synth") return "chords";
  if (value === "drums" || value === "drum" || value === "builtin") return "drums";
  return JAM_PRACTICE_DEFAULT_CONFIG.backingMode;
}

function normalizeDefaultDrumTrackId(options: JamPracticeConfigOptions): string {
  if (options.defaultDrumTrackId && options.drumTrackIds?.includes(options.defaultDrumTrackId)) {
    return options.defaultDrumTrackId;
  }
  return options.drumTrackIds?.[0] ?? JAM_PRACTICE_DEFAULT_CONFIG.drumTrackId;
}

function normalizeJamDrumTrackId(
  value: string | undefined,
  drumTrackIds: readonly string[] | undefined,
  defaultDrumTrackId: string,
): string {
  if (!value) return defaultDrumTrackId;
  if (!drumTrackIds || drumTrackIds.length === 0) return value;
  return drumTrackIds.includes(value) ? value : defaultDrumTrackId;
}

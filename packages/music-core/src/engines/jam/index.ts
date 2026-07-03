import type { NoteEvent, NoteOnEvent } from "@repo/music-core/domain";
import {
  chordNotes,
  midiToNote,
  pitchClass,
  scaleNotes,
  transpose,
} from "@repo/music-core/engines/theory";

export type ToneRole = "chord" | "scale" | "avoid";
export type JamProgressionGroup = "pop" | "guitar-uke" | "jazz" | "blues" | "modal";

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
  style: "pop" | "guitar-uke" | "jazz" | "blues" | "modal";
  group?: JamProgressionGroup;
  difficulty?: "beginner" | "intermediate" | "advanced";
  instrumentFit?: readonly ("piano" | "guitar" | "ukulele" | "aerophone")[];
  tags?: readonly string[];
  defaultBpm?: number;
  keyRoot?: string;
  transposable?: boolean;
  chords: JamChord[];
}

export const JAM_PROGRESSION_GROUPS: readonly { id: JamProgressionGroup; label: string }[] = [
  { id: "pop", label: "Pop" },
  { id: "guitar-uke", label: "Guitar/Uke" },
  { id: "jazz", label: "Jazz" },
  { id: "blues", label: "Blues" },
  { id: "modal", label: "Modal" },
] as const;

const DEFAULT_PROGRESSION_ID = "ii-v-i";

export const JAM_PROGRESSIONS: JamProgression[] = [
  {
    id: "ii-v-i",
    name: "ii–V–I",
    key: "C major",
    style: "jazz",
    group: "jazz",
    difficulty: "intermediate",
    instrumentFit: ["piano", "guitar", "ukulele", "aerophone"],
    tags: ["ii-v-i", "turnaround", "jazz"],
    defaultBpm: 110,
    keyRoot: "C",
    transposable: true,
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
    group: "jazz",
    difficulty: "advanced",
    instrumentFit: ["piano", "guitar", "ukulele", "aerophone"],
    tags: ["minor", "ii-v-i", "jazz"],
    defaultBpm: 96,
    keyRoot: "C",
    transposable: true,
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
    group: "blues",
    difficulty: "beginner",
    instrumentFit: ["piano", "guitar", "ukulele", "aerophone"],
    tags: ["blues", "dominant", "12-bar"],
    defaultBpm: 95,
    keyRoot: "C",
    transposable: true,
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
    group: "modal",
    difficulty: "beginner",
    instrumentFit: ["piano", "guitar", "ukulele", "aerophone"],
    tags: ["modal", "vamp", "dorian"],
    defaultBpm: 84,
    keyRoot: "D",
    transposable: true,
    chords: [
      { symbol: "Dm7", roman: "i", scale: "D dorian", bars: 4 },
      { symbol: "Em7", roman: "ii", scale: "E dorian", bars: 4 },
    ],
  },
  {
    id: "pop-axis",
    name: "I–V–vi–IV",
    key: "C major",
    style: "pop",
    group: "pop",
    difficulty: "beginner",
    instrumentFit: ["piano", "guitar", "ukulele", "aerophone"],
    tags: ["pop", "loop", "diatonic"],
    defaultBpm: 92,
    keyRoot: "C",
    transposable: true,
    chords: [
      { symbol: "C", roman: "I", scale: "C major", bars: 1 },
      { symbol: "G", roman: "V", scale: "G mixolydian", bars: 1 },
      { symbol: "Am", roman: "vi", scale: "A aeolian", bars: 1 },
      { symbol: "F", roman: "IV", scale: "F lydian", bars: 1 },
    ],
  },
  {
    id: "guitar-g-d-em-c",
    name: "G–D–Em–C",
    key: "G major",
    style: "guitar-uke",
    group: "guitar-uke",
    difficulty: "beginner",
    instrumentFit: ["guitar", "ukulele", "piano"],
    tags: ["open-chords", "strumming", "pop"],
    defaultBpm: 96,
    keyRoot: "G",
    transposable: true,
    chords: [
      { symbol: "G", roman: "I", scale: "G major", bars: 1 },
      { symbol: "D", roman: "V", scale: "D mixolydian", bars: 1 },
      { symbol: "Em", roman: "vi", scale: "E aeolian", bars: 1 },
      { symbol: "C", roman: "IV", scale: "C lydian", bars: 1 },
    ],
  },
];

export interface ChordProgressionDrillConfig {
  group: JamProgressionGroup;
  progressionId: string;
  bpm: number;
  transpose: number;
}

export type JamBackingMode = "drums" | "chords";

export interface JamPracticeConfig {
  group: JamProgressionGroup;
  progressionId: string;
  backingMode: JamBackingMode;
  drumTrackId: string;
  bpm: number;
  transpose: number;
}

export type ChordProgressionDrillConfigSource =
  | URLSearchParams
  | {
      progression?: unknown;
      progressionId?: unknown;
      group?: unknown;
      bpm?: unknown;
      tempo?: unknown;
      transpose?: unknown;
    };

export type JamPracticeConfigSource =
  | URLSearchParams
  | {
      progression?: unknown;
      progressionId?: unknown;
      group?: unknown;
      backing?: unknown;
      backingMode?: unknown;
      source?: unknown;
      drums?: unknown;
      drumTrack?: unknown;
      drumTrackId?: unknown;
      bpm?: unknown;
      tempo?: unknown;
      transpose?: unknown;
    };

export interface JamPracticeConfigOptions {
  drumTrackIds?: readonly string[];
  defaultDrumTrackId?: string;
}

export const CHORD_PROGRESSION_DRILL_DEFAULT_CONFIG: ChordProgressionDrillConfig = {
  group: defaultProgression().group ?? "jazz",
  progressionId: defaultProgression().id,
  bpm: defaultProgression().defaultBpm ?? 110,
  transpose: 0,
};

export const JAM_PRACTICE_DEFAULT_CONFIG: JamPracticeConfig = {
  group: defaultProgression().group ?? "jazz",
  progressionId: defaultProgression().id,
  backingMode: "drums",
  drumTrackId: "swing-125",
  bpm: defaultProgression().defaultBpm ?? 110,
  transpose: 0,
};

export function normalizeChordProgressionDrillConfig(
  source: ChordProgressionDrillConfigSource,
): ChordProgressionDrillConfig {
  const requestedGroup = normalizeProgressionGroup(readProgressionConfigValue(source, ["group"]));
  const progressionId = normalizeProgressionId(
    readProgressionConfigValue(source, ["progression", "progressionId"]),
    requestedGroup,
  );
  const progression = progressionById(progressionId);
  return {
    group: progression.group ?? CHORD_PROGRESSION_DRILL_DEFAULT_CONFIG.group,
    progressionId,
    bpm: normalizeProgressionTempo(
      readProgressionConfigValue(source, ["bpm", "tempo"]),
      progression.defaultBpm ?? CHORD_PROGRESSION_DRILL_DEFAULT_CONFIG.bpm,
    ),
    transpose: normalizeTranspose(
      readProgressionConfigValue(source, ["transpose"]),
      progression.transposable !== false,
    ),
  };
}

export function normalizeJamPracticeConfig(
  source: JamPracticeConfigSource,
  options: JamPracticeConfigOptions = {},
): JamPracticeConfig {
  const defaultDrumTrackId = normalizeDefaultDrumTrackId(options);
  const requestedGroup = normalizeProgressionGroup(readJamConfigValue(source, ["group"]));
  const progressionId = normalizeProgressionId(
    readJamConfigValue(source, ["progression", "progressionId"]),
    requestedGroup,
  );
  const progression = progressionById(progressionId);
  return {
    group: progression.group ?? JAM_PRACTICE_DEFAULT_CONFIG.group,
    progressionId,
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
      progression.defaultBpm ?? JAM_PRACTICE_DEFAULT_CONFIG.bpm,
    ),
    transpose: normalizeTranspose(
      readJamConfigValue(source, ["transpose"]),
      progression.transposable !== false,
    ),
  };
}

export function transposeProgression(
  progression: JamProgression,
  semitones: number,
): JamProgression {
  if (semitones === 0 || progression.transposable === false) return cloneProgression(progression);
  return {
    ...cloneProgression(progression),
    key: transposeLeadNote(progression.key, semitones),
    keyRoot: progression.keyRoot ? transpose(progression.keyRoot, semitones) : undefined,
    chords: progression.chords.map((chord) => ({
      ...chord,
      symbol: transposeChordSymbol(chord.symbol, semitones),
      scale: transposeLeadNote(chord.scale, semitones),
    })),
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

function normalizeProgressionId(
  value: string | undefined,
  requestedGroup = CHORD_PROGRESSION_DRILL_DEFAULT_CONFIG.group,
): string {
  const matchingProgression = JAM_PROGRESSIONS.find((entry) => entry.id === value);
  if (matchingProgression) return matchingProgression.id;
  const matchingGroupProgression = JAM_PROGRESSIONS.find((entry) => entry.group === requestedGroup);
  return matchingGroupProgression?.id ?? CHORD_PROGRESSION_DRILL_DEFAULT_CONFIG.progressionId;
}

function progressionById(progressionId: string): JamProgression {
  return JAM_PROGRESSIONS.find((entry) => entry.id === progressionId) ?? defaultProgression();
}

function normalizeProgressionGroup(value: string | undefined): JamProgressionGroup {
  return JAM_PROGRESSION_GROUPS.some((group) => group.id === value)
    ? (value as JamProgressionGroup)
    : CHORD_PROGRESSION_DRILL_DEFAULT_CONFIG.group;
}

function normalizeProgressionTempo(
  value: string | undefined,
  defaultBpm = CHORD_PROGRESSION_DRILL_DEFAULT_CONFIG.bpm,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultBpm;
  return Math.min(220, Math.max(40, Math.round(parsed)));
}

function normalizeTranspose(value: string | undefined, transposable: boolean): number {
  if (!transposable) return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  const rounded = Math.round(parsed);
  return Math.abs(rounded) <= 12 ? rounded : 0;
}

function transposeChordSymbol(symbol: string, semitones: number): string {
  return symbol.replace(/^([A-G](?:#|b)?)(.*)$/u, (_, root: string, suffix: string) => {
    return `${transpose(root, semitones)}${suffix}`;
  });
}

function transposeLeadNote(label: string, semitones: number): string {
  return label.replace(/^([A-G](?:#|b)?)(.*)$/u, (_, root: string, suffix: string) => {
    return `${transpose(root, semitones)}${suffix}`;
  });
}

function defaultProgression(): JamProgression {
  return (
    JAM_PROGRESSIONS.find((entry) => entry.id === DEFAULT_PROGRESSION_ID) ?? JAM_PROGRESSIONS[0]!
  );
}

function cloneProgression(progression: JamProgression): JamProgression {
  return {
    ...progression,
    instrumentFit: progression.instrumentFit ? [...progression.instrumentFit] : undefined,
    tags: progression.tags ? [...progression.tags] : undefined,
    chords: progression.chords.map((chord) => ({ ...chord })),
  };
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

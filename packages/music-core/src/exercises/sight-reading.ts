import { Key, Note } from "tonal";

import {
  Capability,
  type ExerciseDefinition,
  type ExerciseRun,
  type MonotonicMs,
  type Score,
  type ScoreNote,
  type ScoreRest,
  type TupletMark,
} from "@repo/music-core/domain";
import {
  notationView,
  spellMidiForKey,
  type Clef,
  type NotationView,
} from "@repo/music-core/engines/notation";
import { projectPlayableGroup } from "@repo/music-core/engines/projection";
import {
  createScoreFollower,
  expectedGroups,
  type ExpectedNoteGroup,
  type ScoreFollowerAnswer,
  type ScoreFollowerMode,
  type TimingStrictness,
} from "@repo/music-core/engines/score-follower";
import { curatedTunings, type TuningProfile } from "@repo/music-core/engines/tunings";

export interface SightReadingOptions {
  instrument: "piano" | "guitar" | "ukulele";
  tuning?: TuningProfile;
  keySignature: string;
  clefs: Clef[];
  measures: number;
  bpm: number;
  timeSignature: { numerator: number; denominator: number };
  mode: ScoreFollowerMode;
  strictness: TimingStrictness;
  difficulty: number;
  readingLevel?: ReadingLevelId;
  transposeSemitones?: number;
  startTimestampMs?: MonotonicMs;
}

export type ReadingLevelId = "primer" | "level-1" | "level-2" | "level-3";

export interface ReadingLevelMetadata {
  id: ReadingLevelId;
  label: string;
  description: string;
  rhythm: string;
  recommendedDifficulty: number;
  recommendedClefs: Clef[];
  recommendedRange: { lowestMidi: number; highestMidi: number };
  recommendedKeys: string[];
}

export const READING_LEVELS: ReadingLevelMetadata[] = [
  {
    id: "primer",
    label: "Primer",
    description: "Landmark notes and stepwise motion.",
    rhythm: "quarters and halves",
    recommendedDifficulty: 0.2,
    recommendedClefs: ["treble"],
    recommendedRange: { lowestMidi: 60, highestMidi: 72 },
    recommendedKeys: ["C major"],
  },
  {
    id: "level-1",
    label: "Level 1",
    description: "Stepwise phrases in familiar keys.",
    rhythm: "quarters, halves, and simple eighths",
    recommendedDifficulty: 0.4,
    recommendedClefs: ["treble"],
    recommendedRange: { lowestMidi: 55, highestMidi: 79 },
    recommendedKeys: ["C major", "G major", "F major"],
  },
  {
    id: "level-2",
    label: "Level 2",
    description: "Wider range, bass-clef option, and quicker movement.",
    rhythm: "eighth-note motion",
    recommendedDifficulty: 0.55,
    recommendedClefs: ["treble", "bass"],
    recommendedRange: { lowestMidi: 48, highestMidi: 84 },
    recommendedKeys: ["C major", "G major", "F major", "A minor", "E minor"],
  },
  {
    id: "level-3",
    label: "Level 3",
    description: "Compound meter, syncopation, and mixed rhythmic values.",
    rhythm: "eighths and syncopation",
    recommendedDifficulty: 0.7,
    recommendedClefs: ["treble", "bass"],
    recommendedRange: { lowestMidi: 43, highestMidi: 88 },
    recommendedKeys: ["C major", "G major", "D major", "F major", "Bb major", "D minor"],
  },
];

export interface SightReadingPrompt {
  score: Score;
  notation: NotationView;
  groups: ExpectedNoteGroup[];
  options: SightReadingOptions;
  readingLevel?: ReadingLevelMetadata;
  transposeSemitones: number;
}

export interface CreateSightReadingExerciseOptions {
  random?: () => number;
  options: SightReadingOptions;
}

export function createSightReadingExercise({
  random = Math.random,
  options,
}: CreateSightReadingExerciseOptions): ExerciseDefinition<SightReadingPrompt, ScoreFollowerAnswer> {
  validateOptions(options);

  return {
    id: "reading.sight-reading.generated",
    name: "Generated Sight Reading",
    capabilities: [Capability.Reading],
    skillIds: sightReadingSkills(options),
    inputs: ["midi", "onscreen", "audio"],
    streaming: true,
    generate: () => {
      const score = generateScore(options, random);
      const groups = expectedGroups(score);
      const readingLevel = readingLevelFor(options.readingLevel);
      const transposeSemitones = normalizeTranspose(options.transposeSemitones);

      return {
        id: `sight-reading:${options.instrument}:${options.keySignature}:${score.id}`,
        payload: {
          score,
          notation: notationView(score),
          groups,
          options,
          ...(readingLevel === undefined ? {} : { readingLevel }),
          transposeSemitones,
        },
        scoreId: score.id,
      };
    },
    createRun(prompt): ExerciseRun<ScoreFollowerAnswer> {
      return createScoreFollower(prompt.payload.groups, {
        mode: prompt.payload.options.mode,
        bpm: prompt.payload.options.bpm,
        strictness: prompt.payload.options.strictness,
        ...(prompt.payload.options.startTimestampMs === undefined
          ? {}
          : { startTimestampMs: prompt.payload.options.startTimestampMs }),
      });
    },
  };
}

function generateScore(options: SightReadingOptions, random: () => number): Score {
  const voices = voicesFor(options);
  const rests: ScoreRest[] = [];
  const readingLevel = readingLevelFor(options.readingLevel);
  const transposeSemitones = normalizeTranspose(options.transposeSemitones);
  const notes =
    options.instrument === "piano"
      ? pianoNotes(options, random, rests)
      : stringInstrumentNotes(options, random);

  return {
    id: [
      "sight-reading",
      options.instrument,
      options.keySignature.replace(/\s+/g, "-").toLowerCase(),
      options.timeSignature.numerator,
      options.timeSignature.denominator,
      options.measures,
      Math.round(options.difficulty * 100),
      transposeSemitones,
    ].join(":"),
    title: "Generated sight reading",
    origin: "generated",
    keySignature: options.keySignature,
    tempoMap: [{ atBeat: 0, bpm: options.bpm }],
    timeSignatures: [{ atBeat: 0, ...options.timeSignature }],
    voices,
    notes,
    ...(rests.length === 0 ? {} : { rests }),
    chords: [],
    sections: [
      {
        id: "full-phrase",
        name: "Full phrase",
        startBeat: 0,
        endBeat: measureDuration(options) * options.measures,
      },
    ],
    markers: [
      ...(readingLevel === undefined
        ? []
        : [
            {
              id: "reading-level",
              beat: 0,
              label: readingLevel.label,
              kind: "practice" as const,
            },
          ]),
      ...(transposeSemitones === 0
        ? []
        : [
            {
              id: "transpose",
              beat: 0,
              label: `Transpose ${transposeSemitones} st`,
              kind: "practice" as const,
            },
          ]),
    ],
  };
}

function pianoNotes(
  options: SightReadingOptions,
  random: () => number,
  rests: ScoreRest[],
): ScoreNote[] {
  if (options.difficulty >= 0.8) return advancedPianoNotes(options, rests);

  const notes: ScoreNote[] = [];
  const duration = options.difficulty < 0.3 ? 1 : options.difficulty < 0.6 ? 0.5 : 0.25;
  const totalBeats = measureDuration(options) * options.measures;
  const scale = scaleMidi(options.keySignature);
  let rightIndex = Math.floor(random() * 3);
  let leftIndex = Math.floor(random() * 3);

  for (let beat = 0; beat < totalBeats; beat += duration) {
    if (options.clefs.includes("treble")) {
      const midiNote = scale[(rightIndex % 8) + 7]!;
      notes.push(note(options, "right-hand", midiNote, beat, duration));
      rightIndex += options.difficulty >= 0.6 ? 2 : 1;
    }
    if (options.clefs.includes("bass")) {
      const midiNote = scale[leftIndex % 7]!;
      notes.push(note(options, "left-hand", midiNote, beat, duration));
      leftIndex += 1;
    }
  }

  return notes;
}

function advancedPianoNotes(options: SightReadingOptions, rests: ScoreRest[]): ScoreNote[] {
  const triplet: TupletMark = { id: "triplet:1", actual: 3, normal: 2 };
  const tie = { id: "tie:1", start: true };
  const tieStop = { id: "tie:1", stop: true };
  const notes: ScoreNote[] = [
    note(options, "right-hand", 64, 0, 0.5),
    note(options, "left-hand", 48, 0, 0.5),
    { ...note(options, "right-hand", 65, 0.5, 0.5), tie },
    { ...note(options, "right-hand", 65, 1, 0.5), tie: tieStop },
    { ...note(options, "right-hand", 67, 1.5, 1 / 3), tuplet: triplet },
    { ...note(options, "right-hand", 69, 1.5 + 1 / 3, 1 / 3), tuplet: triplet },
    { ...note(options, "right-hand", 71, 1.5 + 2 / 3, 1 / 3), tuplet: triplet },
    note(options, "right-hand", 72, 2.5, 0.25),
    note(options, "left-hand", 52, 1.5, 0.5),
    note(options, "left-hand", 55, 2.5, 0.25),
  ];

  rests.push({ voiceId: "left-hand", startBeat: 0.5, durationBeats: 1 });
  return notes;
}

function stringInstrumentNotes(options: SightReadingOptions, random: () => number): ScoreNote[] {
  const tuning = tuningFor(options);
  const totalBeats = measureDuration(options) * options.measures;
  const duration = options.difficulty < 0.6 ? 1 : 0.5;
  const playable = playableStringGroups(tuning);
  const notes: ScoreNote[] = [];
  let groupIndex = Math.floor(random() * playable.length);

  for (let beat = 0; beat < totalBeats; beat += duration) {
    const midiNotes = playable[groupIndex % playable.length]!;
    for (const midiNote of midiNotes) notes.push(note(options, "melody", midiNote, beat, duration));
    groupIndex += 1;
  }

  return notes;
}

function playableStringGroups(tuning: TuningProfile): number[][] {
  const openStrings = [...tuning.openStrings].sort((left, right) => left - right);
  const candidates = [
    [openStrings[0]!],
    [openStrings[1] ?? openStrings[0]!],
    [openStrings[0]!, openStrings[1] ?? openStrings[0]!],
    [openStrings[2] ?? openStrings[0]!],
  ];
  const playable = candidates.filter((group) => projectPlayableGroup(group, tuning));
  if (playable.length === 0) throw new Error(`No playable sight-reading groups for ${tuning.name}`);
  return playable;
}

function note(
  options: SightReadingOptions,
  voiceId: string,
  writtenConcertMidi: number,
  startBeat: number,
  durationBeats: number,
): ScoreNote {
  const tuning = options.instrument === "piano" ? undefined : tuningFor(options);
  const midiNote = writtenConcertMidi + normalizeTranspose(options.transposeSemitones);
  const writtenMidi = writtenConcertMidi - (tuning?.notationTransposition ?? 0);
  return {
    midiNote,
    writtenPitch: spellMidiForKey(writtenMidi, options.keySignature),
    startBeat,
    durationBeats,
    velocity: 0.8,
    voiceId,
  };
}

function voicesFor(options: SightReadingOptions) {
  if (options.instrument !== "piano") {
    return [{ id: "melody", name: "Melody", role: "melody" as const }];
  }

  return [
    ...(options.clefs.includes("treble")
      ? [{ id: "right-hand", name: "Right Hand", role: "melody" as const }]
      : []),
    ...(options.clefs.includes("bass")
      ? [{ id: "left-hand", name: "Left Hand", role: "bass" as const }]
      : []),
  ];
}

function tuningFor(options: SightReadingOptions): TuningProfile {
  if (options.instrument === "piano") throw new Error("Piano does not use a tuning profile");
  return options.tuning ?? curatedTunings(options.instrument)[0]!;
}

function measureDuration(options: SightReadingOptions): number {
  return options.timeSignature.numerator * (4 / options.timeSignature.denominator);
}

function scaleMidi(keySignature: string): number[] {
  const scale = scalePitchClasses(keySignature);
  const result: number[] = [];
  for (let octave = 2; octave <= 5; octave += 1) {
    for (const pitch of scale) {
      const midi = Note.midi(`${pitch}${octave}`);
      if (midi !== null) result.push(midi);
    }
  }
  return result;
}

function scalePitchClasses(keySignature: string): readonly string[] {
  const match = /^(.+)\s+(major|minor)$/i.exec(keySignature.trim());
  if (!match) throw new Error(`Unsupported key signature: ${keySignature}`);
  return match[2]?.toLowerCase() === "minor"
    ? Key.minorKey(match[1]!).natural.scale
    : Key.majorKey(match[1]!).scale;
}

function validateOptions(options: SightReadingOptions): void {
  if (options.measures < 1) throw new Error("Sight-reading needs at least one measure");
  if (options.clefs.length === 0) throw new Error("Choose at least one clef");
  if (options.bpm <= 0) throw new Error("BPM must be positive");
  if (options.difficulty < 0 || options.difficulty > 1) {
    throw new Error("Difficulty must be between 0 and 1");
  }
  if (options.instrument !== "piano" && options.tuning?.instrument !== options.instrument) {
    throw new Error(`A ${options.instrument} tuning is required`);
  }
}

export function readingLevelFor(id: ReadingLevelId | undefined): ReadingLevelMetadata | undefined {
  return READING_LEVELS.find((level) => level.id === id);
}

function normalizeTranspose(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-12, Math.min(12, Math.round(value ?? 0)));
}

function sightReadingSkills(options: SightReadingOptions): string[] {
  const skills: string[] = options.clefs.map((clef) =>
    clef === "bass" ? "reading.bass.sight-reading" : "reading.treble.sight-reading",
  );
  if (options.clefs.length > 1 || options.difficulty >= 0.6) skills.push("reading.polyphonic");
  if (options.timeSignature.numerator % 3 === 0 && options.timeSignature.denominator === 8) {
    skills.push("reading.compound-meter");
  }
  return [...new Set(skills)];
}

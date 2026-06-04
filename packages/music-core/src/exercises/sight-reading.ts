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
  startTimestampMs?: MonotonicMs;
}

export interface SightReadingPrompt {
  score: Score;
  notation: NotationView;
  groups: ExpectedNoteGroup[];
  options: SightReadingOptions;
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
    inputs: ["midi", "onscreen"],
    streaming: true,
    generate: () => {
      const score = generateScore(options, random);
      const groups = expectedGroups(score);

      return {
        id: `sight-reading:${options.instrument}:${options.keySignature}:${score.id}`,
        payload: {
          score,
          notation: notationView(score),
          groups,
          options,
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
    markers: [],
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
  midiNote: number,
  startBeat: number,
  durationBeats: number,
): ScoreNote {
  const tuning = options.instrument === "piano" ? undefined : tuningFor(options);
  const writtenMidi = midiNote - (tuning?.notationTransposition ?? 0);
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

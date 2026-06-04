import { Key, Note } from "tonal";

import {
  Capability,
  isNoteOn,
  monotonicMs,
  type ExerciseDefinition,
  type ExerciseResult,
  type ExerciseRun,
  type NoteEvent,
  type Score,
  type ScoringMetric,
  type WrittenPitch,
} from "@repo/music-core/domain";
import {
  enharmonicEqual,
  spellMidiForKey,
  writtenPitchName,
  type Clef,
} from "@repo/music-core/engines/notation";
import { projectPlayableGroup } from "@repo/music-core/engines/projection";
import type { TuningProfile } from "@repo/music-core/engines/tunings";

export type ReadingPromptKind = "single-note" | "chord";
export type ReadingAnswerMode = "choice" | "play";

export interface NoteReadingOptions {
  instrument: "piano" | "guitar" | "ukulele";
  tuning?: TuningProfile;
  clefs: Clef[];
  keys: string[];
  range: { lowestMidi: number; highestMidi: number };
  promptKind: ReadingPromptKind;
}

export interface NoteReadingPrompt {
  instrument: NoteReadingOptions["instrument"];
  clef: Clef;
  keySignature: string;
  midiNotes: number[];
  writtenPitches: WrittenPitch[];
  choices: string[];
  score: Score;
}

export interface CreateNoteReadingExerciseOptions {
  random?: () => number;
  options: NoteReadingOptions;
}

const CHROMATIC_CHOICES = [
  "C",
  "C#",
  "Db",
  "D",
  "D#",
  "Eb",
  "E",
  "F",
  "F#",
  "Gb",
  "G",
  "G#",
  "Ab",
  "A",
  "A#",
  "Bb",
  "B",
];

export function createNoteReadingExercise({
  random = Math.random,
  options,
}: CreateNoteReadingExerciseOptions): ExerciseDefinition<NoteReadingPrompt, string | number[]> {
  validateOptions(options);

  return {
    id: "reading.flashcard.note-id",
    name: "Note Reading Flashcard",
    capabilities: [Capability.Reading],
    skillIds: readingSkills(options),
    inputs: ["midi", "onscreen", "click"],
    streaming: false,
    generate: () => {
      const keySignature = choose(options.keys, random);
      const clef = choose(options.clefs, random);
      const midiNotes = generateMidiNotes(options, keySignature, random);
      const writtenPitches = midiNotes.map((midi) =>
        spellMidiForKey(writtenMidi(midi, options.tuning), keySignature),
      );
      const score = flashcardScore(midiNotes, writtenPitches, keySignature, clef);

      return {
        id: `reading:${options.instrument}:${keySignature}:${midiNotes.join("-")}`,
        payload: {
          instrument: options.instrument,
          clef,
          keySignature,
          midiNotes,
          writtenPitches,
          choices: choicesFor(writtenPitches, keySignature),
          score,
        },
        scoreId: score.id,
      };
    },
    createRun(prompt) {
      return noteReadingRun(prompt.payload);
    },
  };
}

export function noteReadingChoiceEvent(token: string, choices: string[]): NoteEvent {
  const index = choices.indexOf(token);
  if (index < 0) throw new Error(`Unknown note-reading choice: ${token}`);
  return {
    type: "noteOn",
    midiNote: 0,
    velocity: 1,
    source: "click",
    timestamp: monotonicMs(globalThis.performance?.now() ?? Date.now()),
    clock: "performance",
    raw: { midiData1: index },
  };
}

export const noteReadingFlashcardExercise = createNoteReadingExercise({
  options: {
    instrument: "piano",
    clefs: ["treble"],
    keys: ["C major"],
    range: { lowestMidi: 60, highestMidi: 72 },
    promptKind: "single-note",
  },
});

function noteReadingRun(prompt: NoteReadingPrompt): ExerciseRun<string | number[]> {
  const input: NoteEvent[] = [];
  return {
    accept(event) {
      input.push(event);
    },
    getLiveState() {
      const choice = decodeChoice(input, prompt.choices);
      const notes = uniquePlayedNotes(input);
      return {
        progress: choice === undefined ? Math.min(1, notes.length / prompt.midiNotes.length) : 1,
        runningScore: 0,
        feedback: [],
      };
    },
    finish() {
      return gradePrompt(prompt, input);
    },
  };
}

function gradePrompt(
  prompt: NoteReadingPrompt,
  input: NoteEvent[],
): ExerciseResult<string | number[]> {
  const choice = decodeChoice(input, prompt.choices);
  if (choice !== undefined) return gradeChoice(prompt, choice, input);
  return gradePlayed(prompt, uniquePlayedNotes(input), input);
}

function gradeChoice(
  prompt: NoteReadingPrompt,
  choice: string,
  input: NoteEvent[],
): ExerciseResult<string> {
  const expected = prompt.writtenPitches.map((pitch) => writtenPitchName(pitch));
  const actual = choice.split("-");
  const correct =
    expected.length === actual.length &&
    expected.every((name, index) => enharmonicEqual(name, actual[index]!));
  const expectedLabel = expected.join("-");
  const metrics: ScoringMetric[] = [{ kind: "choice", expected: expectedLabel, actual: choice }];

  return {
    correct,
    score: correct ? 1 : 0,
    metrics,
    feedback: [feedback(correct, prompt)],
    target: {
      label: prompt.writtenPitches.map((pitch) => writtenPitchName(pitch, true)).join(" "),
      midiNotes: [...prompt.midiNotes],
      choice: expectedLabel,
    },
    response: { choice },
    answer: choice,
    input,
  };
}

function gradePlayed(
  prompt: NoteReadingPrompt,
  played: number[],
  input: NoteEvent[],
): ExerciseResult<number[]> {
  const expected = [...prompt.midiNotes].sort((left, right) => left - right);
  const actual = [...played].sort((left, right) => left - right);
  const correct =
    expected.length === actual.length && expected.every((midi, index) => actual[index] === midi);
  const metrics: ScoringMetric[] = expected.map((expectedMidi, index) => ({
    kind: "pitch",
    expectedMidi,
    actualMidi: actual[index],
  }));

  return {
    correct,
    score: correct ? 1 : 0,
    metrics,
    feedback: [feedback(correct, prompt)],
    target: {
      label: prompt.writtenPitches.map((pitch) => writtenPitchName(pitch, true)).join(" "),
      midiNotes: [...prompt.midiNotes],
    },
    response: actual.length === 0 ? undefined : { midiNotes: actual },
    answer: actual,
    input,
  };
}

function feedback(correct: boolean, prompt: NoteReadingPrompt) {
  const label = prompt.writtenPitches.map((pitch) => writtenPitchName(pitch, true)).join(" ");
  return correct
    ? { severity: "good" as const, message: `Found ${label}.` }
    : { severity: "error" as const, message: `Expected ${label}.` };
}

function generateMidiNotes(
  options: NoteReadingOptions,
  keySignature: string,
  random: () => number,
): number[] {
  const candidates = scaleCandidates(options, keySignature);
  if (candidates.length === 0) throw new Error("No readable notes are available for these filters");

  if (options.promptKind === "single-note") return [choose(candidates, random)];

  for (const root of rotateFromRandom(candidates, random)) {
    const chord = scaleTriad(root, keySignature, options.tuning);
    if (chord.every((midi) => midi <= options.range.highestMidi)) {
      if (!options.tuning || projectPlayableGroup(chord, options.tuning)) return chord;
    }
  }
  throw new Error("No playable chord is available for these filters");
}

function scaleCandidates(options: NoteReadingOptions, keySignature: string): number[] {
  const chromas = new Set(scalePitchClasses(keySignature).map((pitch) => Note.chroma(pitch)));
  const candidates: number[] = [];
  for (let midi = options.range.lowestMidi; midi <= options.range.highestMidi; midi += 1) {
    if (chromas.has(Note.chroma(Note.fromMidi(writtenMidi(midi, options.tuning))))) {
      candidates.push(midi);
    }
  }
  return candidates;
}

function scaleTriad(
  rootSoundingMidi: number,
  keySignature: string,
  tuning?: TuningProfile,
): number[] {
  const rootWrittenMidi = writtenMidi(rootSoundingMidi, tuning);
  const scale = scalePitchClasses(keySignature);
  const rootIndex = scale.findIndex((pitch) => Note.chroma(pitch) === rootWrittenMidi % 12);
  const indexes = [rootIndex, (rootIndex + 2) % 7, (rootIndex + 4) % 7];
  const written = indexes.map((index) =>
    nextMidiWithChroma(rootWrittenMidi, Note.chroma(scale[index]!)!),
  );
  for (let index = 1; index < written.length; index += 1) {
    while (written[index]! <= written[index - 1]!) written[index]! += 12;
  }
  return written.map((midi) => soundingMidi(midi, tuning));
}

function choicesFor(pitches: WrittenPitch[], keySignature: string): string[] {
  if (pitches.length === 1) return [...CHROMATIC_CHOICES];

  const answer = pitches.map((pitch) => writtenPitchName(pitch)).join("-");
  const rootMidi = Note.midi(`${writtenPitchName(pitches[0]!)}4`)!;
  const distractors = [1, 2, 3].map((offset) =>
    pitches.map((pitch) => Note.transpose(writtenPitchName(pitch), `${offset}m`)).join("-"),
  );
  return [
    ...new Set([answer, ...distractors, writtenPitchName(spellMidiForKey(rootMidi, keySignature))]),
  ];
}

function flashcardScore(
  midiNotes: number[],
  writtenPitches: WrittenPitch[],
  keySignature: string,
  clef: Clef,
): Score {
  const voiceId = clef === "bass" ? "left-hand" : "right-hand";
  return {
    id: `flashcard:${keySignature}:${midiNotes.join("-")}`,
    origin: "generated",
    keySignature,
    tempoMap: [{ atBeat: 0, bpm: 90 }],
    timeSignatures: [{ atBeat: 0, numerator: 4, denominator: 4 }],
    voices: [
      {
        id: voiceId,
        name: clef === "bass" ? "Left Hand" : "Right Hand",
        role: clef === "bass" ? "bass" : "melody",
      },
    ],
    notes: midiNotes.map((midiNote, index) => ({
      midiNote,
      writtenPitch: writtenPitches[index],
      startBeat: 0,
      durationBeats: 1,
      velocity: 0.8,
      voiceId,
    })),
    chords: [],
    sections: [],
    markers: [],
  };
}

function decodeChoice(input: NoteEvent[], choices: string[]): string | undefined {
  const index = input.find((event) => event.source === "click")?.raw?.midiData1;
  return index === undefined ? undefined : choices[index];
}

function uniquePlayedNotes(input: NoteEvent[]): number[] {
  return [
    ...new Set(
      input
        .filter(isNoteOn)
        .filter((event) => event.source !== "click")
        .map(({ midiNote }) => midiNote),
    ),
  ];
}

function scalePitchClasses(keySignature: string): readonly string[] {
  const match = /^(.+)\s+(major|minor)$/i.exec(keySignature.trim());
  if (!match) throw new Error(`Unsupported key signature: ${keySignature}`);
  return match[2]?.toLowerCase() === "minor"
    ? Key.minorKey(match[1]!).natural.scale
    : Key.majorKey(match[1]!).scale;
}

function writtenMidi(sounding: number, tuning?: TuningProfile): number {
  return sounding - (tuning?.notationTransposition ?? 0);
}

function soundingMidi(written: number, tuning?: TuningProfile): number {
  return written + (tuning?.notationTransposition ?? 0);
}

function nextMidiWithChroma(from: number, chroma: number): number {
  let midi = from;
  while (((midi % 12) + 12) % 12 !== chroma) midi += 1;
  return midi;
}

function rotateFromRandom<T>(items: T[], random: () => number): T[] {
  const index = Math.min(items.length - 1, Math.floor(random() * items.length));
  return [...items.slice(index), ...items.slice(0, index)];
}

function choose<T>(items: T[], random: () => number): T {
  if (items.length === 0) throw new Error("Cannot choose from an empty list");
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))]!;
}

function validateOptions(options: NoteReadingOptions): void {
  if (options.clefs.length === 0) throw new Error("Choose at least one clef");
  if (options.keys.length === 0) throw new Error("Choose at least one key");
  if (options.range.lowestMidi > options.range.highestMidi) throw new Error("Invalid note range");
  if (options.instrument !== "piano" && options.tuning?.instrument !== options.instrument) {
    throw new Error(`A ${options.instrument} tuning is required`);
  }
}

function readingSkills(options: NoteReadingOptions): string[] {
  const skills = options.clefs.flatMap((clef) =>
    clef === "bass"
      ? ["reading.bass.landmarks", "reading.bass.stepwise"]
      : ["reading.treble.landmarks", "reading.treble.stepwise"],
  );
  if (options.promptKind === "chord") skills.push("reading.polyphonic");
  return [...new Set(skills)];
}

import {
  Capability,
  type ExerciseDefinition,
  type ExerciseResult,
  type NoteEvent,
  type ScoringMetric,
} from "@repo/music-core/domain";

import { earTrainingRun, playedMidiNotes, type EarTrainingPromptBase } from "./ear-training";
import { scaleDegreeFreePlayChoices, type ScaleDegreeSetId } from "./scale-degree-recognition";

export interface MelodyDictationPrompt extends EarTrainingPromptBase {
  drill: "melody-dictation";
  degrees: string[];
  degreeSetId: ScaleDegreeSetId;
  tonicMidi: number;
  targetMidiNotes: number[];
}

export interface CreateMelodyDictationExerciseOptions {
  random?: () => number;
}

export function createMelodyDictationExercise(
  options: CreateMelodyDictationExerciseOptions = {},
): ExerciseDefinition<MelodyDictationPrompt, string[]> {
  const random = options.random ?? Math.random;

  return {
    id: "ear.melody-dictation",
    name: "Melody Dictation",
    capabilities: [Capability.EarTraining, Capability.Pitch],
    skillIds: [
      "pitch.scale-degree.1",
      "pitch.scale-degree.b2",
      "pitch.scale-degree.2",
      "pitch.scale-degree.b3",
      "pitch.scale-degree.3",
      "pitch.scale-degree.4",
      "pitch.scale-degree.#4",
      "pitch.scale-degree.5",
      "pitch.scale-degree.b6",
      "pitch.scale-degree.6",
      "pitch.scale-degree.b7",
      "pitch.scale-degree.7",
    ],
    inputs: ["midi", "onscreen"],
    streaming: false,
    generate(ctx) {
      const degreeSetId = scaleDegreeSetId(ctx.metadata?.scaleDegreeSet);
      const tonicMidi = 48 + Math.floor(random() * 13);
      const choices = scaleDegreeFreePlayChoices({ tonicMidi, scaleDegreeSet: degreeSetId });
      const targetToken = ctx.targetSkillIds[0]?.replace("pitch.scale-degree.", "");
      const startIndex = Math.max(
        0,
        choices.findIndex(({ token }) => token === targetToken),
      );
      const phraseLength = ctx.difficulty >= 0.65 ? 4 : 3;
      const phrase = Array.from({ length: phraseLength }, (_, index) => {
        if (index === 0) return choices[startIndex]!;
        if (index === phraseLength - 1) {
          return phraseLength >= 4 ? choices[0]! : choices[startIndex]!;
        }
        if (phraseLength >= 4 && index === phraseLength - 2) return choices[startIndex]!;
        return choices[(startIndex + index) % choices.length]!;
      });
      const targetMidiNotes = phrase.map(({ midiNote }) => midiNote);
      const degrees = phrase.map(({ token }) => token);
      const labels = phrase.map(({ label }) => label);

      return {
        id: `melody-dictation-${degreeSetId}-${degrees.join("-")}`,
        payload: {
          drill: "melody-dictation",
          targetSkillId: `pitch.scale-degree.${degrees[0]}`,
          answerToken: degrees.join("-"),
          answerLabel: labels.join(", "),
          choices: [],
          playback: [
            { midiNotes: [tonicMidi], offsetSeconds: 0, durationSeconds: 0.45 },
            ...targetMidiNotes.map((midiNote, index) => ({
              midiNotes: [midiNote],
              offsetSeconds: roundSeconds(0.6 + index * 0.55),
              durationSeconds: 0.45,
            })),
          ],
          requiredPlayedNotes: targetMidiNotes.length,
          degrees,
          degreeSetId,
          tonicMidi,
          targetMidiNotes,
        },
      };
    },
    createRun(prompt) {
      return earTrainingRun(prompt.payload, (input) => gradeMelodyDictation(prompt.payload, input));
    },
  };
}

export const melodyDictationExercise = createMelodyDictationExercise();

function gradeMelodyDictation(
  prompt: MelodyDictationPrompt,
  input: NoteEvent[],
): ExerciseResult<string[]> {
  const notes = playedMidiNotes(input).slice(0, prompt.targetMidiNotes.length);
  const actualDegrees = notes.map((midiNote) => degreeForMidi(prompt, midiNote));
  const matches = prompt.targetMidiNotes.filter((expected, index) =>
    samePitchClass(expected, notes[index]),
  ).length;
  const score = matches / prompt.targetMidiNotes.length;
  const correct = score === 1;
  const metrics: ScoringMetric[] = prompt.targetMidiNotes.map((expectedMidi, index) => ({
    kind: "pitch",
    expectedMidi,
    actualMidi: notes[index],
  }));

  return {
    correct,
    score,
    metrics,
    feedback: [
      correct
        ? { severity: "good", message: `Correct - ${prompt.answerLabel}.` }
        : {
            severity: "error",
            message: `Target phrase: ${prompt.answerLabel}.`,
          },
    ],
    target: {
      label: prompt.answerLabel,
      midiNotes: prompt.targetMidiNotes,
      choice: prompt.answerToken,
    },
    response: {
      label: actualDegrees.join(", "),
      midiNotes: notes,
      choice: actualDegrees.join("-"),
    },
    answer: actualDegrees,
    input,
  };
}

function scaleDegreeSetId(value: unknown): ScaleDegreeSetId {
  if (
    value === "anchor" ||
    value === "major-pentachord" ||
    value === "major-diatonic" ||
    value === "minor-diatonic" ||
    value === "chromatic-color" ||
    value === "full-current"
  ) {
    return value;
  }
  return "major-pentachord";
}

function degreeForMidi(prompt: MelodyDictationPrompt, midiNote: number): string {
  const pitchClass = (midiNote - prompt.tonicMidi + 120) % 12;
  const expectedIndex = prompt.targetMidiNotes.findIndex((expected) =>
    samePitchClass(expected, midiNote),
  );
  if (expectedIndex >= 0) return prompt.degrees[expectedIndex]!;
  return `${pitchClass}`;
}

function samePitchClass(expected?: number, actual?: number): boolean {
  return (
    expected !== undefined && actual !== undefined && (((expected - actual) % 12) + 12) % 12 === 0
  );
}

function roundSeconds(value: number): number {
  return Math.round(value * 100) / 100;
}

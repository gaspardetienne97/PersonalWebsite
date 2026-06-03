import {
  Capability,
  discreteRun,
  isNoteOn,
  type ExerciseDefinition,
  type ExerciseResult,
  type ScoringMetric,
} from "@repo/music-core/domain";

export interface NoteReadingPrompt {
  clef: "treble" | "bass";
  noteName: string;
  midiNote: number;
}

export const noteReadingFlashcardExercise: ExerciseDefinition<
  NoteReadingPrompt,
  number | undefined
> = {
  id: "reading.flashcard.note-id",
  name: "Note Reading Flashcard",
  capabilities: [Capability.Reading],
  skillIds: ["reading.treble.landmarks"],
  inputs: ["midi", "onscreen", "click"],
  streaming: false,
  generate: () => ({
    id: "reading-c4",
    payload: { clef: "treble", noteName: "C4", midiNote: 60 },
  }),
  createRun(prompt) {
    return discreteRun<number | undefined>((input): ExerciseResult<number | undefined> => {
      const played = input.find(isNoteOn);
      const actualMidi = played?.midiNote;
      const correct = actualMidi === prompt.payload.midiNote;
      const metrics: ScoringMetric[] = [
        { kind: "pitch", expectedMidi: prompt.payload.midiNote, actualMidi },
      ];

      return {
        correct,
        score: correct ? 1 : 0,
        metrics,
        feedback: [
          correct
            ? { severity: "good", message: `Found ${prompt.payload.noteName}.` }
            : { severity: "error", message: `Expected ${prompt.payload.noteName}.` },
        ],
        target: { label: prompt.payload.noteName, midiNotes: [prompt.payload.midiNote] },
        response: actualMidi === undefined ? undefined : { midiNotes: [actualMidi] },
        answer: actualMidi,
        input,
      };
    });
  },
};

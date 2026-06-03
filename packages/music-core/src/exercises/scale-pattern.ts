import {
  Capability,
  type ExerciseDefinition,
  type ExerciseRun,
  type NoteEvent,
  type ScoringMetric,
} from "@repo/music-core/domain";
import { noteToMidi } from "@repo/music-core/engines/theory";

export interface ScalePatternPrompt {
  label: string;
  midiNotes: number[];
  targetSpacingMs: number;
}

export const majorScaleExercise: ExerciseDefinition<ScalePatternPrompt, number[]> = {
  id: "technique.scale.c-major",
  name: "C Major Scale",
  capabilities: [Capability.Technique, Capability.Pitch],
  skillIds: ["technique.scale.major"],
  inputs: ["midi", "onscreen"],
  streaming: true,
  generate: () => ({
    id: "scale-c-major",
    payload: {
      label: "C major",
      midiNotes: ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"].map(noteToMidi),
      targetSpacingMs: 500,
    },
  }),
  createRun(prompt) {
    return scaleRun(prompt.payload);
  },
};

function scaleRun(prompt: ScalePatternPrompt): ExerciseRun<number[]> {
  const input: NoteEvent[] = [];

  return {
    accept(event) {
      if (event.type === "noteOn") {
        input.push(event);
      }
    },
    getLiveState() {
      const progress = Math.min(1, input.length / prompt.midiNotes.length);
      return { progress, runningScore: progress, feedback: [] };
    },
    finish() {
      const played = input.filter((event) => event.type === "noteOn");
      const metrics: ScoringMetric[] = [];
      let correctNotes = 0;

      prompt.midiNotes.forEach((expectedMidi, index) => {
        const actual = played[index]?.type === "noteOn" ? played[index].midiNote : undefined;
        metrics.push({ kind: "pitch", expectedMidi, actualMidi: actual });
        if (actual === expectedMidi) correctNotes += 1;
      });

      const spacings = played
        .slice(1)
        .map((event, index) => Number(event.timestamp) - Number(played[index]!.timestamp));
      const evennessError =
        spacings.length === 0
          ? prompt.targetSpacingMs
          : spacings.reduce((sum, spacing) => sum + Math.abs(spacing - prompt.targetSpacingMs), 0) /
            spacings.length;
      const pitchScore = correctNotes / prompt.midiNotes.length;
      const evennessScore = Math.max(0, 1 - evennessError / 180);
      const score = pitchScore * 0.85 + evennessScore * 0.15;

      return {
        correct: score >= 0.9,
        score,
        metrics,
        feedback: [
          {
            severity: score >= 0.9 ? "good" : "warn",
            message: `Evenness ${Math.round(evennessScore * 100)}%, notes ${correctNotes}/${prompt.midiNotes.length}.`,
          },
        ],
        target: { label: prompt.label, midiNotes: prompt.midiNotes },
        response: { midiNotes: played.map((event) => event.midiNote) },
        answer: played.map((event) => event.midiNote),
        input,
      };
    },
  };
}

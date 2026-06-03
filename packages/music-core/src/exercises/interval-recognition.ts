import {
  Capability,
  discreteRun,
  type ExerciseDefinition,
  type ExerciseResult,
  type ScoringMetric,
} from "@repo/music-core/domain";

interface IntervalPrompt {
  rootMidi: number;
  semitones: number;
  answer: string;
}

export const intervalRecognitionExercise: ExerciseDefinition<IntervalPrompt, string> = {
  id: "ear.interval-recognition",
  name: "Interval Recognition",
  capabilities: [Capability.EarTraining, Capability.Pitch],
  skillIds: ["pitch.interval.m6"],
  inputs: ["click", "midi", "onscreen"],
  streaming: false,
  generate: () => ({
    id: "interval-m6",
    payload: { rootMidi: 60, semitones: 8, answer: "m6" },
  }),
  createRun(prompt) {
    return discreteRun<string>((input): ExerciseResult<string> => {
      const chosen = (input[0]?.raw?.midiData1 ?? -1) === prompt.payload.semitones ? "m6" : "P5";
      const correct = chosen === prompt.payload.answer;
      const metrics: ScoringMetric[] = [
        { kind: "choice", expected: prompt.payload.answer, actual: chosen },
      ];
      return {
        correct,
        score: correct ? 1 : 0,
        latencyMs: 800,
        metrics,
        feedback: [
          correct
            ? { severity: "good", message: "Correct - minor 6th." }
            : {
                severity: "error",
                message: `That was ${prompt.payload.answer}; you chose ${chosen}.`,
              },
        ],
        target: { label: prompt.payload.answer, choice: prompt.payload.answer },
        response: { choice: chosen },
        answer: chosen,
        input,
      };
    });
  },
};

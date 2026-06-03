import {
  Capability,
  type ExerciseDefinition,
  type ExerciseRun,
  type NoteEvent,
  type ScoringMetric,
} from "@repo/music-core/domain";
import { beatDurationMs } from "@repo/music-core/engines/transport";

export interface RhythmPulseOptions {
  bpm: number;
  beats: number;
}

export interface RhythmPulsePrompt {
  bpm: number;
  expectedMs: number[];
}

export function createRhythmPulseExercise(
  options: RhythmPulseOptions,
): ExerciseDefinition<RhythmPulsePrompt, number> {
  return {
    id: "rhythm.quarter-pulse",
    name: "Quarter-Note Pulse",
    capabilities: [Capability.Rhythm],
    skillIds: ["rhythm.quarter-pulse"],
    inputs: ["midi", "onscreen", "audio"],
    streaming: true,
    generate: () => ({
      id: `rhythm-${options.bpm}-${options.beats}`,
      payload: {
        bpm: options.bpm,
        expectedMs: Array.from(
          { length: options.beats },
          (_, index) => index * beatDurationMs(options.bpm),
        ),
      },
    }),
    createRun(prompt) {
      return rhythmRun(prompt.payload.expectedMs);
    },
  };
}

function rhythmRun(expectedMs: number[]): ExerciseRun<number> {
  const hits: NoteEvent[] = [];

  return {
    accept(event) {
      if (event.type === "noteOn" || event.type === "onset") {
        hits.push(event);
      }
    },
    getLiveState() {
      const progress = expectedMs.length === 0 ? 1 : Math.min(1, hits.length / expectedMs.length);
      return { progress, runningScore: progress, feedback: [] };
    },
    finish() {
      const metrics: ScoringMetric[] = expectedMs.map((expected, index) => {
        const actual = Number(hits[index]?.timestamp ?? Number.NaN);
        const actualMs = Number.isFinite(actual) ? actual : expected + 999;
        return { kind: "timing", expectedMs: expected, actualMs, errorMs: actualMs - expected };
      });
      const errors = metrics
        .filter((metric) => metric.kind === "timing")
        .map((metric) => metric.errorMs);
      const meanAbsError =
        errors.length === 0
          ? 0
          : errors.reduce((sum, error) => sum + Math.abs(error), 0) / errors.length;
      const meanSignedError =
        errors.length === 0 ? 0 : errors.reduce((sum, error) => sum + error, 0) / errors.length;
      const score = Math.max(0, 1 - meanAbsError / 160);
      const direction =
        meanSignedError < -20 ? "ahead" : meanSignedError > 20 ? "behind" : "centered";

      return {
        correct: score >= 0.85,
        score,
        metrics,
        feedback: [
          {
            severity: score >= 0.85 ? "good" : "warn",
            message: `Timing ${direction} by ${Math.round(meanSignedError)}ms.`,
          },
        ],
        input: hits,
        answer: Math.round(meanSignedError),
      };
    },
  };
}

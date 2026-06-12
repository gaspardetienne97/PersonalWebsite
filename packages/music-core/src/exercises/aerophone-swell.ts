import {
  Capability,
  type ExerciseDefinition,
  type ExerciseRun,
  type NoteEvent,
  type ScoringMetric,
} from "@repo/music-core/domain";
import { midiToNote } from "@repo/music-core/engines/theory";

export interface AerophoneSwellPrompt {
  label: string;
  targetMidi: number;
  durationMs: number;
  breathController: number;
  lowLevel: number;
  peakLevel: number;
}

export interface AerophoneSwellAnswer {
  playedMidi?: number;
  breathValues: number[];
}

export interface AerophoneSwellOptions {
  targetMidi?: number;
  durationMs?: number;
  breathController?: number;
  lowLevel?: number;
  peakLevel?: number;
}

interface BreathSample {
  at: number;
  value: number;
}

export function createAerophoneSwellExercise(
  options: AerophoneSwellOptions = {},
): ExerciseDefinition<AerophoneSwellPrompt, AerophoneSwellAnswer> {
  const targetMidi = options.targetMidi ?? 67;
  const durationMs = Math.max(1_000, options.durationMs ?? 6_000);
  const breathController = options.breathController ?? 2;
  const lowLevel = clamp(options.lowLevel ?? 0.2);
  const peakLevel = Math.max(lowLevel + 0.1, clamp(options.peakLevel ?? 0.9));
  const label = `${midiToNote(targetMidi)} dynamic swell`;

  return {
    id: "technique.aerophone.dynamic-swell",
    name: "Aerophone Dynamic Swell",
    capabilities: [Capability.Technique, Capability.Pitch],
    skillIds: ["technique.aerophone.dynamic-control"],
    inputs: ["midi"],
    streaming: true,
    generate: () => ({
      id: `aerophone-swell-${targetMidi}-${durationMs}`,
      payload: {
        label,
        targetMidi,
        durationMs,
        breathController,
        lowLevel,
        peakLevel,
      },
    }),
    createRun(prompt) {
      return swellRun(prompt.payload);
    },
  };
}

function swellRun(prompt: AerophoneSwellPrompt): ExerciseRun<AerophoneSwellAnswer> {
  const input: NoteEvent[] = [];
  const samples: BreathSample[] = [];
  let playedMidi: number | undefined;

  return {
    accept(event) {
      if (event.type === "noteOn" && playedMidi === undefined) {
        playedMidi = event.midiNote;
        input.push(event);
        return;
      }
      if (event.type !== "cc" || event.controller !== prompt.breathController) return;

      input.push(event);
      samples.push({ at: Number(event.timestamp), value: event.value });
    },
    getLiveState() {
      const analysis = analyze(samples, prompt);
      return {
        progress: analysis.progress,
        runningScore: analysis.control,
        feedback:
          samples.length < 3
            ? []
            : [
                {
                  severity: analysis.control >= 0.8 ? "good" : "warn",
                  message: `Swell shape ${Math.round(analysis.shape * 100)}%`,
                },
              ],
      };
    },
    finish() {
      const analysis = analyze(samples, prompt);
      const pitchCorrect = playedMidi === prompt.targetMidi;
      const score =
        analysis.shape * 0.5 +
        analysis.smoothness * 0.2 +
        (pitchCorrect ? 0.2 : 0) +
        analysis.progress * 0.1;
      const metrics: ScoringMetric[] = [
        {
          kind: "pitch",
          expectedMidi: prompt.targetMidi,
          ...(playedMidi === undefined ? {} : { actualMidi: playedMidi }),
        },
        {
          kind: "breath",
          steadiness: analysis.control,
          targetCurve: analysis.targetCurve,
          actualCurve: analysis.actualCurve,
        },
      ];

      return {
        correct:
          analysis.progress >= 1 &&
          analysis.shape >= 0.8 &&
          analysis.smoothness >= 0.75 &&
          pitchCorrect,
        score,
        metrics,
        feedback: [
          {
            severity: analysis.shape >= 0.8 ? "good" : "warn",
            message: `Swell shape ${Math.round(analysis.shape * 100)}%`,
          },
          {
            severity: analysis.smoothness >= 0.75 ? "good" : "warn",
            message: `Breath transition ${Math.round(analysis.smoothness * 100)}% smooth.`,
          },
          {
            severity: pitchCorrect ? "good" : "warn",
            message: pitchCorrect
              ? `${prompt.label} stayed on target.`
              : `Target ${midiToNote(prompt.targetMidi)}, heard ${
                  playedMidi === undefined ? "no note" : midiToNote(playedMidi)
                }.`,
          },
        ],
        target: { label: prompt.label, midiNotes: [prompt.targetMidi] },
        response: playedMidi === undefined ? {} : { midiNotes: [playedMidi] },
        answer: {
          ...(playedMidi === undefined ? {} : { playedMidi }),
          breathValues: analysis.actualCurve,
        },
        input,
      };
    },
  };
}

function analyze(samples: BreathSample[], prompt: AerophoneSwellPrompt) {
  const firstAt = samples[0]?.at;
  const lastAt = samples.at(-1)?.at;
  const progress =
    firstAt === undefined || lastAt === undefined
      ? 0
      : Math.min(1, Math.max(0, lastAt - firstAt) / prompt.durationMs);
  const actualCurve = samples.map((sample) => sample.value);
  const targetCurve = samples.map((sample) => {
    const position =
      firstAt === undefined ? 0 : Math.min(1, Math.max(0, sample.at - firstAt) / prompt.durationMs);
    return targetLevel(position, prompt.lowLevel, prompt.peakLevel);
  });

  if (samples.length < 2) {
    return { progress, shape: 0, smoothness: 0, control: 0, actualCurve, targetCurve };
  }

  const range = prompt.peakLevel - prompt.lowLevel;
  const meanError =
    actualCurve.reduce(
      (total, value, index) => total + Math.abs(value - (targetCurve[index] ?? value)),
      0,
    ) / actualCurve.length;
  const shape = clamp(1 - meanError / range);
  const directionErrors: number[] = [];
  for (let index = 1; index < actualCurve.length; index += 1) {
    const actualDelta = actualCurve[index]! - actualCurve[index - 1]!;
    const targetDelta = targetCurve[index]! - targetCurve[index - 1]!;
    if (targetDelta > 0) directionErrors.push(Math.max(0, -actualDelta));
    if (targetDelta < 0) directionErrors.push(Math.max(0, actualDelta));
  }
  const directionError =
    directionErrors.length === 0
      ? 0
      : directionErrors.reduce((total, error) => total + error, 0) / directionErrors.length;
  const smoothness = clamp(1 - directionError / range);
  const control = shape * 0.75 + smoothness * 0.25;

  return { progress, shape, smoothness, control, actualCurve, targetCurve };
}

function targetLevel(position: number, lowLevel: number, peakLevel: number): number {
  const phase = position <= 0.5 ? position * 2 : (1 - position) * 2;
  return lowLevel + (peakLevel - lowLevel) * phase;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

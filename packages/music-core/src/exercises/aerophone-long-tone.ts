import {
  Capability,
  type ExerciseDefinition,
  type ExerciseRun,
  type NoteEvent,
  type ScoringMetric,
} from "@repo/music-core/domain";
import { midiToNote } from "@repo/music-core/engines/theory";

import { pitchCents, recent } from "./aerophone-traces";

export interface AerophoneLongTonePrompt {
  label: string;
  targetMidi: number;
  holdMs: number;
  breathController: number;
}

export interface AerophoneLongToneAnswer {
  playedMidi?: number;
  breathValues: number[];
}

export interface AerophoneLongToneOptions {
  targetMidi?: number;
  holdMs?: number;
  breathController?: number;
}

export function createAerophoneLongToneExercise(
  options: AerophoneLongToneOptions = {},
): ExerciseDefinition<AerophoneLongTonePrompt, AerophoneLongToneAnswer> {
  const targetMidi = options.targetMidi ?? 67;
  const holdMs = Math.max(500, options.holdMs ?? 5_000);
  const breathController = options.breathController ?? 2;
  const label = `${midiToNote(targetMidi)} long tone`;

  return {
    id: "technique.aerophone.long-tone",
    name: "Aerophone Long Tone",
    capabilities: [Capability.Technique, Capability.Pitch],
    skillIds: ["technique.aerophone.breath-steadiness"],
    inputs: ["midi"],
    streaming: true,
    generate: () => ({
      id: `aerophone-long-tone-${targetMidi}-${holdMs}`,
      payload: { label, targetMidi, holdMs, breathController },
    }),
    createRun(prompt) {
      return longToneRun(prompt.payload);
    },
  };
}

function longToneRun(prompt: AerophoneLongTonePrompt): ExerciseRun<AerophoneLongToneAnswer> {
  const input: NoteEvent[] = [];
  const breathValues: number[] = [];
  let firstBreathAt: number | undefined;
  let lastBreathAt: number | undefined;
  let playedMidi: number | undefined;
  const pitchTrace: number[] = [];

  return {
    accept(event) {
      if (event.type === "noteOn") {
        pitchTrace.push(pitchCents(event, prompt.targetMidi));
        if (playedMidi === undefined) {
          playedMidi = event.midiNote;
          input.push(event);
        }
        return;
      }
      if (event.type !== "cc" || event.controller !== prompt.breathController) return;

      input.push(event);
      breathValues.push(event.value);
      firstBreathAt ??= Number(event.timestamp);
      lastBreathAt = Number(event.timestamp);
    },
    getLiveState() {
      const progress = holdProgress(firstBreathAt, lastBreathAt, prompt.holdMs);
      const steadiness = breathSteadiness(breathValues);
      return {
        progress,
        runningScore: steadiness,
        breathTrace: recent(breathValues),
        pitchTrace: recent(pitchTrace),
        feedback:
          breathValues.length < 2
            ? []
            : [
                {
                  severity: steadiness >= 0.8 ? "good" : "warn",
                  message: `Breath steadiness ${Math.round(steadiness * 100)}%`,
                },
              ],
      };
    },
    finish() {
      const progress = holdProgress(firstBreathAt, lastBreathAt, prompt.holdMs);
      const steadiness = breathSteadiness(breathValues);
      const pitchCorrect = playedMidi === prompt.targetMidi;
      const score = steadiness * 0.7 + (pitchCorrect ? 0.2 : 0) + progress * 0.1;
      const metrics: ScoringMetric[] = [
        {
          kind: "pitch",
          expectedMidi: prompt.targetMidi,
          ...(playedMidi === undefined ? {} : { actualMidi: playedMidi }),
        },
        {
          kind: "breath",
          steadiness,
          actualCurve: [...breathValues],
        },
      ];

      return {
        correct: progress >= 1 && steadiness >= 0.8 && pitchCorrect,
        score,
        metrics,
        feedback: [
          {
            severity: steadiness >= 0.8 ? "good" : "warn",
            message: `Breath steadiness ${Math.round(steadiness * 100)}%`,
          },
          {
            severity: pitchCorrect ? "good" : "warn",
            message: pitchCorrect
              ? `${prompt.label} held on target.`
              : `Target ${midiToNote(prompt.targetMidi)}, heard ${
                  playedMidi === undefined ? "no note" : midiToNote(playedMidi)
                }.`,
          },
        ],
        target: { label: prompt.label, midiNotes: [prompt.targetMidi] },
        response: playedMidi === undefined ? {} : { midiNotes: [playedMidi] },
        answer: { playedMidi, breathValues: [...breathValues] },
        input,
      };
    },
  };
}

function holdProgress(
  firstBreathAt: number | undefined,
  lastBreathAt: number | undefined,
  holdMs: number,
): number {
  if (firstBreathAt === undefined || lastBreathAt === undefined) return 0;
  return Math.min(1, Math.max(0, lastBreathAt - firstBreathAt) / holdMs);
}

function breathSteadiness(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.max(0, Math.min(1, 1 - Math.sqrt(variance) * 4));
}

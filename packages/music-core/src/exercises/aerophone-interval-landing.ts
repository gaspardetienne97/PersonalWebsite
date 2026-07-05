import {
  Capability,
  type ExerciseDefinition,
  type ExerciseRun,
  type NoteEvent,
  type ScoringMetric,
} from "@repo/music-core/domain";
import { midiToNote } from "@repo/music-core/engines/theory";

export type AerophoneIntervalLandingId = "P4" | "P5" | "P8" | "M3" | "m3";

/** Landing direction relative to the drone: ascending (default) or descending. */
export type AerophoneIntervalDirection = "up" | "down";

export interface AerophoneIntervalLandingDefinition {
  id: AerophoneIntervalLandingId;
  label: string;
  semitones: number;
}

export const AEROPHONE_INTERVAL_LANDING_INTERVALS: AerophoneIntervalLandingDefinition[] = [
  { id: "P4", label: "Perfect fourth", semitones: 5 },
  { id: "P5", label: "Perfect fifth", semitones: 7 },
  { id: "P8", label: "Octave", semitones: 12 },
  { id: "M3", label: "Major third", semitones: 4 },
  { id: "m3", label: "Minor third", semitones: 3 },
];

export interface AerophoneIntervalLandingOptions {
  droneMidi?: number;
  interval?: AerophoneIntervalLandingId;
  direction?: AerophoneIntervalDirection;
  holdMs?: number;
  breathController?: number;
}

export interface AerophoneIntervalLandingPrompt {
  label: string;
  droneMidi: number;
  targetMidi: number;
  interval: AerophoneIntervalLandingDefinition;
  direction: AerophoneIntervalDirection;
  holdMs: number;
  breathController: number;
}

export interface AerophoneIntervalLandingAnswer {
  droneMidi: number;
  targetMidi: number;
  intervalId: AerophoneIntervalLandingId;
  playedMidi?: number;
  landingErrorSemitones?: number;
  breathValues: number[];
}

export function createAerophoneIntervalLandingExercise(
  options: AerophoneIntervalLandingOptions = {},
): ExerciseDefinition<AerophoneIntervalLandingPrompt, AerophoneIntervalLandingAnswer> {
  const droneMidi = options.droneMidi ?? 60;
  const interval = aerophoneIntervalLandingDefinition(options.interval ?? "P5");
  const direction = options.direction ?? "up";
  const targetMidi =
    direction === "down" ? droneMidi - interval.semitones : droneMidi + interval.semitones;
  const holdMs = Math.max(500, options.holdMs ?? 3_000);
  const breathController = options.breathController ?? 2;
  const label = `${midiToNote(droneMidi)} ${direction === "down" ? "down to" : "to"} ${midiToNote(targetMidi)} · ${interval.label}`;

  return {
    id: "technique.aerophone.interval-landing",
    name: "Aerophone Interval Landing",
    capabilities: [Capability.Technique, Capability.Pitch],
    skillIds: ["technique.aerophone.interval-landing", "intonation.interval-landing"],
    inputs: ["midi"],
    streaming: true,
    generate: () => ({
      id: `aerophone-interval-landing-${droneMidi}-${interval.id}-${direction}-${holdMs}`,
      payload: { label, droneMidi, targetMidi, interval, direction, holdMs, breathController },
    }),
    createRun(prompt) {
      return intervalLandingRun(prompt.payload);
    },
  };
}

export function aerophoneIntervalLandingDefinition(
  interval: AerophoneIntervalLandingId,
): AerophoneIntervalLandingDefinition {
  return (
    AEROPHONE_INTERVAL_LANDING_INTERVALS.find((candidate) => candidate.id === interval) ??
    AEROPHONE_INTERVAL_LANDING_INTERVALS[1]!
  );
}

function intervalLandingRun(
  prompt: AerophoneIntervalLandingPrompt,
): ExerciseRun<AerophoneIntervalLandingAnswer> {
  const input: NoteEvent[] = [];
  const breathValues: number[] = [];
  let firstBreathAt: number | undefined;
  let lastBreathAt: number | undefined;
  let playedMidi: number | undefined;

  return {
    accept(event) {
      if (event.type === "noteOn") {
        // Grade the note the player SETTLES on, not the first attack — wind
        // attacks commonly flub (a brief mis-finger, then the correction), and
        // locking to the first noteOn permanently misgraded the whole hold.
        playedMidi = event.midiNote;
        input.push(event);
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
      const pitchCorrect = playedMidi === prompt.targetMidi;
      const runningScore = (pitchCorrect ? 0.45 : 0) + steadiness * 0.45 + progress * 0.1;
      return {
        progress,
        runningScore,
        feedback:
          playedMidi === undefined
            ? []
            : [
                {
                  severity: pitchCorrect ? "good" : "warn",
                  message: pitchCorrect
                    ? `Landed on ${midiToNote(prompt.targetMidi)}.`
                    : `Target ${midiToNote(prompt.targetMidi)}, heard ${midiToNote(playedMidi)}.`,
                },
              ],
      };
    },
    finish() {
      const progress = holdProgress(firstBreathAt, lastBreathAt, prompt.holdMs);
      const steadiness = breathSteadiness(breathValues);
      const pitchCorrect = playedMidi === prompt.targetMidi;
      const landingErrorSemitones =
        playedMidi === undefined ? undefined : playedMidi - prompt.targetMidi;
      const score = Math.max(
        0,
        Math.min(1, (pitchCorrect ? 0.45 : 0) + steadiness * 0.45 + progress * 0.1),
      );
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
        correct: pitchCorrect && progress >= 1 && steadiness >= 0.75,
        score,
        metrics,
        feedback: [
          {
            severity: pitchCorrect ? "good" : "warn",
            message: pitchCorrect
              ? `Target ${prompt.label} landed.`
              : `Target ${prompt.label}, heard ${
                  playedMidi === undefined ? "no note" : midiToNote(playedMidi)
                }.`,
          },
          {
            severity: steadiness >= 0.75 ? "good" : "warn",
            message: `Breath steadiness ${Math.round(steadiness * 100)}%`,
          },
        ],
        target: { label: prompt.label, midiNotes: [prompt.droneMidi, prompt.targetMidi] },
        response: playedMidi === undefined ? {} : { midiNotes: [playedMidi] },
        answer: {
          droneMidi: prompt.droneMidi,
          targetMidi: prompt.targetMidi,
          intervalId: prompt.interval.id,
          ...(playedMidi === undefined ? {} : { playedMidi }),
          ...(landingErrorSemitones === undefined ? {} : { landingErrorSemitones }),
          breathValues: [...breathValues],
        },
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

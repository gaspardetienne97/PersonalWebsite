/**
 * Aerophone articulation — tongue a repeated note in a target style (staccato
 * or legato) and be graded on how cleanly the articulation lands. This is the
 * Aerophone "CC analysis" technique drill: it reads note durations (from
 * noteOn/noteOff) to measure how detached each note is, and tracks the breath
 * controller (CC2) so the run carries a breath curve for review.
 *
 * MIDI/wind-controller first: real grading needs note-off timing (and breath
 * CC), which only a sustaining controller produces. An on-screen tap (noteOn
 * only) can complete the run for the pitch dimension, but reads as "no
 * sustained input" for articulation — see the route's note.
 */

import {
  Capability,
  type ExerciseDefinition,
  type ExerciseResult,
  type ExerciseRun,
  type NoteEvent,
  type ScoringMetric,
} from "@repo/music-core/domain";
import { midiToNote } from "@repo/music-core/engines/theory";

export type ArticulationStyle = "staccato" | "legato";

/** Target sounding fraction of the beat for each style (note length ÷ beat). */
const STYLE_TARGET_FRACTION: Record<ArticulationStyle, number> = {
  staccato: 0.35,
  legato: 0.95,
};

export interface AerophoneArticulationOptions {
  targetMidi?: number;
  count?: number;
  bpm?: number;
  style?: ArticulationStyle;
  breathController?: number;
}

export interface AerophoneArticulationPrompt {
  label: string;
  targetMidi: number;
  noteLabel: string;
  count: number;
  bpm: number;
  beatMs: number;
  style: ArticulationStyle;
  breathController: number;
}

export interface AerophoneArticulationAnswer {
  playedMidiNotes: number[];
  pitchAccuracy: number;
  articulationScore: number;
  meanSoundingFraction: number;
  breathValues: number[];
}

export function createAerophoneArticulationExercise(
  options: AerophoneArticulationOptions = {},
): ExerciseDefinition<AerophoneArticulationPrompt, AerophoneArticulationAnswer> {
  const targetMidi = options.targetMidi ?? 67;
  const count = Math.max(2, options.count ?? 8);
  const bpm = options.bpm ?? 90;
  const style = options.style ?? "staccato";
  const breathController = options.breathController ?? 2;

  return {
    id: "technique.aerophone.articulation",
    name: "Aerophone Articulation",
    capabilities: [Capability.Technique, Capability.Pitch],
    skillIds: ["technique.aerophone", "technique.aerophone.articulation"],
    inputs: ["midi", "onscreen"],
    streaming: true,
    generate: () => ({
      id: `aerophone-articulation-${targetMidi}-${style}-${count}-${bpm}`,
      payload: {
        label: `${midiToNote(targetMidi)} ${style} · ${count} notes`,
        targetMidi,
        noteLabel: midiToNote(targetMidi),
        count,
        bpm,
        beatMs: 60_000 / bpm,
        style,
        breathController,
      },
    }),
    createRun(prompt) {
      return articulationRun(prompt.payload);
    },
  };
}

function articulationRun(
  prompt: AerophoneArticulationPrompt,
): ExerciseRun<AerophoneArticulationAnswer> {
  const input: NoteEvent[] = [];
  const onsets: { midi: number; at: number }[] = [];
  const soundingMs: number[] = [];
  const openByMidi = new Map<number, number>();
  const breathValues: number[] = [];

  return {
    accept(event) {
      if (event.type === "noteOn") {
        input.push(event);
        onsets.push({ midi: event.midiNote, at: Number(event.timestamp) });
        openByMidi.set(event.midiNote, Number(event.timestamp));
        return;
      }
      if (event.type === "noteOff") {
        const start = openByMidi.get(event.midiNote);
        if (start !== undefined) {
          soundingMs.push(Math.max(0, Number(event.timestamp) - start));
          openByMidi.delete(event.midiNote);
        }
        input.push(event);
        return;
      }
      if (event.type === "cc" && event.controller === prompt.breathController) {
        input.push(event);
        breathValues.push(event.value);
      }
    },
    getLiveState() {
      const progress = Math.min(1, onsets.length / prompt.count);
      return { progress, runningScore: progress, feedback: [] };
    },
    finish() {
      return grade(prompt, input, onsets, soundingMs, breathValues);
    },
  };
}

function grade(
  prompt: AerophoneArticulationPrompt,
  input: NoteEvent[],
  onsets: { midi: number; at: number }[],
  soundingMs: number[],
  breathValues: number[],
): ExerciseResult<AerophoneArticulationAnswer> {
  const metrics: ScoringMetric[] = [];
  let correctPitch = 0;
  for (let index = 0; index < prompt.count; index += 1) {
    const actualMidi = onsets[index]?.midi;
    metrics.push({ kind: "pitch", expectedMidi: prompt.targetMidi, actualMidi });
    if (actualMidi === prompt.targetMidi) correctPitch += 1;
  }
  const pitchAccuracy = correctPitch / prompt.count;

  const fractions = soundingMs.map((ms) => Math.min(1.5, ms / prompt.beatMs));
  const meanSoundingFraction =
    fractions.length === 0
      ? 0
      : fractions.reduce((sum, value) => sum + value, 0) / fractions.length;
  const target = STYLE_TARGET_FRACTION[prompt.style];
  // No note-off info (e.g. on-screen taps) → articulation can't be assessed.
  const articulationScore =
    fractions.length === 0 ? 0 : Math.max(0, 1 - Math.abs(meanSoundingFraction - target) / 0.6);

  const score = pitchAccuracy * 0.5 + articulationScore * 0.5;
  const correct = pitchAccuracy === 1 && articulationScore >= 0.7;

  metrics.push({
    kind: "breath",
    steadiness: breathSteadiness(breathValues),
    actualCurve: [...breathValues],
  });

  return {
    correct,
    score,
    metrics,
    feedback: [
      {
        severity: articulationScore >= 0.7 ? "good" : "warn",
        message:
          fractions.length === 0
            ? "No sustained notes — use a wind controller for articulation."
            : `${prompt.style} ${Math.round(articulationScore * 100)}% · notes sounded ${Math.round(meanSoundingFraction * 100)}% of the beat.`,
      },
      {
        severity: pitchAccuracy === 1 ? "good" : "warn",
        message: `${correctPitch}/${prompt.count} on ${prompt.noteLabel}.`,
      },
    ],
    target: { label: prompt.label, midiNotes: [prompt.targetMidi] },
    response: { midiNotes: onsets.map((onset) => onset.midi) },
    answer: {
      playedMidiNotes: onsets.map((onset) => onset.midi),
      pitchAccuracy,
      articulationScore,
      meanSoundingFraction,
      breathValues: [...breathValues],
    },
    input,
  };
}

function breathSteadiness(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.max(0, Math.min(1, 1 - Math.sqrt(variance) * 4));
}

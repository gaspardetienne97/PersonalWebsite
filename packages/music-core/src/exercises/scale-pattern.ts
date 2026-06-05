import {
  Capability,
  type ExerciseDefinition,
  type ExerciseRun,
  type NoteEvent,
  type ScoringMetric,
} from "@repo/music-core/domain";
import { midiToNote, noteToMidi } from "@repo/music-core/engines/theory";

export interface ScalePatternPrompt {
  label: string;
  midiNotes: number[];
  noteLabels: string[];
  bpm: number;
  targetSpacingMs: number;
}

export type ScalePatternKind = "major";

export interface ScalePatternOptions {
  tonic?: string;
  scale?: ScalePatternKind;
  bpm?: number;
}

export function createScalePatternExercise(
  options: ScalePatternOptions = {},
): ExerciseDefinition<ScalePatternPrompt, number[]> {
  const tonic = options.tonic ?? "C4";
  const scale = options.scale ?? "major";
  const bpm = options.bpm ?? 120;
  const midiNotes = scaleMidiNotes(tonic, scale);
  const label = `${pitchClassLabel(tonic)} ${scale}`;

  return {
    id: `technique.scale.${pitchClassLabel(tonic).toLowerCase()}-${scale}`,
    name: `${label} Scale`,
    capabilities: [Capability.Technique, Capability.Pitch],
    skillIds: [`technique.scale.${scale}`],
    inputs: ["midi", "onscreen"],
    streaming: true,
    generate: () => ({
      id: `scale-${pitchClassLabel(tonic).toLowerCase()}-${scale}-${bpm}`,
      payload: {
        label,
        midiNotes,
        noteLabels: midiNotes.map((midi) => midiToNote(midi)),
        bpm,
        targetSpacingMs: 60_000 / bpm,
      },
    }),
    createRun(prompt) {
      return scaleRun(prompt.payload);
    },
  };
}

export const majorScaleExercise = createScalePatternExercise({ tonic: "C4", scale: "major" });

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

      const firstTimestamp = played[0]?.timestamp;
      if (firstTimestamp !== undefined) {
        prompt.midiNotes.forEach((_expectedMidi, index) => {
          const actual = played[index];
          if (actual?.type === "noteOn") {
            const expectedMs = Number(firstTimestamp) + index * prompt.targetSpacingMs;
            const actualMs = Number(actual.timestamp);
            metrics.push({ kind: "timing", expectedMs, actualMs, errorMs: actualMs - expectedMs });
          }
        });
      }

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

function scaleMidiNotes(tonic: string, scale: ScalePatternKind): number[] {
  const root = noteToMidi(tonic);
  const intervals = scale === "major" ? [0, 2, 4, 5, 7, 9, 11, 12] : [];
  return intervals.map((semitones) => root + semitones);
}

function pitchClassLabel(note: string): string {
  return note.trim().replace(/-?\d+$/, "");
}

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
  motion: ScaleMotion;
  span: ScaleSpan;
}

export type ScalePatternKind =
  | "major"
  | "natural-minor"
  | "harmonic-minor"
  | "dorian"
  | "phrygian"
  | "lydian"
  | "mixolydian"
  | "locrian"
  | "melodic-minor"
  | "major-pentatonic"
  | "minor-pentatonic"
  | "blues"
  | "altered"
  | "bebop-major"
  | "bebop-dominant"
  | "whole-tone"
  | "diminished";

export type ScaleMotion = "up" | "down" | "up-down";

export type ScaleSpan = "pentascale" | "one-octave" | "two-octave";

/** Ascending semitone offsets from the tonic, octave inclusive. */
const SCALE_INTERVALS: Record<ScalePatternKind, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11, 12],
  "natural-minor": [0, 2, 3, 5, 7, 8, 10, 12],
  "harmonic-minor": [0, 2, 3, 5, 7, 8, 11, 12],
  dorian: [0, 2, 3, 5, 7, 9, 10, 12],
  phrygian: [0, 1, 3, 5, 7, 8, 10, 12],
  lydian: [0, 2, 4, 6, 7, 9, 11, 12],
  mixolydian: [0, 2, 4, 5, 7, 9, 10, 12],
  locrian: [0, 1, 3, 5, 6, 8, 10, 12],
  "melodic-minor": [0, 2, 3, 5, 7, 9, 11, 12],
  "major-pentatonic": [0, 2, 4, 7, 9, 12],
  "minor-pentatonic": [0, 3, 5, 7, 10, 12],
  blues: [0, 3, 5, 6, 7, 10, 12],
  altered: [0, 1, 3, 4, 6, 8, 10, 12],
  "bebop-major": [0, 2, 4, 5, 7, 8, 9, 11, 12],
  "bebop-dominant": [0, 2, 4, 5, 7, 9, 10, 11, 12],
  "whole-tone": [0, 2, 4, 6, 8, 10, 12],
  diminished: [0, 1, 3, 4, 6, 7, 9, 10, 12],
};

/** Ascending semitone offsets for a scale kind (octave inclusive). */
export function scaleSemitones(scale: ScalePatternKind): number[] {
  return SCALE_INTERVALS[scale] ?? SCALE_INTERVALS.major;
}

/** Semitone offsets for a scale practice prompt after span and motion are applied. */
export function scalePatternSemitones(
  scale: ScalePatternKind,
  span: ScaleSpan = "one-octave",
  motion: ScaleMotion = "up",
): number[] {
  return applyMotion(scaleSpanSemitones(scale, span), motion);
}

/** Scales beyond the church-mode basics that read as jazz vocabulary. */
export const JAZZ_SCALE_KINDS: ScalePatternKind[] = [
  "dorian",
  "mixolydian",
  "lydian",
  "melodic-minor",
  "altered",
  "bebop-major",
  "bebop-dominant",
  "whole-tone",
  "diminished",
];

export interface ScalePatternOptions {
  tonic?: string;
  scale?: ScalePatternKind;
  bpm?: number;
  motion?: ScaleMotion;
  span?: ScaleSpan;
}

export function createScalePatternExercise(
  options: ScalePatternOptions = {},
): ExerciseDefinition<ScalePatternPrompt, number[]> {
  const tonic = options.tonic ?? "C4";
  const scale = options.scale ?? "major";
  const bpm = options.bpm ?? 120;
  const motion = options.motion ?? "up";
  const span = options.span ?? "one-octave";
  const midiNotes = scaleMidiNotes(tonic, scale, span, motion);
  const label = `${pitchClassLabel(tonic)} ${scaleLabel(scale)} · ${spanLabel(span)} · ${motionLabel(motion)}`;

  return {
    id: `technique.scale.${pitchClassLabel(tonic).toLowerCase()}-${scale}-${span}-${motion}`,
    name: `${label} Scale`,
    capabilities: [Capability.Technique, Capability.Pitch],
    skillIds: [`technique.scale.${scale}`],
    inputs: ["midi", "onscreen"],
    streaming: true,
    generate: () => ({
      id: `scale-${pitchClassLabel(tonic).toLowerCase()}-${scale}-${span}-${motion}-${bpm}`,
      payload: {
        label,
        midiNotes,
        noteLabels: midiNotes.map((midi) => midiToNote(midi)),
        bpm,
        targetSpacingMs: 60_000 / bpm,
        motion,
        span,
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

function scaleMidiNotes(
  tonic: string,
  scale: ScalePatternKind,
  span: ScaleSpan,
  motion: ScaleMotion,
): number[] {
  const root = noteToMidi(tonic);
  return scalePatternSemitones(scale, span, motion).map((semitones) => root + semitones);
}

function scaleSpanSemitones(scale: ScalePatternKind, span: ScaleSpan): number[] {
  const intervals = SCALE_INTERVALS[scale] ?? SCALE_INTERVALS.major;
  if (span === "pentascale") return intervals.filter((interval) => interval < 12).slice(0, 5);
  if (span === "two-octave") {
    return [...intervals, ...intervals.slice(1).map((interval) => interval + 12)];
  }
  return intervals;
}

function applyMotion(intervals: number[], motion: ScaleMotion): number[] {
  if (motion === "down") return [...intervals].reverse();
  if (motion === "up-down") return [...intervals, ...intervals.slice(0, -1).reverse()];
  return intervals;
}

function scaleLabel(scale: ScalePatternKind): string {
  return scale.replaceAll("-", " ");
}

function spanLabel(span: ScaleSpan): string {
  if (span === "pentascale") return "pentascale";
  if (span === "two-octave") return "two octaves";
  return "one octave";
}

function motionLabel(motion: ScaleMotion): string {
  if (motion === "down") return "descending";
  if (motion === "up-down") return "up-down";
  return "ascending";
}

function pitchClassLabel(note: string): string {
  return note.trim().replace(/-?\d+$/, "");
}

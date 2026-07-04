import {
  Capability,
  type ExerciseDefinition,
  type ExerciseRun,
  type NoteEvent,
  type NoteOnEvent,
  type ScoringMetric,
} from "@repo/music-core/domain";
import { verifyChordTarget } from "@repo/music-core/engines/chord-verification";
import type { TuningProfile } from "@repo/music-core/engines/tunings";

import { chordShapeMidiNotes, type ChordShape } from "./chord-perfect";

export interface ChordChangeOptions {
  tuning: TuningProfile;
  fromShape: ChordShape;
  toShape: ChordShape;
  repetitions?: number;
}

export interface ChordChangeTarget {
  index: number;
  shapeId: string;
  label: string;
  midiNotes: number[];
  expectedPitchClasses: number[];
}

export interface ChordChangePrompt {
  label: string;
  instrument: ChordShape["instrument"];
  tuningId: string;
  fromShapeId: string;
  toShapeId: string;
  repetitions: number;
  targets: ChordChangeTarget[];
}

export interface ChordChangeAnswer {
  completedChanges: number;
  cleanChanges: number;
  firstChangeLatencyMs?: number;
  coverageByChange: number[];
  playedMidiNotes: number[];
}

export function createChordChangeExercise(
  options: ChordChangeOptions,
): ExerciseDefinition<ChordChangePrompt, ChordChangeAnswer> {
  const repetitions = Math.max(1, Math.min(8, Math.round(options.repetitions ?? 2)));
  const targets = buildTargets(options, repetitions);

  return {
    id: `technique.${options.tuning.instrument}.chord-changes`,
    name: `${options.fromShape.name} to ${options.toShape.name} Chord Changes`,
    capabilities: [Capability.Technique, Capability.Harmony, Capability.Pitch],
    skillIds: [
      "technique.strings.chord-changes",
      `technique.${options.tuning.instrument}.chord-changes`,
    ],
    inputs: ["midi", "onscreen", "audio"],
    streaming: true,
    generate: () => ({
      id: `chord-change-${options.fromShape.id}-${options.toShape.id}-${repetitions}`,
      payload: {
        label: `${options.fromShape.name} to ${options.toShape.name} chord changes`,
        instrument: options.tuning.instrument,
        tuningId: options.tuning.id,
        fromShapeId: options.fromShape.id,
        toShapeId: options.toShape.id,
        repetitions,
        targets,
      },
    }),
    createRun(prompt) {
      return chordChangeRun(prompt.payload);
    },
  };
}

function buildTargets(options: ChordChangeOptions, repetitions: number): ChordChangeTarget[] {
  const shapes = [options.fromShape, options.toShape];
  return Array.from({ length: repetitions * shapes.length }, (_, index) => {
    const shape = shapes[index % shapes.length]!;
    const midiNotes = chordShapeMidiNotes(options.tuning, shape);
    const verification = verifyChordTarget({ expectedMidiNotes: midiNotes, observedMidiNotes: [] });
    return {
      index,
      shapeId: shape.id,
      label: shape.name,
      midiNotes,
      expectedPitchClasses: verification.expectedPitchClasses,
    };
  });
}

/**
 * Notes within one strum cluster tightly in time while moving to the next
 * shape takes real milliseconds, so a silence this long starts the next
 * target. Count-based chunking (the previous approach) let a single extra or
 * missing string shift every later chord onto the wrong grading window.
 */
const CHANGE_GAP_MS = 350;

function clusterByGap(played: NoteOnEvent[]): NoteOnEvent[][] {
  const clusters: NoteOnEvent[][] = [];
  for (const event of played) {
    const cluster = clusters.at(-1);
    const previous = cluster?.at(-1);
    if (
      cluster === undefined ||
      previous === undefined ||
      Number(event.timestamp) - Number(previous.timestamp) > CHANGE_GAP_MS
    ) {
      clusters.push([event]);
    } else {
      cluster.push(event);
    }
  }
  return clusters;
}

function chordChangeRun(prompt: ChordChangePrompt): ExerciseRun<ChordChangeAnswer> {
  const input: NoteEvent[] = [];
  const totalNotes = prompt.targets.reduce((sum, target) => sum + target.midiNotes.length, 0);

  return {
    accept(event) {
      if (event.type === "noteOn") input.push(event);
    },
    getLiveState() {
      const progress = totalNotes === 0 ? 0 : Math.min(1, input.length / totalNotes);
      return { progress, runningScore: progress, feedback: [] };
    },
    finish() {
      const played = input.filter((event): event is NoteOnEvent => event.type === "noteOn");
      const clusters = clusterByGap(played);
      const metrics: ScoringMetric[] = [];
      const coverageByChange: number[] = [];
      let cleanChanges = 0;
      let completedChanges = 0;

      prompt.targets.forEach((target, targetIndex) => {
        const chunk = clusters[targetIndex] ?? [];
        const observedMidiNotes = chunk.map((event) => event.midiNote);
        const verification = verifyChordTarget({
          expectedMidiNotes: target.midiNotes,
          observedMidiNotes,
        });
        coverageByChange.push(verification.coverage);
        if (chunk.length > 0) completedChanges += 1;
        if (verification.correct) cleanChanges += 1;
        metrics.push({
          kind: "chord",
          expectedPitchClasses: [...target.expectedPitchClasses],
          actualPitchClasses: [...verification.observedPitchClasses],
          missingPitchClasses: [...verification.missingPitchClasses],
          extraPitchClasses: [...verification.extraPitchClasses],
        });
        target.midiNotes.forEach((expectedMidi, index) => {
          metrics.push({ kind: "pitch", expectedMidi, actualMidi: chunk[index]?.midiNote });
        });
      });

      const score =
        coverageByChange.length === 0
          ? 0
          : coverageByChange.reduce((sum, coverage) => sum + coverage, 0) / coverageByChange.length;
      const firstChangeLatencyMs =
        prompt.targets.length > 1
          ? timestampDelta(clusters[0]?.[0]?.timestamp, clusters[1]?.[0]?.timestamp)
          : undefined;
      const correct = cleanChanges === prompt.targets.length && prompt.targets.length > 0;

      return {
        correct,
        score,
        metrics,
        feedback: [
          {
            severity: correct ? "good" : "warn",
            message: `${cleanChanges}/${prompt.targets.length} clean chord targets.`,
          },
        ],
        target: {
          label: prompt.label,
          midiNotes: prompt.targets.flatMap((target) => target.midiNotes),
        },
        response: { midiNotes: played.map((event) => event.midiNote) },
        answer: {
          completedChanges,
          cleanChanges,
          ...(firstChangeLatencyMs === undefined ? {} : { firstChangeLatencyMs }),
          coverageByChange,
          playedMidiNotes: played.map((event) => event.midiNote),
        },
        input,
      };
    },
  };
}

function timestampDelta(first?: number, second?: number): number | undefined {
  if (first === undefined || second === undefined) return undefined;
  return Math.max(0, Math.round(second - first));
}

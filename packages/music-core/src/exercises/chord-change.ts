import {
  Capability,
  monotonicMs,
  type ExerciseDefinition,
  type ExerciseRun,
  type MonotonicMs,
  type NoteEvent,
  type NoteOnEvent,
  type ScoringEvent,
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
  /**
   * Timed ("one-minute changes") mode: alternate from→to for this long with no
   * repetition cap; the caller ends the run when time is up. Ignores
   * `repetitions` and grades every strum cluster against the alternating pair.
   */
  durationSeconds?: number;
  /**
   * Put the changes on a clock (curriculum G-B3): each target is expected on
   * its own beat, so clusters grade against the bar line rather than against
   * whatever order they arrived in. Without it the drill stays untimed.
   */
  bpm?: number;
  /** Beats between targets when `bpm` is set; 4 = change on the bar. */
  beatsPerChord?: number;
  /** Count-in downbeat the clock hangs off; timing is measured against it. */
  startTimestampMs?: MonotonicMs | number;
}

/** Where the clocked grid hangs off: the click's count-in downbeat, or the first change played. */
export type ChordChangeTimingAnchor = "click" | "first-change";

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
  /** Present in timed mode; `targets` is then the alternating pair template. */
  durationSeconds?: number;
  bpm?: number;
  beatsPerChord?: number;
  /** Clocked mode only: the count-in downbeat, when the caller gave one. */
  startTimestampMs?: MonotonicMs;
  /** Clocked mode only. */
  timingAnchor?: ChordChangeTimingAnchor;
  targets: ChordChangeTarget[];
}

export interface ChordChangeAnswer {
  completedChanges: number;
  cleanChanges: number;
  firstChangeLatencyMs?: number;
  /** Timed mode only: clean chord targets normalized to a 60s rate. */
  changesPerMinute?: number;
  coverageByChange: number[];
  playedMidiNotes: number[];
  /** Clocked mode only: targets strummed inside the on-time window. */
  onTimeChanges?: number;
  /** Clocked mode only: mean |error| over the graded targets. */
  meanTimingErrorMs?: number;
  /** Clocked mode only: what the grid was anchored on. */
  timingAnchor?: ChordChangeTimingAnchor;
}

export type ChordChangeMetric = Extract<ScoringMetric, { kind: "chord-changes" }>;

export interface ChordChangeBenchmark {
  instrument: ChordShape["instrument"];
  tuningId: string;
  durationSeconds: number;
  fromShapeId: string;
  fromMidiNotes: number[];
  toShapeId: string;
  toMidiNotes: number[];
}

export interface ChordChangeHistoryEntry {
  event: ScoringEvent;
  metric: ChordChangeMetric;
}

export function chordChangeHistory(
  events: readonly ScoringEvent[],
  benchmark: ChordChangeBenchmark,
  limit = 6,
): ChordChangeHistoryEntry[] {
  const seen = new Set<string>();
  return [...events]
    .sort((left, right) => Number(right.at) - Number(left.at))
    .flatMap((event) => {
      if (seen.has(event.id) || event.instrument !== benchmark.instrument) return [];
      const metric = event.metrics.find(
        (candidate): candidate is ChordChangeMetric =>
          candidate.kind === "chord-changes" &&
          candidate.tuningId === benchmark.tuningId &&
          candidate.durationSeconds === benchmark.durationSeconds &&
          candidate.fromShapeId === benchmark.fromShapeId &&
          sameNotes(candidate.fromMidiNotes, benchmark.fromMidiNotes) &&
          candidate.toShapeId === benchmark.toShapeId &&
          sameNotes(candidate.toMidiNotes, benchmark.toMidiNotes) &&
          Number.isFinite(candidate.changesPerMinute),
      );
      if (!metric) return [];
      seen.add(event.id);
      return [{ event, metric }];
    })
    .slice(0, Math.max(0, limit));
}

export function createChordChangeExercise(
  options: ChordChangeOptions,
): ExerciseDefinition<ChordChangePrompt, ChordChangeAnswer> {
  const durationSeconds = options.durationSeconds;
  if (
    durationSeconds !== undefined &&
    (!Number.isFinite(durationSeconds) || durationSeconds <= 0)
  ) {
    throw new RangeError("Timed chord changes require a positive finite duration");
  }
  const bpm = options.bpm;
  if (bpm !== undefined && (!Number.isFinite(bpm) || bpm <= 0)) {
    throw new RangeError("Clocked chord changes require a positive finite tempo");
  }
  const beatsPerChord =
    bpm === undefined ? undefined : Math.max(1, Math.round(options.beatsPerChord ?? 4));
  const startTimestampMs =
    bpm === undefined || options.startTimestampMs === undefined
      ? undefined
      : monotonicMs(options.startTimestampMs);
  const repetitions = Math.max(1, Math.min(8, Math.round(options.repetitions ?? 2)));
  // Timed mode grades an unbounded alternating cycle, so targets is just the
  // from→to pair template.
  const targets = buildTargets(options, durationSeconds === undefined ? repetitions : 1);

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
      id: `chord-change-${options.fromShape.id}-${options.toShape.id}-${
        durationSeconds === undefined ? repetitions : `timed${durationSeconds}`
      }${bpm === undefined ? "" : `-${bpm}bpm-${beatsPerChord}`}`,
      payload: {
        label:
          durationSeconds === undefined
            ? `${options.fromShape.name} to ${options.toShape.name} chord changes`
            : `${options.fromShape.name} to ${options.toShape.name} one-minute changes`,
        instrument: options.tuning.instrument,
        tuningId: options.tuning.id,
        fromShapeId: options.fromShape.id,
        toShapeId: options.toShape.id,
        repetitions,
        ...(durationSeconds === undefined ? {} : { durationSeconds }),
        ...(bpm === undefined
          ? {}
          : {
              bpm,
              beatsPerChord,
              ...(startTimestampMs === undefined ? {} : { startTimestampMs }),
              timingAnchor: (startTimestampMs === undefined
                ? "first-change"
                : "click") as ChordChangeTimingAnchor,
            }),
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
  const timed = prompt.durationSeconds !== undefined;
  const totalNotes = prompt.targets.reduce((sum, target) => sum + target.midiNotes.length, 0);

  return {
    accept(event) {
      if (event.type === "noteOn") input.push(event);
    },
    getLiveState() {
      // Timed runs never self-complete on progress — the caller ends them when
      // the clock runs out.
      const progress = timed || totalNotes === 0 ? 0 : Math.min(1, input.length / totalNotes);
      return { progress, runningScore: progress, feedback: [] };
    },
    finish() {
      const played = input.filter((event): event is NoteOnEvent => event.type === "noteOn");
      const clusters = clusterByGap(played);
      const metrics: ScoringMetric[] = [];
      const coverageByChange: number[] = [];
      let cleanChanges = 0;
      let completedChanges = 0;

      // Timed mode: one grading window per strum cluster, cycling through the
      // target pair. Reps mode: one window per fixed target.
      const windows = timed
        ? clusters.map((_, index) => prompt.targets[index % prompt.targets.length]!)
        : prompt.targets;

      // On a clock each window owns a beat, so a cluster grades against the bar
      // line it landed nearest. Without one, windows keep the arrival order.
      const clocked = prompt.bpm !== undefined && clusters.length > 0;
      const beatMs = prompt.bpm === undefined ? 0 : 60_000 / prompt.bpm;
      const stepMs = beatMs * (prompt.beatsPerChord ?? 4);
      // The click grid when the caller anchored us to the count-in downbeat,
      // otherwise the first change played: coming in a bar late then still
      // reads as on time, but nothing grades against time zero.
      const anchorMs = Number(prompt.startTimestampMs ?? clusters[0]?.[0]?.timestamp ?? 0);
      const assignment = clocked
        ? assignByNearestBeat(clusters, windows.length, anchorMs, stepMs)
        : windows.map((_, index) => (clusters[index] === undefined ? undefined : index));
      // The curriculum's window: min(180 ms, a quarter of the beat).
      const onTimeWindowMs = Math.min(180, beatMs / 4);
      const timingErrors: number[] = [];
      let onTimeChanges = 0;

      windows.forEach((target, targetIndex) => {
        const clusterIndex = assignment[targetIndex];
        const chunk = clusterIndex === undefined ? [] : clusters[clusterIndex]!;
        if (clocked && chunk.length > 0) {
          const expectedMs = anchorMs + targetIndex * stepMs;
          const actualMs = Number(chunk[0]!.timestamp);
          const errorMs = actualMs - expectedMs;
          metrics.push({ kind: "timing", expectedMs, actualMs, errorMs });
          timingErrors.push(Math.abs(errorMs));
          if (Math.abs(errorMs) <= onTimeWindowMs) onTimeChanges += 1;
        }
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
        windows.length > 1
          ? timestampDelta(clusters[0]?.[0]?.timestamp, clusters[1]?.[0]?.timestamp)
          : undefined;
      const meanTimingErrorMs =
        timingErrors.length === 0
          ? undefined
          : timingErrors.reduce((sum, error) => sum + error, 0) / timingErrors.length;
      const changesPerMinute =
        prompt.durationSeconds === undefined
          ? undefined
          : Math.round((cleanChanges * 60) / prompt.durationSeconds);
      if (changesPerMinute !== undefined) {
        metrics.push({
          kind: "chord-changes",
          tuningId: prompt.tuningId,
          durationSeconds: prompt.durationSeconds!,
          fromShapeId: prompt.fromShapeId,
          fromMidiNotes: [...prompt.targets[0]!.midiNotes],
          toShapeId: prompt.toShapeId,
          toMidiNotes: [...prompt.targets[1]!.midiNotes],
          completedChanges,
          cleanChanges,
          changesPerMinute,
        });
      }
      const correct = timed
        ? completedChanges > 0 && cleanChanges === completedChanges
        : cleanChanges === windows.length && windows.length > 0;

      return {
        correct,
        score,
        metrics,
        feedback: [
          {
            severity: correct ? "good" : "warn",
            message: `${
              timed
                ? `${cleanChanges} clean chord targets in ${prompt.durationSeconds}s`
                : `${cleanChanges}/${windows.length} clean chord targets`
            }${clocked ? ` · ${onTimeChanges}/${windows.length} on the beat` : ""}.`,
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
          ...(changesPerMinute === undefined ? {} : { changesPerMinute }),
          ...(clocked
            ? { onTimeChanges, timingAnchor: prompt.timingAnchor ?? "first-change" }
            : {}),
          ...(meanTimingErrorMs === undefined ? {} : { meanTimingErrorMs }),
          coverageByChange,
          playedMidiNotes: played.map((event) => event.midiNote),
        },
        input,
      };
    },
  };
}

/**
 * Each window claims the unused cluster nearest its own beat, within half a
 * step. A dropped chord therefore stays dropped instead of shifting every
 * later strum onto the wrong bar.
 */
function assignByNearestBeat(
  clusters: NoteOnEvent[][],
  windowCount: number,
  anchorMs: number,
  stepMs: number,
): (number | undefined)[] {
  const used = new Set<number>();
  return Array.from({ length: windowCount }, (_, index) => {
    const expectedMs = anchorMs + index * stepMs;
    let best: number | undefined;
    let bestError = stepMs / 2;
    clusters.forEach((cluster, clusterIndex) => {
      if (used.has(clusterIndex)) return;
      const error = Math.abs(Number(cluster[0]!.timestamp) - expectedMs);
      if (error <= bestError) {
        bestError = error;
        best = clusterIndex;
      }
    });
    if (best !== undefined) used.add(best);
    return best;
  });
}

function timestampDelta(first?: number, second?: number): number | undefined {
  if (first === undefined || second === undefined) return undefined;
  return Math.max(0, Math.round(second - first));
}

function sameNotes(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((note, index) => note === right[index]);
}

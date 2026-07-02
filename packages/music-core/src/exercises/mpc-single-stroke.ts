import {
  Capability,
  type ExerciseDefinition,
  type ExerciseRun,
  type FeedbackItem,
  type NoteOnEvent,
  type ScoringMetric,
} from "@repo/music-core/domain";
import { beatDurationMs } from "@repo/music-core/engines/transport";

const EXERCISE_ID = "technique.mpc.single-strokes";
const SKILL_IDS = ["technique.mpc", EXERCISE_ID];

export type MpcHitCount = 8 | 16;
export type MpcRudimentPatternId = "single-strokes" | "double-strokes" | "paradiddle";

export interface MpcRudimentPattern {
  id: MpcRudimentPatternId;
  label: string;
  unit: readonly ("left" | "right")[];
}

export const MPC_RUDIMENT_PATTERNS: readonly MpcRudimentPattern[] = [
  { id: "single-strokes", label: "Single strokes", unit: ["left", "right"] },
  { id: "double-strokes", label: "Double strokes", unit: ["left", "left", "right", "right"] },
  {
    id: "paradiddle",
    label: "Paradiddle",
    unit: ["left", "right", "left", "left", "right", "left", "right", "right"],
  },
];

export interface MpcSingleStrokeOptions {
  leftPadMidi?: number;
  rightPadMidi?: number;
  hitCount?: MpcHitCount;
  bpm?: number;
  patternId?: MpcRudimentPatternId;
}

export interface MpcSingleStrokePrompt {
  label: string;
  patternId: MpcRudimentPatternId;
  patternLabel: string;
  leftPadMidi: number;
  rightPadMidi: number;
  hitCount: MpcHitCount;
  bpm: number;
  targetSpacingMs: number;
  targetSequence: number[];
}

export interface MpcSingleStrokeAnswer {
  playedPads: number[];
  velocities: number[];
  relativeTimestampsMs: number[];
  padAccuracy: number;
  meanTimingErrorMs: number;
  velocityConsistency: number;
}

interface RunAnalysis extends MpcSingleStrokeAnswer {
  timingAccuracy: number;
  completion: number;
  score: number;
}

export function createMpcSingleStrokeExercise(
  options: MpcSingleStrokeOptions = {},
): ExerciseDefinition<MpcSingleStrokePrompt, MpcSingleStrokeAnswer> {
  const leftPadMidi = options.leftPadMidi ?? 36;
  const rightPadMidi = options.rightPadMidi ?? 38;
  validatePadMidi("leftPadMidi", leftPadMidi);
  validatePadMidi("rightPadMidi", rightPadMidi);
  if (leftPadMidi === rightPadMidi) {
    throw new Error("Choose two different MPC pads");
  }
  const pattern = rudimentPattern(options.patternId ?? "single-strokes");

  const hitCount = options.hitCount ?? 8;
  if (hitCount !== 8 && hitCount !== 16) {
    throw new Error("hitCount must be 8 or 16");
  }

  const requestedBpm = options.bpm ?? 80;
  if (!Number.isFinite(requestedBpm)) {
    throw new Error("BPM must be a finite number");
  }
  const bpm = clamp(requestedBpm, 30, 240);
  const targetSequence = buildMpcRudimentSequence(pattern.id, leftPadMidi, rightPadMidi, hitCount);
  const label = `MPC ${pattern.label.toLowerCase()}: pads ${leftPadMidi} / ${rightPadMidi}`;

  return {
    id: EXERCISE_ID,
    name: "MPC Single Strokes",
    capabilities: [Capability.Technique, Capability.Rhythm],
    skillIds: [...SKILL_IDS],
    inputs: ["midi", "onscreen"],
    streaming: true,
    generate: () => ({
      id: `mpc-single-strokes-${leftPadMidi}-${rightPadMidi}-${hitCount}-${bpm}`,
      payload: {
        label,
        patternId: pattern.id,
        patternLabel: pattern.label,
        leftPadMidi,
        rightPadMidi,
        hitCount,
        bpm,
        targetSpacingMs: beatDurationMs(bpm) / 2,
        targetSequence: [...targetSequence],
      },
    }),
    createRun(prompt) {
      return singleStrokeRun(prompt.payload);
    },
  };
}

export function buildMpcRudimentSequence(
  patternId: MpcRudimentPatternId,
  leftPadMidi: number,
  rightPadMidi: number,
  hitCount: MpcHitCount,
): number[] {
  const pattern = rudimentPattern(patternId);
  return Array.from({ length: hitCount }, (_, index) =>
    pattern.unit[index % pattern.unit.length] === "left" ? leftPadMidi : rightPadMidi,
  );
}

function singleStrokeRun(prompt: MpcSingleStrokePrompt): ExerciseRun<MpcSingleStrokeAnswer> {
  const hits: NoteOnEvent[] = [];

  return {
    accept(event) {
      if (
        event.type !== "noteOn" ||
        hits.length >= prompt.hitCount ||
        (event.midiNote !== prompt.leftPadMidi && event.midiNote !== prompt.rightPadMidi)
      ) {
        return;
      }
      hits.push(event);
    },
    getLiveState() {
      const analysis = analyze(hits, prompt);
      return {
        progress: analysis.completion,
        runningScore: analysis.score,
        feedback: liveFeedback(hits, prompt),
      };
    },
    finish() {
      const analysis = analyze(hits, prompt);
      const metrics = buildMetrics(hits, prompt, analysis);
      const correct =
        analysis.completion === 1 &&
        analysis.padAccuracy >= 0.875 &&
        analysis.meanTimingErrorMs <= 90 &&
        analysis.velocityConsistency >= 0.65;

      return {
        correct,
        score: analysis.score,
        metrics,
        feedback: [weakestDimensionFeedback(analysis)],
        target: { label: prompt.label, midiNotes: [...prompt.targetSequence] },
        response: { midiNotes: [...analysis.playedPads] },
        answer: {
          playedPads: [...analysis.playedPads],
          velocities: [...analysis.velocities],
          relativeTimestampsMs: [...analysis.relativeTimestampsMs],
          padAccuracy: analysis.padAccuracy,
          meanTimingErrorMs: analysis.meanTimingErrorMs,
          velocityConsistency: analysis.velocityConsistency,
        },
        input: [...hits],
      };
    },
  };
}

function analyze(hits: NoteOnEvent[], prompt: MpcSingleStrokePrompt): RunAnalysis {
  const firstTimestamp = hits[0] === undefined ? 0 : Number(hits[0].timestamp);
  const playedPads = hits.map((hit) => hit.midiNote);
  const velocities = hits.map((hit) => hit.velocity);
  const relativeTimestampsMs = hits.map((hit) => Number(hit.timestamp) - firstTimestamp);
  const correctPadHits = playedPads.reduce(
    (count, midiNote, index) => count + (midiNote === prompt.targetSequence[index] ? 1 : 0),
    0,
  );
  const timingErrors = relativeTimestampsMs.map(
    (actualMs, index) => actualMs - index * prompt.targetSpacingMs,
  );
  const meanTimingErrorMs =
    hits.length === 0 ? 180 : mean(timingErrors.map((error) => Math.abs(error)));
  const padAccuracy = correctPadHits / prompt.hitCount;
  const timingAccuracy = hits.length === 0 ? 0 : clamp(1 - meanTimingErrorMs / 180);
  const velocityConsistency = consistency(velocities);
  const completion = hits.length / prompt.hitCount;
  const score =
    padAccuracy * 0.45 + timingAccuracy * 0.3 + velocityConsistency * 0.15 + completion * 0.1;

  return {
    playedPads,
    velocities,
    relativeTimestampsMs,
    padAccuracy,
    meanTimingErrorMs,
    velocityConsistency,
    timingAccuracy,
    completion,
    score,
  };
}

function buildMetrics(
  hits: NoteOnEvent[],
  prompt: MpcSingleStrokePrompt,
  analysis: RunAnalysis,
): ScoringMetric[] {
  const meanVelocity = mean(analysis.velocities);

  return hits.flatMap((hit, index): ScoringMetric[] => {
    const expectedMs = index * prompt.targetSpacingMs;
    const actualMs = analysis.relativeTimestampsMs[index]!;
    return [
      {
        kind: "pitch",
        expectedMidi: prompt.targetSequence[index]!,
        actualMidi: hit.midiNote,
      },
      {
        kind: "timing",
        expectedMs,
        actualMs,
        errorMs: actualMs - expectedMs,
      },
      { kind: "velocity", expected: meanVelocity, actual: hit.velocity },
    ];
  });
}

function liveFeedback(hits: NoteOnEvent[], prompt: MpcSingleStrokePrompt): FeedbackItem[] {
  const index = hits.length - 1;
  const hit = hits[index];
  if (hit === undefined) return [];

  const expectedMidi = prompt.targetSequence[index]!;
  const orderFeedback: FeedbackItem =
    hit.midiNote === expectedMidi
      ? { severity: "good", message: `Pad ${hit.midiNote} matched the pattern.` }
      : {
          severity: "warn",
          message: `Expected pad ${expectedMidi}, played pad ${hit.midiNote}.`,
        };

  if (index === 0) return [orderFeedback];

  const relativeMs = Number(hit.timestamp) - Number(hits[0]!.timestamp);
  const timingErrorMs = relativeMs - index * prompt.targetSpacingMs;
  const timingFeedback: FeedbackItem =
    Math.abs(timingErrorMs) <= 45
      ? { severity: "good", message: "Timing is centered." }
      : {
          severity: "warn",
          message: `${Math.abs(Math.round(timingErrorMs))}ms ${
            timingErrorMs < 0 ? "early" : "late"
          }.`,
        };

  return [orderFeedback, timingFeedback];
}

function weakestDimensionFeedback(analysis: RunAnalysis): FeedbackItem {
  const dimensions = [
    { name: "pad accuracy", value: analysis.padAccuracy },
    { name: "timing", value: analysis.timingAccuracy },
    { name: "velocity consistency", value: analysis.velocityConsistency },
    { name: "completion", value: analysis.completion },
  ];
  const weakest = dimensions.reduce((lowest, dimension) =>
    dimension.value < lowest.value ? dimension : lowest,
  );

  return {
    severity: weakest.value >= 0.875 ? "good" : "warn",
    message: `Weakest dimension: ${weakest.name} (${Math.round(weakest.value * 100)}%).`,
  };
}

function consistency(values: number[]): number {
  if (values.length === 0) return 0;
  const average = mean(values);
  const variance = mean(values.map((value) => (value - average) ** 2));
  if (variance <= Number.EPSILON) return 1;
  return clamp(1 - Math.sqrt(variance) / Math.max(average, 0.01));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function validatePadMidi(name: "leftPadMidi" | "rightPadMidi", value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 127) {
    throw new Error(`${name} must be an integer between 0 and 127`);
  }
}

function rudimentPattern(patternId: MpcRudimentPatternId): MpcRudimentPattern {
  const pattern = MPC_RUDIMENT_PATTERNS.find((candidate) => candidate.id === patternId);
  if (!pattern) throw new Error(`Unknown MPC rudiment pattern: ${patternId}`);
  return pattern;
}

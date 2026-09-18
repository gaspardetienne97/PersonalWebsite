import {
  Capability,
  monotonicMs,
  type ExerciseDefinition,
  type ExerciseRun,
  type ExerciseResult,
  type FeedbackItem,
  type MonotonicMs,
  type NoteOnEvent,
  type ScoringMetric,
} from "@repo/music-core/domain";
import { beatDurationMs } from "@repo/music-core/engines/transport";

const EXERCISE_ID = "technique.mpc.single-strokes";
const SKILL_IDS = ["technique.mpc", EXERCISE_ID];

export type MpcHitCount = 8 | 16;
export type MpcRudimentPatternId =
  | "single-strokes"
  | "double-strokes"
  | "paradiddle"
  | "moving-accent"
  | "single-16ths"
  | "triple-strokes"
  | "flam";
/** Hits per beat: eighths, triplets or sixteenths. */
export type MpcSubdivision = 2 | 3 | 4;
export const MPC_SUBDIVISIONS: readonly MpcSubdivision[] = [2, 3, 4];
export const MPC_SUBDIVISION_LABELS: Record<MpcSubdivision, string> = {
  2: "Eighths",
  3: "Triplets",
  4: "Sixteenths",
};
/** A flam is a grace note this far ahead of its main hit, whatever the tempo. */
export const MPC_FLAM_GRACE_MS = 30;
export type MpcRudimentHand = "left" | "right";
/** Where the timing grid hangs off: the click's count-in downbeat, or the player's first hit. */
export type MpcTimingAnchor = "click" | "first-hit";
export type MpcRudimentAccent = "normal" | "accent";

export interface MpcVelocityBand {
  min: number;
  max: number;
  label: string;
}

export interface MpcRudimentTargetEvent {
  index: number;
  beat: number;
  hand: MpcRudimentHand;
  padMidi: number;
  accent: MpcRudimentAccent;
  velocityBand?: MpcVelocityBand;
  /** Grace note of a flam: expected this many ms *before* its beat. */
  graceMs?: number;
}

export interface MpcRudimentPattern {
  id: MpcRudimentPatternId;
  label: string;
  unit: readonly MpcRudimentHand[];
  accentMode?: "moving";
  /** Patterns that are defined by their grid (sixteenth singles, triplets) fix it. */
  subdivision?: MpcSubdivision;
  /** Each step is a grace note plus its main hit on the other hand. */
  flam?: true;
}

export const MPC_RUDIMENT_PATTERNS: readonly MpcRudimentPattern[] = [
  { id: "single-strokes", label: "Single strokes", unit: ["left", "right"] },
  { id: "double-strokes", label: "Double strokes", unit: ["left", "left", "right", "right"] },
  {
    id: "paradiddle",
    label: "Paradiddle",
    unit: ["left", "right", "left", "left", "right", "left", "right", "right"],
  },
  { id: "moving-accent", label: "Moving accent", unit: ["left", "right"], accentMode: "moving" },
  { id: "single-16ths", label: "Sixteenth singles", unit: ["left", "right"], subdivision: 4 },
  {
    id: "triple-strokes",
    label: "Triple strokes",
    unit: ["left", "left", "left", "right", "right", "right"],
    subdivision: 3,
  },
  { id: "flam", label: "Flam", unit: ["left", "right"], flam: true },
];

/** The pattern's own grid wins; otherwise the requested subdivision, else eighths. */
export function resolveMpcSubdivision(
  patternId: MpcRudimentPatternId,
  requested?: number,
): MpcSubdivision {
  const fixed = rudimentPattern(patternId).subdivision;
  if (fixed) return fixed;
  return MPC_SUBDIVISIONS.includes(requested as MpcSubdivision) ? (requested as MpcSubdivision) : 2;
}

export interface MpcSingleStrokeOptions {
  leftPadMidi?: number;
  rightPadMidi?: number;
  hitCount?: MpcHitCount;
  bpm?: number;
  patternId?: MpcRudimentPatternId;
  subdivision?: MpcSubdivision;
  /** Count-in downbeat the click grid hangs off; timing is measured against it. */
  startTimestampMs?: MonotonicMs | number;
}

export interface MpcSingleStrokePrompt {
  label: string;
  patternId: MpcRudimentPatternId;
  patternLabel: string;
  leftPadMidi: number;
  rightPadMidi: number;
  hitCount: MpcHitCount;
  bpm: number;
  subdivision: MpcSubdivision;
  /** Count-in downbeat, when the caller gave one; absent means "anchor on the first hit". */
  startTimestampMs?: MonotonicMs;
  timingAnchor: MpcTimingAnchor;
  targetSpacingMs: number;
  targetSequence: number[];
  targetEvents: MpcRudimentTargetEvent[];
}

export interface MpcSingleStrokeAnswer {
  playedPads: number[];
  velocities: number[];
  relativeTimestampsMs: number[];
  padAccuracy: number;
  meanTimingErrorMs: number;
  velocityConsistency: number;
  timingAnchor: MpcTimingAnchor;
}

/** Display only observed dimensions; the persisted practice score and XP are unchanged. */
export function assessedMpcResult(result: ExerciseResult<MpcSingleStrokeAnswer>): {
  score: number;
  velocityMeasured: boolean;
} {
  const velocityMeasured =
    result.input.length > 0 && result.input.every((event) => event.source === "midi");
  return {
    velocityMeasured,
    score: velocityMeasured
      ? result.score
      : clamp((result.score - (result.answer?.velocityConsistency ?? 0) * 0.15) / 0.85),
  };
}

interface RunAnalysis extends MpcSingleStrokeAnswer {
  timingAccuracy: number;
  completion: number;
  score: number;
  velocityDimensionName: "velocity consistency" | "velocity control";
}

const accentVelocityBand: MpcVelocityBand = { min: 0.75, max: 1, label: "accent" };
const tapVelocityBand: MpcVelocityBand = { min: 0.25, max: 0.7, label: "tap" };

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
  const subdivision = resolveMpcSubdivision(pattern.id, options.subdivision);
  const startTimestampMs =
    options.startTimestampMs === undefined ? undefined : monotonicMs(options.startTimestampMs);
  const targetEvents = buildMpcRudimentTargetEvents(
    pattern.id,
    leftPadMidi,
    rightPadMidi,
    hitCount,
    subdivision,
  );
  const targetSequence = targetEvents.map((event) => event.padMidi);
  const label = `MPC ${pattern.label.toLowerCase()}: pads ${leftPadMidi} / ${rightPadMidi}`;
  const skillIds =
    pattern.id === "paradiddle" ? [...SKILL_IDS, "technique.mpc.paradiddles"] : SKILL_IDS;

  return {
    id: EXERCISE_ID,
    name: "MPC Single Strokes",
    capabilities: [Capability.Technique, Capability.Rhythm],
    skillIds: [...skillIds],
    inputs: ["midi", "onscreen"],
    streaming: true,
    generate: () => ({
      id: `mpc-${pattern.id}-${leftPadMidi}-${rightPadMidi}-${hitCount}-${bpm}`,
      payload: {
        label,
        patternId: pattern.id,
        patternLabel: pattern.label,
        leftPadMidi,
        rightPadMidi,
        hitCount,
        bpm,
        subdivision,
        ...(startTimestampMs === undefined ? {} : { startTimestampMs }),
        timingAnchor: startTimestampMs === undefined ? "first-hit" : "click",
        targetSpacingMs: beatDurationMs(bpm) / subdivision,
        targetSequence: [...targetSequence],
        targetEvents: [...targetEvents],
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
  subdivision?: MpcSubdivision,
): number[] {
  return buildMpcRudimentTargetEvents(
    patternId,
    leftPadMidi,
    rightPadMidi,
    hitCount,
    subdivision,
  ).map((event) => event.padMidi);
}

export function buildMpcRudimentTargetEvents(
  patternId: MpcRudimentPatternId,
  leftPadMidi: number,
  rightPadMidi: number,
  hitCount: MpcHitCount,
  subdivision?: MpcSubdivision,
): MpcRudimentTargetEvent[] {
  const pattern = rudimentPattern(patternId);
  const grid = resolveMpcSubdivision(patternId, subdivision);
  return Array.from({ length: hitCount }, (_, index) => {
    // A flam spends two events on one grid step: grace note, then main hit.
    const step = pattern.flam ? Math.floor(index / 2) : index;
    const isGrace = pattern.flam === true && index % 2 === 0;
    const mainHand = pattern.unit[step % pattern.unit.length]!;
    const hand = isGrace ? otherHand(mainHand) : mainHand;
    const accent = accentFor(pattern, index);
    return {
      index,
      beat: step / grid,
      hand,
      padMidi: hand === "left" ? leftPadMidi : rightPadMidi,
      accent,
      ...(isGrace ? { graceMs: MPC_FLAM_GRACE_MS } : {}),
      ...(pattern.accentMode === "moving"
        ? { velocityBand: accent === "accent" ? accentVelocityBand : tapVelocityBand }
        : {}),
    };
  });
}

/** Offset of each target from the click anchor, in ms (a flam grace sits just ahead of its beat). */
function expectedOffsetsMs(prompt: MpcSingleStrokePrompt): number[] {
  const beatMs = beatDurationMs(prompt.bpm);
  return prompt.targetEvents.map((event) => event.beat * beatMs - (event.graceMs ?? 0));
}

function otherHand(hand: MpcRudimentHand): MpcRudimentHand {
  return hand === "left" ? "right" : "left";
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
      const requiredVelocityScore = prompt.targetEvents.some((event) => event.velocityBand)
        ? 0.875
        : 0.65;
      const correct =
        analysis.completion === 1 &&
        analysis.padAccuracy >= 0.875 &&
        analysis.meanTimingErrorMs <= 90 &&
        analysis.velocityConsistency >= requiredVelocityScore;

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
          timingAnchor: analysis.timingAnchor,
        },
        input: [...hits],
      };
    },
  };
}

/**
 * The click grid when the caller anchored us to the count-in downbeat, otherwise the first hit:
 * a missing anchor degrades to "even spacing scores well" instead of grading against time zero.
 */
function anchorMs(prompt: MpcSingleStrokePrompt, hits: NoteOnEvent[]): number {
  return Number(prompt.startTimestampMs ?? hits[0]?.timestamp ?? 0);
}

function analyze(hits: NoteOnEvent[], prompt: MpcSingleStrokePrompt): RunAnalysis {
  const anchor = anchorMs(prompt, hits);
  const expectedMs = expectedOffsetsMs(prompt);
  const playedPads = hits.map((hit) => hit.midiNote);
  const velocities = hits.map((hit) => hit.velocity);
  const relativeTimestampsMs = hits.map((hit) => Number(hit.timestamp) - anchor);
  const correctPadHits = playedPads.reduce(
    (count, midiNote, index) => count + (midiNote === prompt.targetSequence[index] ? 1 : 0),
    0,
  );
  const timingErrors = relativeTimestampsMs.map(
    (actualMs, index) => actualMs - (expectedMs[index] ?? index * prompt.targetSpacingMs),
  );
  const meanTimingErrorMs =
    hits.length === 0 ? 180 : mean(timingErrors.map((error) => Math.abs(error)));
  const padAccuracy = correctPadHits / prompt.hitCount;
  const timingAccuracy = hits.length === 0 ? 0 : clamp(1 - meanTimingErrorMs / 180);
  const hasVelocityTargets = prompt.targetEvents.some((event) => event.velocityBand);
  const velocityConsistency = hasVelocityTargets
    ? velocityTargetAccuracy(hits, prompt)
    : consistency(velocities);
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
    timingAnchor: prompt.timingAnchor,
    timingAccuracy,
    completion,
    score,
    velocityDimensionName: hasVelocityTargets ? "velocity control" : "velocity consistency",
  };
}

function buildMetrics(
  hits: NoteOnEvent[],
  prompt: MpcSingleStrokePrompt,
  analysis: RunAnalysis,
): ScoringMetric[] {
  const meanVelocity = mean(analysis.velocities);
  const expectedOffsets = expectedOffsetsMs(prompt);

  return hits.flatMap((hit, index): ScoringMetric[] => {
    const expectedMs = expectedOffsets[index] ?? index * prompt.targetSpacingMs;
    const actualMs = analysis.relativeTimestampsMs[index]!;
    const velocityTarget = prompt.targetEvents[index]?.velocityBand;
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
      {
        kind: "velocity",
        expected: velocityTarget ? (velocityTarget.min + velocityTarget.max) / 2 : meanVelocity,
        actual: hit.velocity,
      },
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

  const relativeMs = Number(hit.timestamp) - anchorMs(prompt, hits);
  const timingErrorMs =
    relativeMs - (expectedOffsetsMs(prompt)[index] ?? index * prompt.targetSpacingMs);
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
    { name: analysis.velocityDimensionName, value: analysis.velocityConsistency },
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

function velocityTargetAccuracy(hits: NoteOnEvent[], prompt: MpcSingleStrokePrompt): number {
  if (hits.length === 0) return 0;
  const matched = hits.reduce((count, hit, index) => {
    const band = prompt.targetEvents[index]?.velocityBand;
    if (!band) return count + 1;
    return count + (hit.velocity >= band.min && hit.velocity <= band.max ? 1 : 0);
  }, 0);
  return matched / prompt.hitCount;
}

function accentFor(pattern: MpcRudimentPattern, index: number): MpcRudimentAccent {
  if (pattern.accentMode !== "moving") return "normal";
  const groupIndex = Math.floor(index / 4);
  return index % 4 === groupIndex % 4 ? "accent" : "normal";
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

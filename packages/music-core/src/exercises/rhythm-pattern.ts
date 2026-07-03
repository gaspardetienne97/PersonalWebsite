import {
  Capability,
  monotonicMs,
  type ExerciseDefinition,
  type ExerciseRun,
  type MonotonicMs,
  type NoteEvent,
  type ScoringMetric,
} from "@repo/music-core/domain";
import { beatDurationMs } from "@repo/music-core/engines/transport";

export type RhythmPatternId =
  | "quarter-pulse"
  | "eighths"
  | "sixteenths"
  | "eighth-rests"
  | "triplets"
  | "gap-click-1-on-1-off";

export interface RhythmPatternEvent {
  id: string;
  beat: number;
  voice: "tap" | "left" | "right";
  accent?: "normal" | "accent" | "ghost";
}

export interface RhythmRestWindow {
  startBeat: number;
  endBeat: number;
}

export interface RhythmClickScheduleEntry {
  bar: number;
  audible: boolean;
}

export interface RhythmPatternDefinition {
  id: RhythmPatternId;
  label: string;
  meter: { beats: number; beatUnit: number };
  defaultBars: number;
  events: RhythmPatternEvent[];
  rests: RhythmRestWindow[];
  clickSchedule?: RhythmClickScheduleEntry[];
}

export interface RhythmPatternOptions {
  patternId: RhythmPatternId;
  bpm: number;
  bars?: number;
  startTimestampMs?: MonotonicMs | number;
}

export interface RhythmPatternPrompt {
  id: RhythmPatternId;
  label: string;
  bpm: number;
  meter: { beats: number; beatUnit: number };
  bars: number;
  startTimestampMs: MonotonicMs;
  events: RhythmPatternEvent[];
  rests: RhythmRestWindow[];
  expectedMs: number[];
  clickSchedule?: RhythmClickScheduleEntry[];
}

export interface RhythmPatternAnswer {
  meanAbsoluteErrorMs: number;
  meanSignedErrorMs: number;
  jitterMs: number;
  missedEvents: number;
  extraRestHits: number;
}

export const RHYTHM_PATTERN_CATALOG: RhythmPatternDefinition[] = [
  {
    id: "quarter-pulse",
    label: "Quarter-note pulse",
    meter: { beats: 4, beatUnit: 4 },
    defaultBars: 1,
    events: beatGrid(4, 1),
    rests: [],
  },
  {
    id: "eighths",
    label: "Eighth notes",
    meter: { beats: 4, beatUnit: 4 },
    defaultBars: 1,
    events: beatGrid(8, 0.5),
    rests: [],
  },
  {
    id: "sixteenths",
    label: "Sixteenth notes",
    meter: { beats: 4, beatUnit: 4 },
    defaultBars: 1,
    events: beatGrid(16, 0.25),
    rests: [],
  },
  {
    id: "eighth-rests",
    label: "Eighth-note rests",
    meter: { beats: 4, beatUnit: 4 },
    defaultBars: 1,
    events: beatGrid(4, 1),
    rests: [
      { startBeat: 0.5, endBeat: 1 },
      { startBeat: 1.5, endBeat: 2 },
      { startBeat: 2.5, endBeat: 3 },
      { startBeat: 3.5, endBeat: 4 },
    ],
  },
  {
    id: "triplets",
    label: "Triplets",
    meter: { beats: 4, beatUnit: 4 },
    defaultBars: 1,
    events: beatGrid(12, 1 / 3),
    rests: [],
  },
  {
    id: "gap-click-1-on-1-off",
    label: "Gap click: 1 on / 1 off",
    meter: { beats: 4, beatUnit: 4 },
    defaultBars: 2,
    events: beatGrid(8, 1),
    rests: [],
    clickSchedule: [
      { bar: 0, audible: true },
      { bar: 1, audible: false },
    ],
  },
];

export function rhythmPatternDefinition(patternId: RhythmPatternId): RhythmPatternDefinition {
  return (
    RHYTHM_PATTERN_CATALOG.find((pattern) => pattern.id === patternId) ?? RHYTHM_PATTERN_CATALOG[0]!
  );
}

export function createRhythmPatternExercise(
  options: RhythmPatternOptions,
): ExerciseDefinition<RhythmPatternPrompt, RhythmPatternAnswer> {
  const definition = rhythmPatternDefinition(options.patternId);
  const bars = options.bars ?? definition.defaultBars;
  const prompt = buildRhythmPatternPrompt(definition, {
    bpm: options.bpm,
    bars,
    startTimestampMs: monotonicMs(options.startTimestampMs ?? 0),
  });

  return {
    id: `rhythm.pattern.${definition.id}`,
    name: definition.label,
    capabilities: [Capability.Rhythm],
    skillIds: [`rhythm.pattern.${definition.id}`, rhythmSkillId(definition.id)],
    inputs: ["midi", "onscreen", "audio"],
    streaming: true,
    generate: () => ({
      id: `rhythm-pattern-${definition.id}-${options.bpm}-${bars}`,
      payload: prompt,
    }),
    createRun(generatedPrompt) {
      return rhythmPatternRun(generatedPrompt.payload);
    },
  };
}

function buildRhythmPatternPrompt(
  definition: RhythmPatternDefinition,
  options: { bpm: number; bars: number; startTimestampMs: MonotonicMs },
): RhythmPatternPrompt {
  const patternBeats = definition.meter.beats * definition.defaultBars;
  const repetitions = Math.max(1, Math.ceil(options.bars / definition.defaultBars));
  const beatMs = beatDurationMs(options.bpm);
  const events = Array.from({ length: repetitions }, (_unused, repetition) =>
    definition.events.map((event) => ({
      ...event,
      id: `${event.id}-bar-${repetition}`,
      beat: event.beat + repetition * patternBeats,
    })),
  )
    .flat()
    .filter((event) => event.beat < options.bars * definition.meter.beats);
  const rests = Array.from({ length: repetitions }, (_unused, repetition) =>
    definition.rests.map((rest) => ({
      startBeat: rest.startBeat + repetition * patternBeats,
      endBeat: rest.endBeat + repetition * patternBeats,
    })),
  )
    .flat()
    .filter((rest) => rest.startBeat < options.bars * definition.meter.beats);

  return {
    id: definition.id,
    label: definition.label,
    bpm: options.bpm,
    meter: definition.meter,
    bars: options.bars,
    startTimestampMs: options.startTimestampMs,
    events,
    rests,
    expectedMs: events.map((event) => Number(options.startTimestampMs) + event.beat * beatMs),
    ...(definition.clickSchedule === undefined
      ? {}
      : {
          clickSchedule: definition.clickSchedule.filter((entry) => entry.bar < options.bars),
        }),
  };
}

function rhythmPatternRun(prompt: RhythmPatternPrompt): ExerciseRun<RhythmPatternAnswer> {
  const hits: NoteEvent[] = [];

  return {
    accept(event) {
      if (event.type === "noteOn" || event.type === "onset") hits.push(event);
    },
    getLiveState() {
      const progress =
        prompt.events.length === 0 ? 1 : Math.min(1, hits.length / prompt.events.length);
      return { progress, runningScore: progress, feedback: [] };
    },
    finish() {
      const restHitIndices = hits
        .map((event, index) => ({ event, index }))
        .filter(({ event }) => isRestHit(prompt, Number(event.timestamp)))
        .map(({ index }) => index);
      const scorableHits = hits.filter((_hit, index) => !restHitIndices.includes(index));
      const metrics: ScoringMetric[] = prompt.expectedMs.map((expectedMs, index) => {
        const actual = Number(scorableHits[index]?.timestamp ?? Number.NaN);
        const actualMs = Number.isFinite(actual) ? actual : expectedMs + 999;
        return { kind: "timing", expectedMs, actualMs, errorMs: actualMs - expectedMs };
      });
      const errors = metrics
        .filter((metric) => metric.kind === "timing")
        .map((metric) => metric.errorMs);
      const missedEvents = Math.max(0, prompt.events.length - scorableHits.length);
      const meanAbsoluteErrorMs = average(errors.map((error) => Math.abs(error)));
      const meanSignedErrorMs = average(errors);
      const jitterMs = standardDeviation(errors);
      const extraRestHits = restHitIndices.length;
      const timingScore = Math.max(0, 1 - meanAbsoluteErrorMs / 160);
      const restPenalty = Math.min(0.5, extraRestHits * 0.2);
      const missedPenalty = Math.min(0.6, missedEvents * 0.2);
      const score = Math.max(0, timingScore - restPenalty - missedPenalty);
      const answer: RhythmPatternAnswer = {
        meanAbsoluteErrorMs,
        meanSignedErrorMs,
        jitterMs,
        missedEvents,
        extraRestHits,
      };

      return {
        correct: score >= 0.85,
        score,
        metrics,
        feedback: [
          {
            severity: score >= 0.85 ? "good" : "warn",
            message: `Timing ${Math.round(meanSignedErrorMs)}ms · ${missedEvents} missed · ${extraRestHits} rest hit${extraRestHits === 1 ? "" : "s"}.`,
          },
        ],
        target: { label: prompt.label, events: prompt.events },
        response: { label: `${hits.length} hits` },
        answer,
        input: hits,
      };
    },
  };
}

function isRestHit(prompt: RhythmPatternPrompt, timestampMs: number): boolean {
  const beatMs = beatDurationMs(prompt.bpm);
  const beat = (timestampMs - Number(prompt.startTimestampMs)) / beatMs;
  return prompt.rests.some((rest) => beat >= rest.startBeat && beat < rest.endBeat);
}

function rhythmSkillId(patternId: RhythmPatternId): string {
  if (patternId === "eighths") return "rhythm.subdivision.eighths";
  if (patternId === "sixteenths") return "rhythm.subdivision.sixteenths";
  if (patternId === "gap-click-1-on-1-off") return "rhythm.gap-click";
  return "rhythm.patterns";
}

function beatGrid(count: number, stepBeats: number): RhythmPatternEvent[] {
  return Array.from({ length: count }, (_unused, index) => ({
    id: `tap-${index + 1}`,
    beat: index * stepBeats,
    voice: "tap",
    accent: index === 0 ? "accent" : "normal",
  }));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

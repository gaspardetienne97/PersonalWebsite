/**
 * Validation harness: implement four exercises that stress different axes of
 * the model and confirm they express cleanly. If any needs a field the model
 * lacks, that's the signal to revise now (cheap) rather than later (expensive).
 *
 *   1. Interval recognition  - discrete, choice metric, "heard" modality
 *   2. Guitar spider drill    - streaming, per-note pitch+timing, technique
 *   3. Sight-reading          - streaming over a Score, score-follower style
 *   4. Aerophone long tone    - streaming, continuous CC/breath metric
 */
import {
  type ExerciseDefinition,
  type ExerciseRun,
  type ExerciseResult,
  type FeedbackItem,
  discreteRun,
  Capability,
  isNoteOn,
  monotonicMs,
  type NoteEvent,
  type ScoringMetric,
} from "./index";

/* 1. INTERVAL RECOGNITION - discrete, choice-based, by ear ----------------- */
interface IntervalPrompt {
  rootMidi: number;
  semitones: number;
  answer: string;
}
const intervalExercise: ExerciseDefinition<IntervalPrompt, string> = {
  id: "ear.interval-recognition",
  name: "Interval Recognition",
  capabilities: [Capability.EarTraining, Capability.Pitch],
  skillIds: ["pitch.interval.m6"],
  inputs: ["click", "midi", "onscreen"],
  streaming: false,
  generate: () => ({
    id: "p1",
    payload: { rootMidi: 60, semitones: 8, answer: "m6" },
  }),
  createRun(prompt) {
    return discreteRun<string>((input) => {
      // A choice exercise: the user clicked a labelled answer (carried via raw).
      const chosen = (input[0]?.raw?.midiData1 ?? -1) === 8 ? "m6" : "P5";
      const correct = chosen === prompt.payload.answer;
      const metrics: ScoringMetric[] = [
        { kind: "choice", expected: prompt.payload.answer, actual: chosen },
      ];
      const feedback: FeedbackItem[] = [
        correct
          ? { severity: "good", message: "Correct - minor 6th." }
          : { severity: "error", message: `Heard ${prompt.payload.answer}, you chose ${chosen}.` },
      ];
      return {
        correct,
        score: correct ? 1 : 0,
        latencyMs: 800,
        metrics,
        feedback,
        target: { label: prompt.payload.answer, choice: prompt.payload.answer },
        response: { choice: chosen },
        answer: chosen,
        input,
      } satisfies ExerciseResult<string>;
    });
  },
};

/* 2. GUITAR SPIDER DRILL - streaming, per-note pitch + timing -------------- */
interface SpiderPrompt {
  expected: { midi: number; atMs: number }[];
}
function spiderRun(prompt: SpiderPrompt): ExerciseRun<number> {
  const hits: NoteEvent[] = [];
  return {
    accept(e) {
      if (isNoteOn(e)) hits.push(e);
    },
    getLiveState() {
      return { progress: hits.length / prompt.expected.length, runningScore: 0, feedback: [] };
    },
    finish() {
      const metrics: ScoringMetric[] = [];
      let good = 0;
      prompt.expected.forEach((exp, i) => {
        const got = hits[i];
        if (got && isNoteOn(got)) {
          const errorMs = (got.timestamp as number) - exp.atMs;
          metrics.push({ kind: "pitch", expectedMidi: exp.midi, actualMidi: got.midiNote });
          metrics.push({
            kind: "timing",
            expectedMs: exp.atMs,
            actualMs: got.timestamp as number,
            errorMs,
          });
          if (got.midiNote === exp.midi && Math.abs(errorMs) < 60) good++;
        } else {
          metrics.push({ kind: "pitch", expectedMidi: exp.midi });
        }
      });
      const score = good / prompt.expected.length;
      return {
        correct: score > 0.9,
        score,
        metrics,
        feedback: [
          {
            severity: score > 0.9 ? "good" : "warn",
            message: `${good}/${prompt.expected.length} clean`,
          },
        ],
        input: hits,
      } satisfies ExerciseResult<number>;
    },
  };
}
const spiderExercise: ExerciseDefinition<SpiderPrompt, number> = {
  id: "technique.guitar.spider",
  name: "Spider Drill (1-2-3-4)",
  capabilities: [Capability.Technique],
  skillIds: ["technique.guitar.chromatic-1234"],
  inputs: ["audio", "midi"],
  streaming: true,
  generate: () => ({
    id: "p",
    payload: {
      expected: [
        { midi: 40, atMs: 0 },
        { midi: 41, atMs: 500 },
        { midi: 42, atMs: 1000 },
        { midi: 43, atMs: 1500 },
      ],
    },
  }),
  createRun: (prompt) => spiderRun(prompt.payload),
};

/* 3. SIGHT-READING - streaming over a Score (score-follower) --------------- */
interface ReadingPrompt {
  scoreNoteMidis: number[];
}
function readingRun(prompt: ReadingPrompt): ExerciseRun<number[]> {
  const played: number[] = [];
  return {
    accept(e) {
      if (isNoteOn(e)) played.push(e.midiNote);
    },
    getLiveState() {
      return {
        progress: played.length / prompt.scoreNoteMidis.length,
        runningScore: 0,
        feedback: [],
      };
    },
    finish() {
      const metrics: ScoringMetric[] = prompt.scoreNoteMidis.map((m, i) => ({
        kind: "pitch",
        expectedMidi: m,
        actualMidi: played[i],
      }));
      const good = prompt.scoreNoteMidis.filter((m, i) => played[i] === m).length;
      const score = good / prompt.scoreNoteMidis.length;
      return {
        correct: score === 1,
        score,
        metrics,
        feedback: [{ severity: "info", message: `Read ${good}/${prompt.scoreNoteMidis.length}` }],
        answer: played,
        input: [],
      } satisfies ExerciseResult<number[]>;
    },
  };
}
const sightReadingExercise: ExerciseDefinition<ReadingPrompt, number[]> = {
  id: "reading.sight-reading",
  name: "Sight-Reading",
  capabilities: [Capability.Reading],
  skillIds: ["reading.treble.stepwise"],
  inputs: ["midi", "audio", "onscreen"],
  streaming: true,
  generate: () => ({
    id: "p",
    payload: { scoreNoteMidis: [60, 62, 64, 65] },
    scoreId: "score-123",
  }),
  createRun: (prompt) => readingRun(prompt.payload),
};

/* 4. AEROPHONE LONG TONE - streaming, continuous breath/CC ----------------- */
interface LongTonePrompt {
  holdMs: number;
}
function longToneRun(_prompt: LongTonePrompt): ExerciseRun<number> {
  const breath: number[] = [];
  return {
    accept(e) {
      if (e.type === "cc" && e.controller === 2) breath.push(e.value);
    },
    getLiveState() {
      return { progress: Math.min(1, breath.length / 50), runningScore: 0, feedback: [] };
    },
    finish() {
      const mean = breath.reduce((a, b) => a + b, 0) / (breath.length || 1);
      const variance = breath.reduce((a, b) => a + (b - mean) ** 2, 0) / (breath.length || 1);
      const steadiness = Math.max(0, 1 - Math.sqrt(variance) * 4);
      const metrics: ScoringMetric[] = [{ kind: "breath", steadiness, actualCurve: breath }];
      return {
        correct: steadiness > 0.8,
        score: steadiness,
        metrics,
        feedback: [
          {
            severity: steadiness > 0.8 ? "good" : "warn",
            message: `Breath steadiness ${(steadiness * 100).toFixed(0)}%`,
          },
        ],
        input: [],
      } satisfies ExerciseResult<number>;
    },
  };
}
const longToneExercise: ExerciseDefinition<LongTonePrompt, number> = {
  id: "technique.aerophone.long-tone",
  name: "Long Tone / Breath Steadiness",
  capabilities: [Capability.Technique, Capability.Pitch],
  skillIds: ["technique.aerophone.breath-steadiness"],
  inputs: ["midi"],
  streaming: true,
  generate: () => ({ id: "p", payload: { holdMs: 5000 } }),
  createRun: (prompt) => longToneRun(prompt.payload),
};

/* ---- Exercise each one end-to-end to prove the shapes hold --------------- */
function runOne<P, A>(ex: ExerciseDefinition<P, A>, feed: NoteEvent[]): ExerciseResult<A> {
  const ctx = { targetSkillIds: ex.skillIds, difficulty: 0.5 };
  const prompt = ex.generate(ctx);
  const run = ex.createRun(prompt, ctx);
  for (const e of feed) run.accept(e);
  return run.finish();
}

const breath = (v: number): NoteEvent => ({
  type: "cc",
  controller: 2,
  value: v,
  source: "midi",
  timestamp: monotonicMs(0),
  clock: "performance",
});
const note = (m: number, t: number): NoteEvent => ({
  type: "noteOn",
  midiNote: m,
  velocity: 0.8,
  source: "midi",
  timestamp: monotonicMs(t),
  clock: "performance",
});

const r1 = runOne(intervalExercise, [
  {
    type: "noteOn",
    midiNote: 68,
    velocity: 1,
    source: "click",
    timestamp: monotonicMs(0),
    clock: "performance",
    raw: { midiData1: 8 },
  },
]);
const r2 = runOne(spiderExercise, [note(40, 0), note(41, 500), note(42, 1000), note(43, 1500)]);
const r3 = runOne(sightReadingExercise, [note(60, 0), note(62, 1), note(64, 2), note(65, 3)]);
const r4 = runOne(longToneExercise, [breath(0.7), breath(0.71), breath(0.69), breath(0.7)]);

for (const [id, r] of [
  ["interval", r1],
  ["spider", r2],
  ["sight-reading", r3],
  ["long-tone", r4],
] as const) {
  console.log(
    `${id.padEnd(16)} score=${r.score.toFixed(2)} correct=${r.correct} metrics=${r.metrics.length} feedback="${r.feedback[0]?.message}"`,
  );
}
console.log("\nAll four exercises expressed cleanly against domain v1.1.");

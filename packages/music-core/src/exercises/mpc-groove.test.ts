import { describe, expect, test } from "vitest";
import { monotonicMs, type ExerciseContext, type NoteOnEvent } from "@repo/music-core/domain";
import { createMpcGrooveExercise, normalizeMpcGrooveConfig } from "./mpc-groove";
const context: ExerciseContext = { instrument: "mpc", difficulty: 0.5, targetSkillIds: [] };
function setup(family = "backbeat") {
  const exercise = createMpcGrooveExercise({
    ...normalizeMpcGrooveConfig({ groove: family, bpm: 120 }),
    responseStart: monotonicMs(1000),
  });
  const prompt = exercise.generate(context);
  return { exercise, prompt: prompt.payload, run: exercise.createRun(prompt, context) };
}
const hit = (
  midiNote: number,
  timestamp: number,
  velocity = 1,
  source: "midi" | "onscreen" = "midi",
): NoteOnEvent => ({
  type: "noteOn",
  midiNote,
  timestamp: monotonicMs(timestamp),
  velocity,
  source,
  clock: "performance",
});
describe("MPC independent groove recall", () => {
  test("matches simultaneous voices and stays open for late extras until explicit finish", () => {
    const { run, prompt } = setup("eighth-hats");
    for (const target of prompt.targets)
      run.accept(hit(prompt.mapping[target.voice], 1000 + target.beat * 500));
    expect(run.getLiveState()).toEqual({ progress: 0, runningScore: 0, feedback: [] });
    run.accept(hit(51, 2999));
    const result = run.finish({ reason: "completed" });
    expect(result.answer).toMatchObject({
      matched: 12,
      omissions: 0,
      extras: 1,
      meanTimingErrorMs: 0,
    });
    expect(result.score).toBeCloseTo(12 / 13);
    run.accept(hit(51, 2500));
    expect(run.finish({ reason: "completed" }).answer?.extras).toBe(1);
  });
  test("misses do not shift later matches; wrong and unmapped voices count as extras", () => {
    const { run } = setup();
    run.accept(hit(36, 1510)); // wrong voice, outside kick window
    run.accept(hit(36, 2010));
    run.accept(hit(38, 2510));
    run.accept(hit(51, 2200));
    expect(run.finish({ reason: "completed" }).answer).toMatchObject({
      matched: 2,
      omissions: 2,
      extras: 2,
      meanTimingErrorMs: 10,
    });
  });
  test("uses a half-open absolute response interval, including lookahead and no input", () => {
    const { run } = setup();
    run.accept(hit(36, 999));
    run.accept(hit(38, 3000));
    const result = run.finish({ reason: "completed" });
    expect(result).toMatchObject({
      correct: false,
      score: 0,
      input: [],
      answer: { meanTimingErrorMs: null, omissions: 4, extras: 0 },
    });
    const next = setup();
    next.run.accept(hit(36, 1000));
    next.run.accept(hit(51, 2999));
    expect(next.run.finish({ reason: "completed" }).input).toHaveLength(2);
  });
  test("reports variable matched MIDI velocity evidence without inventing accent targets", () => {
    for (const [source, velocities, measured] of [
      ["midi", [0.3, 0.8], true],
      ["midi", [0.8, 0.8], false],
      ["onscreen", [0.3, 0.8], false],
    ] as const) {
      const { run } = setup();
      run.accept(hit(36, 1000, velocities[0], source));
      run.accept(hit(38, 1500, velocities[1], source));
      expect(run.finish({ reason: "completed" }).answer).toMatchObject({
        variableMidiVelocity: measured,
        accentAssessed: false,
      });
    }
  });
  test("normalizes URL family and mappings and rejects overlapping voices", () => {
    const config = normalizeMpcGrooveConfig(
      new URLSearchParams("groove=syncopated&kick=40&snare=41&hats=42&bpm=120"),
    );
    expect(config).toMatchObject({
      family: "syncopated",
      mapping: { kick: 40, snare: 41, hats: 42 },
      bpm: 120,
    });
    expect(() =>
      createMpcGrooveExercise({
        ...config,
        mapping: { kick: 36, snare: 36, hats: 42 },
        responseStart: monotonicMs(0),
      }),
    ).toThrow();
  });
});

test("preserves the shared clock tempo at supported URL extremes", () => {
  for (const bpm of [20, 300]) {
    const config = normalizeMpcGrooveConfig({ bpm });
    expect(config.bpm).toBe(bpm);
    const prompt = createMpcGrooveExercise({
      ...config,
      responseStart: monotonicMs(1000),
    }).generate(context).payload;
    expect(prompt.responseEnd).toBe(1000 + 240000 / bpm);
  }
});

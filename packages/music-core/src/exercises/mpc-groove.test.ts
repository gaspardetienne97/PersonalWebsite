import { describe, expect, test } from "vitest";
import {
  DRUM_VOICE_PADS,
  monotonicMs,
  type ExerciseContext,
  type NoteOnEvent,
} from "@repo/music-core/domain";
import { BOOM_BAP_KIT } from "@repo/music-core/engines/sequencer";
import {
  createMpcGrooveExercise,
  grooveDefinition,
  grooveTargets,
  normalizeMpcGrooveConfig,
  type GrooveFamily,
} from "./mpc-groove";
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

describe("authored multi-bar grooves", () => {
  const beats = (family: string, voice: string) =>
    grooveTargets(family as GrooveFamily)
      .filter((target) => target.voice === voice)
      .map((target) => target.beat);

  test("M2 carries every onset of the two-bar boom bap table", () => {
    const definition = grooveDefinition("boom-bap-2bar");
    expect(definition).toMatchObject({
      label: "Boom bap · 2 bars",
      bars: 2,
      sectionLabels: ["groove", "groove"],
    });
    // Bar 1 at beats 0-3.5, bar 2 at beats 4-7.5 (see curriculum M2).
    expect(beats("boom-bap-2bar", "kick")).toEqual([0, 2.5, 4, 6, 6.75]);
    expect(beats("boom-bap-2bar", "snare")).toEqual([1, 3, 5, 7]);
    expect(beats("boom-bap-2bar", "hats")).toEqual([
      0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5,
    ]);
    expect(beats("boom-bap-2bar", "openhat")).toEqual([3.5]);
    expect(definition.targets).toHaveLength(25);
    expect(
      definition.targets.filter((target) => target.accent === "accent").map((t) => t.beat),
    ).toEqual([1, 3, 5, 7]);
  });

  test("M3 repeats the groove bars, then a fill and the closing downbeat", () => {
    const definition = grooveDefinition("turnaround-fill");
    expect(definition).toMatchObject({
      bars: 4,
      sectionLabels: ["groove", "groove", "groove", "fill"],
    });
    // Bars 1-3 are M2 bar 1, M2 bar 2, M2 bar 1.
    const bar = (index: number) =>
      definition.targets
        .filter((target) => target.beat >= index * 4 && target.beat < index * 4 + 4)
        .map((target) => `${target.voice}@${(target.beat - index * 4).toFixed(2)}`);
    expect(bar(2)).toEqual(bar(0));
    expect(bar(3)).toEqual([
      "snare@0.00",
      "snare@0.25",
      "snare@0.50",
      "snare@0.75",
      "snare@1.00",
      "snare@1.25",
      "snare@1.50",
      "snare@1.75",
      "kick@2.00",
      "perc@2.00",
      "perc@2.50",
      "kick@3.00",
      "snare@3.00",
      "openhat@3.50",
    ]);
    expect(definition.targets.at(-1)).toEqual({ voice: "kick", beat: 16, accent: "normal" });
    expect(definition.targets).toHaveLength(52);
  });

  test("a two-bar prompt stays open for two bars and a four-bar one for its closing downbeat", () => {
    const twoBar = createMpcGrooveExercise({
      ...normalizeMpcGrooveConfig({ groove: "boom-bap-2bar", bpm: 120 }),
      responseStart: monotonicMs(1000),
    }).generate(context).payload;
    expect(twoBar).toMatchObject({ bars: 2, responseEnd: 1000 + 2 * 2000 });
    expect(twoBar.captureEndMs).toBe(twoBar.responseEnd);

    const fourBar = createMpcGrooveExercise({
      ...normalizeMpcGrooveConfig({ groove: "turnaround-fill", bpm: 120 }),
      responseStart: monotonicMs(1000),
    }).generate(context).payload;
    expect(fourBar.responseEnd).toBe(1000 + 4 * 2000);
    // The last target *is* the downbeat of bar 5, so capture runs one match window past it.
    expect(fourBar.captureEndMs).toBe(fourBar.responseEnd + 62.5);
  });

  test("scores the fill bar separately from the groove bars", () => {
    const exercise = createMpcGrooveExercise({
      ...normalizeMpcGrooveConfig({ groove: "turnaround-fill", bpm: 120 }),
      responseStart: monotonicMs(1000),
    });
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);
    for (const target of prompt.payload.targets) {
      const late = target.beat >= 12 && target.beat < 16 ? 45 : 0;
      run.accept(hit(prompt.payload.mapping[target.voice], 1000 + target.beat * 500 + late));
    }
    const answer = run.finish({ reason: "completed" }).answer!;
    expect(answer.omissions).toBe(0);
    expect(answer.sections).toEqual([
      { label: "groove", targets: 37, matched: 37, omissions: 0, extras: 0, meanTimingErrorMs: 0 },
      { label: "fill", targets: 15, matched: 15, omissions: 0, extras: 0, meanTimingErrorMs: 42 },
    ]);
  });

  test("a dropped fill sixteenth does not drag the rest of the bar late", () => {
    // 96 BPM: sixteenths are 156.25 ms apart, so a window as wide as the grid would
    // let each surviving snare be claimed by its neighbour's target.
    const exercise = createMpcGrooveExercise({
      ...normalizeMpcGrooveConfig({ groove: "turnaround-fill", bpm: 96 }),
      responseStart: monotonicMs(1000),
    });
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);
    const beatMs = 625;
    for (const target of prompt.payload.targets) {
      if (target.beat === 12) continue; // the first fill snare is dropped
      run.accept(hit(prompt.payload.mapping[target.voice], 1000 + target.beat * beatMs));
    }
    const answer = run.finish({ reason: "completed" }).answer!;
    expect(answer.sections).toEqual([
      { label: "groove", targets: 37, matched: 37, omissions: 0, extras: 0, meanTimingErrorMs: 0 },
      { label: "fill", targets: 15, matched: 14, omissions: 1, extras: 0, meanTimingErrorMs: 0 },
    ]);
    expect(answer.extras).toBe(0);
  });

  test("grades accents only when MIDI velocity varies", () => {
    for (const [source, accentVelocity, assessed] of [
      ["midi", 0.95, true],
      ["onscreen", 0.95, false],
    ] as const) {
      const exercise = createMpcGrooveExercise({
        ...normalizeMpcGrooveConfig({ groove: "boom-bap-2bar", bpm: 120 }),
        responseStart: monotonicMs(1000),
      });
      const prompt = exercise.generate(context);
      const run = exercise.createRun(prompt, context);
      for (const target of prompt.payload.targets) {
        run.accept(
          hit(
            prompt.payload.mapping[target.voice],
            1000 + target.beat * 500,
            target.accent === "accent" ? accentVelocity : 0.5,
            source,
          ),
        );
      }
      const result = run.finish({ reason: "completed" });
      expect(result.answer).toMatchObject({
        accentAssessed: assessed,
        accentTargets: 4,
        accentMatched: assessed ? 4 : 0,
        dynamicsMatched: assessed ? 25 : 0,
        dynamicsTargets: 25,
      });
      expect(result.score).toBe(1);
    }
  });

  test("misses an accent that is played at normal velocity", () => {
    const exercise = createMpcGrooveExercise({
      ...normalizeMpcGrooveConfig({ groove: "boom-bap-2bar", bpm: 120 }),
      responseStart: monotonicMs(1000),
    });
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);
    for (const target of prompt.payload.targets) {
      run.accept(
        hit(
          prompt.payload.mapping[target.voice],
          1000 + target.beat * 500,
          target.accent === "accent" && target.beat > 1 ? 0.5 : 0.95,
        ),
      );
    }
    const result = run.finish({ reason: "completed" });
    expect(result.answer).toMatchObject({ accentAssessed: true, accentMatched: 1 });
    expect(result.score).toBeCloseTo(0.85 + 0.15 * (1 / 25));
    expect(result.feedback[0]?.message).toContain("1 of 4 accents");
  });

  test("playing every note loud does not earn full dynamics credit", () => {
    const exercise = createMpcGrooveExercise({
      ...normalizeMpcGrooveConfig({ groove: "boom-bap-2bar", bpm: 120 }),
      responseStart: monotonicMs(1000),
    });
    const prompt = exercise.generate(context);
    const run = exercise.createRun(prompt, context);
    // Every note at accent velocity, hats a shade louder: velocity varies, contrast does not.
    for (const target of prompt.payload.targets) {
      run.accept(
        hit(
          prompt.payload.mapping[target.voice],
          1000 + target.beat * 500,
          target.voice === "hats" ? 0.94 : 0.95,
        ),
      );
    }
    const result = run.finish({ reason: "completed" });
    expect(result.answer).toMatchObject({
      accentAssessed: true,
      accentMatched: 4,
      dynamicsMatched: 4,
      dynamicsTargets: 25,
    });
    expect(result.score).toBeCloseTo(0.85 + 0.15 * (4 / 25));
  });

  test("keeps one canonical pad per drum voice across the kit and the grooves", () => {
    expect(Object.fromEntries(BOOM_BAP_KIT.map((pad) => [pad.id, pad.midi]))).toEqual(
      DRUM_VOICE_PADS,
    );
    expect(normalizeMpcGrooveConfig({}).mapping).toEqual(DRUM_VOICE_PADS);
    // Pads are validated against the kit's own notes, so the 808's canonical 35 survives.
    expect(normalizeMpcGrooveConfig(new URLSearchParams("kick=35&snare=52")).mapping).toMatchObject(
      { kick: 35, snare: DRUM_VOICE_PADS.snare },
    );
  });
});

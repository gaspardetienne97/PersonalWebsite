import { describe, expect, it, vi } from "vitest";

import { monotonicMs, type ExerciseContext, type NoteEvent } from "@repo/music-core/domain";
import {
  createVoicingDrillExercise,
  type VoicingTarget,
} from "@repo/music-core/exercises/voicing-drill";

import {
  buildVoicingDrillTargets,
  normalizeVoicingDrillConfig,
  VoicingDrillSession,
} from "./index";

describe("buildVoicingDrillTargets", () => {
  it("reserves voice-leading evidence for guide tones across every variant", () => {
    for (const variant of ["major", "minor", "altered", "guide-tones"] as const) {
      const expectedSkills =
        variant === "guide-tones"
          ? ["harmony.ii-v-i.voice-leading"]
          : ["harmony.ii-v-i", `harmony.ii-v-i.voicings.${variant}`];
      for (const target of buildVoicingDrillTargets("piano", { variant })) {
        expect(target.skillIds).toEqual(expectedSkills);
      }
    }
  });
  it("attributes only the practiced voicing variant", () => {
    for (const variant of ["major", "minor", "altered"] as const) {
      expect(
        buildVoicingDrillTargets("piano", { variant }).every((target) =>
          target.skillIds?.includes(`harmony.ii-v-i.voicings.${variant}`),
        ),
      ).toBe(true);
    }
  });
  it("produces 36 chord targets (12 keys × ii-V-I) for a polyphonic instrument", () => {
    const targets = buildVoicingDrillTargets("piano");
    expect(targets).toHaveLength(36);
    expect(targets.every((t) => t.mode === "chord")).toBe(true);

    // Dm7 rootless A = F A C E, with the root D in the bass (LH root + RH
    // rootless), so the full target is {2, 5, 9, 0, 4}.
    const first = targets[0]!;
    expect(first.symbol).toBe("Dm7");
    expect(new Set(first.expectedPitchClasses)).toEqual(new Set([2, 5, 9, 0, 4]));
    expect(first.expectedBassPc).toBe(2); // D in the bass
  });

  it("grades as an arpeggio on a monophonic instrument, in ascending pitch order", () => {
    const targets = buildVoicingDrillTargets("aerophone");
    expect(targets.every((t) => t.mode === "arpeggio")).toBe(true);
    // Dm7 rootless A with bass D: D F A C E → ascending pcs 2,5,9,0,4.
    expect(targets[0]!.expectedPitchClasses).toEqual([2, 5, 9, 0, 4]);
  });

  it("builds the minor variant: iiø7 → V7alt → i-m7 across 12 keys", () => {
    const targets = buildVoicingDrillTargets("piano", { variant: "minor" });
    expect(targets).toHaveLength(36);
    expect(targets.slice(0, 3).map((t) => t.symbol)).toEqual(["Dm7b5", "G7alt", "Cm7"]);
    // Dm7b5 rootless A = F Ab C E, bass D → {2, 5, 8, 0, 4}.
    expect(new Set(targets[0]!.expectedPitchClasses)).toEqual(new Set([2, 5, 8, 0, 4]));
  });

  it("builds the altered variant: V7b9, V7alt, and upper-structure V7 across 12 keys", () => {
    const targets = buildVoicingDrillTargets("piano", { variant: "altered" });
    expect(targets).toHaveLength(36);
    expect(targets.slice(0, 3).map((t) => t.symbol)).toEqual([
      "G7b9",
      "G7alt",
      "G7 · II maj upper",
    ]);
    expect(targets.every((target) => target.symbol.includes("7"))).toBe(true);
    expect(targets[2]!.displayMidi).toEqual([67, 71, 77, 81, 85, 88]);
    expect(new Set(targets[2]!.expectedPitchClasses)).toEqual(new Set([7, 11, 5, 9, 1, 4]));
  });
});

describe("normalizeVoicingDrillConfig", () => {
  it("normalizes shareable voicing drill config values", () => {
    const params = new URLSearchParams(
      "instrument=guitar&variant=altered&start=B&strict=held&advance=manual",
    );

    expect(normalizeVoicingDrillConfig(params)).toEqual({
      instrument: "guitar",
      variant: "altered",
      startPosition: "B",
      strict: true,
      autoAdvance: false,
    });

    expect(
      normalizeVoicingDrillConfig({
        instrument: "drums",
        variant: "unknown",
        start: "C",
        strict: "no",
        advance: "auto",
      }),
    ).toEqual({
      instrument: "piano",
      variant: "major",
      startPosition: "A",
      strict: false,
      autoAdvance: true,
    });
  });
});

describe("guide-tone session", () => {
  it("persists an authorized Check but never starts the next prompt after disposal during persistence", async () => {
    const { InputRouter } = await import("@repo/music-core/engines/input-router");
    const { SkillGraphStore, seedCoreSkills } = await import("@repo/music-core/engines/skills");
    const { AnalyticsEngine } = await import("@repo/music-core/engines/analytics");
    const { ProgressEngine } = await import("@repo/music-core/engines/progress");
    const { ExerciseRunHost } = await import("@repo/music-core/engines/exercise");
    const skills = new SkillGraphStore();
    await skills.seed(seedCoreSkills());
    const analytics = new AnalyticsEngine();
    const progress = new ProgressEngine();
    const router = new InputRouter();
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ingest = analytics.ingest.bind(analytics);
    const pendingIngest = vi.spyOn(analytics, "ingest").mockImplementation(async (event) => {
      await barrier;
      await ingest(event);
    });
    const hostStart = vi.spyOn(ExerciseRunHost.prototype, "start");
    try {
      const session = new VoicingDrillSession({
        router,
        services: { skills, analytics, progress },
        instrument: "piano",
        variant: "guide-tones",
      });
      session.start();
      [53, 59].forEach((note) => router.noteOn(note, "onscreen"));
      const submitted = session.submit();
      await vi.waitFor(() => expect(pendingIngest).toHaveBeenCalledOnce());
      session.dispose();
      release();
      expect((await submitted).correct).toBe(true);
      expect(analytics.getStats("harmony.ii-v-i.voice-leading")?.attempts).toBe(1);
      expect(hostStart).toHaveBeenCalledOnce();
      expect(session.state.index).toBe(0);
    } finally {
      hostStart.mockRestore();
      pendingIngest.mockRestore();
    }
  });
  it("builds two piano transitions with independent child skill and a transposed register", () => {
    const targets = buildVoicingDrillTargets("piano", { variant: "guide-tones" });
    expect(targets).toHaveLength(2);
    expect(targets[0]).toMatchObject({
      symbol: "G7",
      expectedPitchClasses: [11, 5],
      skillIds: ["harmony.ii-v-i.voice-leading"],
      voiceLeading: { fromMidi: [53, 60], register: [48, 71] },
    });
    expect(targets[1]).toMatchObject({
      symbol: "Cmaj7",
      expectedPitchClasses: [4, 11],
      voiceLeading: { fromMidi: [53, 59], register: [48, 71] },
    });
    expect(buildVoicingDrillTargets("piano", { variant: "guide-tones", key: 2 })[0]).toMatchObject({
      symbol: "A7",
      voiceLeading: { fromMidi: [55, 62], register: [50, 73] },
    });
    expect(() => buildVoicingDrillTargets("guitar", { variant: "guide-tones" })).toThrow(/piano/i);
    expect(
      normalizeVoicingDrillConfig(
        new URLSearchParams("variant=guide-tones&instrument=guitar&key=2&advance=auto"),
      ),
    ).toMatchObject({ variant: "guide-tones", instrument: "piano", key: 2, autoAdvance: false });
    expect(normalizeVoicingDrillConfig({ variant: "guide-tones", key: 99 }).key).toBe(0);
  });
  it("carries the actual accepted pair forward and records independent evidence only for voice leading", async () => {
    const { InputRouter } = await import("@repo/music-core/engines/input-router");
    const { SkillGraphStore, seedCoreSkills } = await import("@repo/music-core/engines/skills");
    const { AnalyticsEngine } = await import("@repo/music-core/engines/analytics");
    const { ProgressEngine } = await import("@repo/music-core/engines/progress");
    const skills = new SkillGraphStore();
    await skills.seed(seedCoreSkills());
    const router = new InputRouter();
    const session = new VoicingDrillSession({
      router,
      services: { skills, analytics: new AnalyticsEngine(), progress: new ProgressEngine() },
      instrument: "piano",
      variant: "guide-tones",
    });
    session.start();
    // An octave-spaced source supplies two equally economical solutions.
    session.state.current!.voiceLeading!.fromMidi = [53, 65];
    [59, 65].forEach((note) => router.noteOn(note, "onscreen"));
    const result = await session.submit();
    expect(result.correct).toBe(true);
    expect(result.event).toMatchObject({
      assistance: "independent",
      skillIds: ["harmony.ii-v-i.voice-leading"],
    });
    expect(session.state.current!.voiceLeading!.fromMidi).toEqual([59, 65]);
    expect(skills.getMastery("harmony.ii-v-i.voice-leading").observations).toBe(1);
    expect(skills.getMastery("harmony.ii-v-i.voicings.major").observations).toBe(0);
    session.dispose();
    const failed = new VoicingDrillSession({
      router,
      services: { skills, analytics: new AnalyticsEngine(), progress: new ProgressEngine() },
      instrument: "piano",
      variant: "guide-tones",
    });
    failed.start();
    router.noteOn(60, "onscreen");
    await failed.submit();
    expect(failed.state.current!.voiceLeading!.fromMidi).toEqual([53, 59]);
    failed.dispose();
  });
});

describe("closest chords (P2)", () => {
  const targets = buildVoicingDrillTargets("piano", { variant: "inversions" });

  it("authors the four tabled chords with their inversions and left-hand roots", () => {
    expect(targets.map((target) => target.symbol)).toEqual(["C", "F/C", "G/B", "C"]);
    expect(targets.map((target) => target.displayMidi)).toEqual([
      [48, 60, 64, 67],
      [41, 60, 65, 69],
      [43, 59, 62, 67],
      [48, 60, 64, 67],
    ]);
    expect(targets.map((target) => target.expectedBassPc)).toEqual([0, 0, 11, 0]);
    expect(targets.every((target) => target.strict && target.requireInversion)).toBe(true);
    // "LH plays roots": the root is graded, not just displayed.
    expect(targets.map((target) => target.requiredRootPc)).toEqual([0, 5, 7, 0]);
  });

  it("moves 12 semitones in total across the four bars", () => {
    const rightHand = targets.map((target) => target.displayMidi!.slice(1));
    const total = rightHand
      .slice(1)
      .reduce(
        (sum, voicing, index) =>
          sum +
          voicing.reduce((bar, midi, voice) => bar + Math.abs(midi - rightHand[index]![voice]!), 0),
        0,
      );
    expect(total).toBe(12);
    // Each move is carried by the target's own voice-leading spec.
    expect(targets.slice(1).map((target) => target.voiceLeading?.fromMidi)).toEqual([
      [60, 64, 67],
      [60, 65, 69],
      [59, 62, 67],
    ]);
    expect(targets.slice(1).every((target) => target.voiceLeading?.toleranceSemitones === 2)).toBe(
      true,
    );
  });

  it("transposes the variation to G major, keeping the same total movement", () => {
    const g = buildVoicingDrillTargets("piano", { variant: "inversions", key: 7 });
    expect(g.map((target) => target.symbol)).toEqual(["G", "C/G", "D/F#", "G"]);
    expect(g.map((target) => target.displayMidi)).toEqual([
      [43, 67, 71, 74],
      [48, 67, 72, 76],
      [50, 66, 69, 74],
      [43, 67, 71, 74],
    ]);
    // Same three moves, so the tabled 12-semitone total is invariant.
    const rightHand = g.map((target) => target.displayMidi!.slice(1));
    const total = rightHand
      .slice(1)
      .reduce(
        (sum, voicing, index) =>
          sum +
          voicing.reduce((bar, midi, voice) => bar + Math.abs(midi - rightHand[index]![voice]!), 0),
        0,
      );
    expect(total).toBe(12);
  });

  it("grades the tabled voicings correct and an octave-equivalent right hand wrong", () => {
    const hold = (target: VoicingTarget, notes: number[]) => {
      const exercise = createVoicingDrillExercise(target);
      const context: ExerciseContext = { targetSkillIds: [], difficulty: 0.5 };
      const run = exercise.createRun(exercise.generate(context), context);
      notes.forEach((midiNote) => {
        const event: NoteEvent = {
          type: "noteOn",
          midiNote,
          velocity: 1,
          source: "midi",
          timestamp: monotonicMs(0),
          clock: "performance",
        };
        run.accept(event);
      });
      return run.finish();
    };

    for (const target of targets) {
      expect(hold(target, target.displayMidi!).correct, target.symbol).toBe(true);
    }
    // Bar 2 respelled up an octave is root position, not F/C.
    expect(hold(targets[1]!, [41, 65, 69, 72]).correct).toBe(false);
  });
});

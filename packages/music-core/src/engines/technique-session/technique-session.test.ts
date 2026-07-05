import { describe, expect, test, vi } from "vitest";

import { monotonicMs, type ControlChangeEvent, type NoteOnEvent } from "@repo/music-core/domain";
import { AnalyticsEngine } from "@repo/music-core/engines/analytics";
import type { PipelineServices } from "@repo/music-core/engines/exercise";
import { InputRouter } from "@repo/music-core/engines/input-router";
import { ProgressEngine } from "@repo/music-core/engines/progress";
import { SkillGraphStore, seedCoreSkills } from "@repo/music-core/engines/skills";
import { curatedTunings } from "@repo/music-core/engines/tunings";
import { CHORD_SHAPES } from "@repo/music-core/exercises/chord-perfect";

import {
  AEROPHONE_DRILL_DEFAULT_CONFIG,
  MPC_RUDIMENT_DEFAULT_CONFIG,
  normalizeAerophoneDrillConfig,
  normalizeScaleDrillConfig,
  normalizeMpcRudimentConfig,
  normalizeSpiderDrillConfig,
  normalizeStringTechniqueConfig,
  normalizeTwoHandDrillConfig,
  SCALE_DRILL_DEFAULT_CONFIG,
  SPIDER_DRILL_DEFAULT_CONFIG,
  STRING_TECHNIQUE_DEFAULT_CONFIG,
  TechniqueSession,
  type TechniqueSessionState,
} from "./index";

describe("TechniqueSession", () => {
  test("normalizes shareable Aerophone drill config values", () => {
    expect(
      normalizeAerophoneDrillConfig(
        new URLSearchParams("mode=articulation&target=69&style=legato&bpm=110"),
      ),
    ).toEqual({
      mode: "articulation",
      targetMidi: 69,
      durationMs: 5000,
      style: "legato",
      bpm: 110,
      interval: "P5",
      direction: "up",
    });

    expect(
      normalizeAerophoneDrillConfig({
        mode: "swell",
        note: "57",
        duration: "7000",
      }),
    ).toEqual({
      mode: "swell",
      targetMidi: 58,
      durationMs: 6000,
      style: "staccato",
      bpm: 90,
      interval: "P5",
      direction: "up",
    });

    // Descending landings restore from the shareable direction flag.
    expect(
      normalizeAerophoneDrillConfig(
        new URLSearchParams("mode=interval-landing&target=60&interval=P4&direction=down"),
      ),
    ).toMatchObject({ mode: "interval-landing", interval: "P4", direction: "down" });

    expect(
      normalizeAerophoneDrillConfig({
        mode: "noise",
        targetMidi: "999",
        durationMs: "1000",
        style: "slurred",
        tempo: "72",
      }),
    ).toEqual({
      ...AEROPHONE_DRILL_DEFAULT_CONFIG,
      targetMidi: 78,
      durationMs: 3000,
      bpm: 70,
    });
  });

  test("normalizes shareable scale drill config values", () => {
    expect(
      normalizeScaleDrillConfig({
        scale: "bebop-major",
        tonic: "Eb4",
        instrument: "guitar",
        bpm: "90",
        motion: "up-down",
        span: "two-octave",
      }),
    ).toEqual({
      scale: "bebop-major",
      tonic: "Eb4",
      instrument: "guitar",
      bpm: 90,
      motion: "up-down",
      span: "two-octave",
    });

    expect(
      normalizeScaleDrillConfig({
        scale: "noise",
        key: "Bb",
        instrument: "kazoo",
        bpm: "999",
        motion: "sideways",
        span: "forever",
      }),
    ).toEqual({
      ...SCALE_DRILL_DEFAULT_CONFIG,
      tonic: "Bb4",
      bpm: 180,
    });

    expect(normalizeScaleDrillConfig(new URLSearchParams("scale=dorian&tonic=F4&bpm=10"))).toEqual({
      ...SCALE_DRILL_DEFAULT_CONFIG,
      scale: "dorian",
      tonic: "F4",
      bpm: 60,
    });

    expect(
      normalizeScaleDrillConfig(
        new URLSearchParams("scale=blues&tonic=G4&motion=down&span=pentascale"),
      ),
    ).toEqual({
      ...SCALE_DRILL_DEFAULT_CONFIG,
      scale: "blues",
      tonic: "G4",
      motion: "down",
      span: "pentascale",
    });
  });

  test("normalizes shareable MPC rudiment config values", () => {
    expect(
      normalizeMpcRudimentConfig({
        left: "40",
        right: "41",
        hits: "16",
        bpm: "120",
        pattern: "paradiddle",
      }),
    ).toEqual({
      patternId: "paradiddle",
      leftPadMidi: 40,
      rightPadMidi: 41,
      hitCount: 16,
      bpm: 120,
    });

    expect(
      normalizeMpcRudimentConfig({
        left: "12",
        right: "127",
        hits: "99",
        bpm: "10",
      }),
    ).toEqual({
      ...MPC_RUDIMENT_DEFAULT_CONFIG,
      bpm: 60,
    });

    expect(
      normalizeMpcRudimentConfig({
        left: "40",
        right: "40",
        hitCount: "16",
        bpm: "95",
      }),
    ).toEqual({
      patternId: "single-strokes",
      leftPadMidi: 40,
      rightPadMidi: 38,
      hitCount: 16,
      bpm: 100,
    });
  });

  test("normalizes shareable spider drill config values", () => {
    expect(
      normalizeSpiderDrillConfig({
        instrument: "ukulele",
        tuning: "ukulele.low-g",
        string: "4",
        fret: "7",
        bpm: "120",
        pattern: "inside-out-1324",
        span: "adjacent-3",
      }),
    ).toEqual({
      instrument: "ukulele",
      tuningId: "ukulele.low-g",
      stringNumber: 4,
      startFret: 7,
      bpm: 120,
      pattern: "inside-out-1324",
      stringSpan: "adjacent-3",
      crossing: false,
    });

    // String-crossing order restores from the shareable crossing flag.
    expect(
      normalizeSpiderDrillConfig(new URLSearchParams("span=adjacent-2&crossing=1")).crossing,
    ).toBe(true);

    expect(
      normalizeSpiderDrillConfig({
        instrument: "banjo",
        tuning: "ukulele.low-g",
        string: "99",
        fret: "99",
        bpm: "10",
        pattern: "not-a-pattern",
        span: "not-a-span",
      }),
    ).toEqual({
      ...SPIDER_DRILL_DEFAULT_CONFIG,
      stringNumber: 6,
      startFret: 9,
      bpm: 60,
      pattern: "ascending-1234",
      stringSpan: "single",
    });

    expect(
      normalizeSpiderDrillConfig({
        instrument: "ukulele",
        tuning: "guitar.drop-d",
        string: "0",
        fret: "-3",
        bpm: "95",
      }),
    ).toEqual({
      instrument: "ukulele",
      tuningId: "ukulele.high-g",
      stringNumber: 1,
      startFret: 0,
      bpm: 100,
      pattern: "ascending-1234",
      stringSpan: "single",
      crossing: false,
    });
  });

  test("normalizes shareable string-technique drill mode values", () => {
    expect(normalizeStringTechniqueConfig(new URLSearchParams("mode=note-finder"))).toEqual({
      ...STRING_TECHNIQUE_DEFAULT_CONFIG,
      mode: "note-finder",
    });

    expect(normalizeStringTechniqueConfig({ mode: "noise" })).toEqual(
      STRING_TECHNIQUE_DEFAULT_CONFIG,
    );
  });

  test("normalizes shareable two-hand drill config values", () => {
    expect(
      normalizeTwoHandDrillConfig(
        new URLSearchParams("tonic=G4&bpm=120&pattern=alberti-rh-holds&hand=left"),
      ),
    ).toEqual({
      tonic: "G4",
      bpm: 120,
      patternKind: "alberti-rh-holds",
      handMode: "left",
    });

    expect(normalizeTwoHandDrillConfig({ key: "D", tempo: "10", handMode: "right" })).toEqual({
      tonic: "D4",
      bpm: 60,
      patternKind: "lh-pulse-rh-line",
      handMode: "right",
    });

    expect(
      normalizeTwoHandDrillConfig({
        tonic: "Bb3",
        bpm: "999",
        pattern: "noise",
        hand: "feet",
      }),
    ).toEqual({
      tonic: "C4",
      bpm: 120,
      patternKind: "lh-pulse-rh-line",
      handMode: "both",
    });
  });

  test("completes an Aerophone long tone through the shared pipeline", async () => {
    const dependencies = await setup();
    const session = new TechniqueSession(dependencies);

    await session.startLongTone({ targetMidi: 67, holdMs: 3_000 });
    dependencies.router.push(aerophoneNote(67, 0));
    dependencies.router.push(breath(0.7, 0));
    dependencies.router.push(breath(0.72, 1_000));
    dependencies.router.push(breath(0.69, 2_000));
    dependencies.router.push(breath(0.71, 3_000));

    await vi.waitFor(() => expect(session.state.status).toBe("summary"));
    expect(session.state.summary).toMatchObject({
      total: 1,
      correct: 1,
      breathSteadiness: expect.any(Number),
      velocityConsistency: 0,
    });
    expect(session.state.summary?.breathSteadiness).toBeGreaterThan(0.9);
    expect(session.state.results[0]?.event.skillIds).toContain(
      "technique.aerophone.breath-steadiness",
    );
    expect(dependencies.services.progress.state.xp).toBeGreaterThan(0);
    session.dispose();
  });

  test("abandons an Aerophone long tone and allows a clean restart", async () => {
    const dependencies = await setup();
    const session = new TechniqueSession(dependencies);

    await session.startLongTone({ targetMidi: 67, holdMs: 3_000 });
    session.abandon();

    expect(session.state.status).toBe("abandoned");
    await expect(session.startLongTone({ targetMidi: 69, holdMs: 5_000 })).resolves.toMatchObject({
      targetMidi: 69,
      holdMs: 5_000,
    });
    expect(session.state.status).toBe("active");
    session.dispose();
  });

  test("completes an Aerophone dynamic swell through the shared pipeline", async () => {
    const dependencies = await setup();
    const session = new TechniqueSession(dependencies);

    await session.startSwell({ targetMidi: 67, durationMs: 4_000 });
    dependencies.router.push(aerophoneNote(67, 0));
    dependencies.router.push(breath(0.2, 0));
    dependencies.router.push(breath(0.55, 1_000));
    dependencies.router.push(breath(0.9, 2_000));
    dependencies.router.push(breath(0.55, 3_000));
    dependencies.router.push(breath(0.2, 4_000));

    await vi.waitFor(() => expect(session.state.status).toBe("summary"));
    expect(session.state.summary).toMatchObject({
      total: 1,
      correct: 1,
      noteAccuracy: 1,
    });
    expect(session.state.results[0]?.result.score).toBeGreaterThan(0.9);
    expect(session.state.results[0]?.event.skillIds).toContain(
      "technique.aerophone.dynamic-control",
    );
    session.dispose();
  });

  test("completes an Aerophone interval landing over a drone target", async () => {
    const dependencies = await setup();
    const session = new TechniqueSession(dependencies);

    await session.startIntervalLanding({
      droneMidi: 60,
      interval: "P5",
      holdMs: 2_000,
    });
    dependencies.router.push(aerophoneNote(67, 0));
    dependencies.router.push(breath(0.7, 0));
    dependencies.router.push(breath(0.72, 1_000));
    dependencies.router.push(breath(0.71, 2_000));

    await vi.waitFor(() => expect(session.state.status).toBe("summary"));
    expect(session.state.summary).toMatchObject({
      total: 1,
      correct: 1,
      noteAccuracy: 1,
    });
    expect(session.state.results[0]?.prompt).toMatchObject({
      droneMidi: 60,
      targetMidi: 67,
      interval: { id: "P5", label: "Perfect fifth" },
    });
    expect(session.state.results[0]?.event.skillIds).toContain(
      "technique.aerophone.interval-landing",
    );
    session.dispose();
  });

  test("completes a clean C major scale and unlocks the next tempo", async () => {
    const dependencies = await setup();
    const session = new TechniqueSession(dependencies);
    let latest: TechniqueSessionState = session.state;
    const unsubscribe = session.subscribe((state) => {
      latest = state;
    });

    await session.startScale({ tonic: "C4", scale: "major", bpm: 100 });
    [60, 62, 64, 65, 67, 69, 71, 72].forEach((midiNote, index) => {
      dependencies.router.push(note(midiNote, index * 600));
    });

    await vi.waitFor(() => expect(latest.status).toBe("summary"));
    expect(latest.summary).toMatchObject({
      total: 1,
      correct: 1,
      noteAccuracy: 1,
      highestUnlockedBpm: 110,
      nextTargetBpm: 110,
    });
    expect(latest.summary?.meanEvennessErrorMs).toBe(0);
    expect(latest.results[0]?.event.skillIds).toContain("technique.scale.major");
    expect(dependencies.services.progress.state.xp).toBeGreaterThan(0);

    unsubscribe();
    session.dispose();
  });

  test("completes an eight-hit MPC rudiment without changing the scale tempo", async () => {
    const dependencies = await setup();
    const session = new TechniqueSession(dependencies);

    const prompt = await session.startMpcRudiment({
      leftPadMidi: 36,
      rightPadMidi: 38,
      hitCount: 8,
      bpm: 100,
      patternId: "double-strokes",
    });
    expect(prompt.targetSpacingMs).toBe(300);
    expect(prompt.targetSequence).toEqual([36, 36, 38, 38, 36, 36, 38, 38]);
    Object.assign(prompt, {
      noteLabels: ["C4"],
      midiNotes: [60],
    });
    prompt.targetSequence.forEach((midiNote, index) => {
      dependencies.router.push(mpcNote(midiNote, index * prompt.targetSpacingMs, 0.8));
    });

    await vi.waitFor(() => expect(session.state.status).toBe("summary"));
    expect(session.state.summary).toMatchObject({
      total: 1,
      correct: 1,
      noteAccuracy: 1,
      meanEvennessErrorMs: 0,
      velocityConsistency: 1,
      highestUnlockedBpm: 100,
      nextTargetBpm: 100,
    });
    expect(session.state.results[0]?.event).toMatchObject({
      runId: "technique-test-mpc-double-strokes-36-38-8-100",
      skillIds: expect.arrayContaining(["technique.mpc", "technique.mpc.single-strokes"]),
    });
    expect(
      dependencies.services.skills.getMastery("technique.mpc.single-strokes").observations,
    ).toBeGreaterThan(0);
    expect(dependencies.services.skills.getMastery("technique.mpc").observations).toBeGreaterThan(
      0,
    );
    expect(dependencies.services.progress.state.xp).toBeGreaterThan(0);
    session.dispose();
  });

  test("completes a moving-accent MPC rudiment through the shared pipeline", async () => {
    const dependencies = await setup();
    const session = new TechniqueSession(dependencies);

    const prompt = await session.startMpcRudiment({
      leftPadMidi: 36,
      rightPadMidi: 38,
      hitCount: 8,
      bpm: 100,
      patternId: "moving-accent",
    });
    expect(prompt.patternId).toBe("moving-accent");
    expect(prompt.targetEvents.map((event) => event.accent)).toEqual([
      "accent",
      "normal",
      "normal",
      "normal",
      "normal",
      "accent",
      "normal",
      "normal",
    ]);

    prompt.targetEvents.forEach((event, index) => {
      dependencies.router.push(
        mpcNote(
          event.padMidi,
          index * prompt.targetSpacingMs,
          event.accent === "accent" ? 0.9 : 0.45,
        ),
      );
    });

    await vi.waitFor(() => expect(session.state.status).toBe("summary"));
    expect(session.state.summary).toMatchObject({ total: 1, correct: 1 });
    expect(session.state.results[0]?.event.runId).toBe(
      "technique-test-mpc-moving-accent-36-38-8-100",
    );
    session.dispose();
  });

  test("completes a guitar spider through the shared pipeline", async () => {
    const dependencies = await setup();
    const session = new TechniqueSession(dependencies);

    const prompt = await session.startSpider({
      tuning: curatedTunings("guitar")[0]!,
      stringNumber: 6,
      startFret: 0,
      bpm: 120,
    });
    prompt.midiNotes.forEach((midiNote, index) => {
      dependencies.router.push({
        ...note(midiNote, index * prompt.targetSpacingMs),
        instrument: "guitar",
      });
    });

    await vi.waitFor(() => expect(session.state.status).toBe("summary"));
    expect(session.state.summary).toMatchObject({
      total: 1,
      correct: 1,
      noteAccuracy: 1,
      meanEvennessErrorMs: 0,
    });
    expect(session.state.results[0]?.event.skillIds).toEqual(
      expect.arrayContaining(["technique.strings.spider", "technique.guitar.spider"]),
    );
    expect(
      dependencies.services.skills.getMastery("technique.guitar.spider").observations,
    ).toBeGreaterThan(0);
    session.dispose();
  });

  test("completes a multi-string guitar spider through the shared pipeline", async () => {
    const dependencies = await setup();
    const session = new TechniqueSession(dependencies);

    const prompt = await session.startSpider({
      tuning: curatedTunings("guitar")[0]!,
      stringNumber: 6,
      startFret: 5,
      bpm: 120,
      stringSpan: "adjacent-2",
    });
    expect(prompt.stringNumbers).toEqual([6, 5]);

    prompt.midiNotes.forEach((midiNote, index) => {
      dependencies.router.push({
        ...note(midiNote, index * prompt.targetSpacingMs),
        instrument: "guitar",
      });
    });

    await vi.waitFor(() => expect(session.state.status).toBe("summary"));
    expect(session.state.summary).toMatchObject({
      total: 1,
      correct: 1,
      noteAccuracy: 1,
    });
    expect(session.state.results[0]?.result.feedback[0]?.message).toContain("8/8");
    session.dispose();
  });

  test("completes a fretboard note finder prompt through the shared pipeline", async () => {
    const dependencies = await setup();
    const session = new TechniqueSession(dependencies);

    const prompt = await session.startFretboardNoteFinder({
      tuning: curatedTunings("guitar")[0]!,
      stringNumber: 6,
      fretNumber: 5,
    });
    dependencies.router.push({
      ...note(prompt.targetMidi, 0),
      instrument: "guitar",
    });

    await vi.waitFor(() => expect(session.state.status).toBe("summary"));
    expect(session.state.summary).toMatchObject({
      total: 1,
      correct: 1,
      noteAccuracy: 1,
    });
    expect(session.state.results[0]?.event.skillIds).toEqual(
      expect.arrayContaining(["technique.strings.note-finder", "technique.guitar.note-finder"]),
    );
    session.dispose();
  });

  test("completes guitar chord changes through the shared pipeline", async () => {
    const dependencies = await setup();
    const session = new TechniqueSession(dependencies);
    const tuning = curatedTunings("guitar")[0]!;
    const fromShape = CHORD_SHAPES.find((shape) => shape.id === "guitar.c-major")!;
    const toShape = CHORD_SHAPES.find((shape) => shape.id === "guitar.g-major")!;

    const prompt = await session.startChordChange({
      tuning,
      fromShape,
      toShape,
      repetitions: 1,
    });
    prompt.targets.forEach((target, targetIndex) => {
      target.midiNotes.forEach((midiNote, noteIndex) => {
        dependencies.router.push({
          ...note(midiNote, targetIndex * 1_000 + noteIndex * 40),
          instrument: "guitar",
        });
      });
    });

    await vi.waitFor(() => expect(session.state.status).toBe("summary"));
    expect(session.state.summary).toMatchObject({
      total: 1,
      correct: 1,
      noteAccuracy: 1,
    });
    expect(session.state.results[0]?.event.skillIds).toEqual(
      expect.arrayContaining(["technique.strings.chord-changes", "technique.guitar.chord-changes"]),
    );
    expect(
      dependencies.services.skills.getMastery("technique.guitar.chord-changes").observations,
    ).toBeGreaterThan(0);
    session.dispose();
  });

  test("abandons an MPC rudiment and restarts with a different pad configuration", async () => {
    const dependencies = await setup();
    const session = new TechniqueSession(dependencies);

    await session.startMpcRudiment({
      leftPadMidi: 36,
      rightPadMidi: 38,
      hitCount: 8,
      bpm: 80,
    });
    session.abandon();

    expect(session.state.status).toBe("abandoned");
    await expect(
      session.startMpcRudiment({
        leftPadMidi: 40,
        rightPadMidi: 41,
        hitCount: 16,
        bpm: 100,
        patternId: "paradiddle",
      }),
    ).resolves.toMatchObject({
      patternId: "paradiddle",
      leftPadMidi: 40,
      rightPadMidi: 41,
      hitCount: 16,
      bpm: 100,
      targetSequence: [40, 41, 40, 40, 41, 40, 41, 41, 40, 41, 40, 40, 41, 40, 41, 41],
    });
    expect(session.state).toMatchObject({
      status: "active",
      highestUnlockedBpm: 100,
      nextTargetBpm: 100,
      results: [],
    });
    session.dispose();
  });

  test("keeps the current tempo locked after an inaccurate scale", async () => {
    const dependencies = await setup();
    const session = new TechniqueSession(dependencies);

    await session.startScale({ tonic: "C4", scale: "major", bpm: 100 });
    [60, 62, 64, 66, 67, 69, 71, 72].forEach((midiNote, index) => {
      dependencies.router.push(note(midiNote, index * 600));
    });

    await vi.waitFor(() => expect(session.state.status).toBe("summary"));
    expect(session.state.summary).toMatchObject({
      correct: 0,
      highestUnlockedBpm: 100,
      nextTargetBpm: 100,
    });
    expect(session.state.results[0]?.result.feedback[0]?.message).toContain("notes 7/8");
    session.dispose();
  });

  test("keeps the active run available when persistence fails", async () => {
    const dependencies = await setup();
    vi.spyOn(dependencies.services.analytics, "ingest").mockRejectedValueOnce(
      new Error("Persistence unavailable"),
    );
    const session = new TechniqueSession(dependencies);

    await session.startScale({ tonic: "C4", scale: "major", bpm: 100 });
    [60, 62, 64, 65, 67, 69, 71, 72].forEach((midiNote, index) => {
      dependencies.router.push(note(midiNote, index * 600));
    });

    await vi.waitFor(() => expect(session.state.error).toBe("Persistence unavailable"));
    expect(session.state.status).toBe("active");
    expect(session.state.currentPrompt?.label).toBe("C major · one octave · ascending");

    await session.retrySave();
    expect(session.state.status).toBe("summary");
    session.dispose();
  });
});

async function setup() {
  const router = new InputRouter({ now: () => 0 });
  const skills = new SkillGraphStore();
  await skills.seed(seedCoreSkills());
  const services: PipelineServices = {
    skills,
    analytics: new AnalyticsEngine(),
    progress: new ProgressEngine(),
  };
  let id = 0;
  return {
    router,
    services,
    sessionId: "technique-test",
    now: () => 1_700_000_000_000,
    makeId: () => `technique-event-${++id}`,
  };
}

function note(midiNote: number, atMs: number): NoteOnEvent {
  return {
    type: "noteOn",
    midiNote,
    velocity: 1,
    source: "midi",
    timestamp: monotonicMs(atMs),
    clock: "midi",
  };
}

function aerophoneNote(midiNote: number, atMs: number): NoteOnEvent {
  return {
    ...note(midiNote, atMs),
    instrument: "aerophone",
    channel: 1,
  };
}

function mpcNote(midiNote: number, atMs: number, velocity: number): NoteOnEvent {
  return {
    ...note(midiNote, atMs),
    velocity,
    instrument: "mpc",
    channel: 10,
  };
}

function breath(value: number, atMs: number): ControlChangeEvent {
  return {
    type: "cc",
    controller: 2,
    value,
    instrument: "aerophone",
    channel: 1,
    source: "midi",
    timestamp: monotonicMs(atMs),
    clock: "midi",
  };
}

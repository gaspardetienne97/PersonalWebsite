/// <reference types="vite/client" />

import { afterEach, describe, expect, test } from "vitest";

import {
  Capability,
  SkillRelationKind,
  resultToScoringEvent,
  unixMs,
} from "@repo/music-core/domain";
import { PracticeDatabase, PracticeStore } from "@repo/music-core/engines/store";

import { SkillGraphStore, seedCoreSkills } from "./index";

const databases: PracticeDatabase[] = [];

afterEach(async () => {
  await Promise.all(databases.map((database) => database.delete()));
  databases.length = 0;
});

function createStore(): PracticeStore {
  const database = new PracticeDatabase(`skill-graph-${crypto.randomUUID()}`);
  databases.push(database);
  return new PracticeStore(database);
}

function correctIntervalEvent() {
  return resultToScoringEvent({
    result: {
      correct: true,
      score: 1,
      metrics: [{ kind: "choice", expected: "m6", actual: "m6" }],
      feedback: [],
      input: [],
    },
    sessionId: "session-1",
    runId: "run-1",
    exercise: {
      id: "ear.interval",
      skillIds: ["pitch.interval.m6"],
      capabilities: [Capability.Pitch],
    },
    prompt: { id: "prompt-1" },
    at: unixMs(1_700_000_000_000),
    difficulty: 0.6,
    modality: "heard",
    makeId: () => "event-1",
  });
}

describe("music-core/skills", () => {
  test("seeding is idempotent and ingest moves mastery through the domain pipeline", async () => {
    const graph = new SkillGraphStore();
    await graph.seed(seedCoreSkills());
    await graph.seed(seedCoreSkills());
    expect(graph.skills.length).toBe(seedCoreSkills().skills.length);

    await graph.ingest(correctIntervalEvent());
    expect(graph.getMastery("pitch.interval.m6").mastery).toBeGreaterThan(0);
  });

  test("persists seeded graph and ingested mastery through the practice store", async () => {
    const store = createStore();
    const graph = new SkillGraphStore(store);

    await graph.seed(seedCoreSkills());
    await graph.ingest(correctIntervalEvent());

    const reloaded = new SkillGraphStore(store);
    await reloaded.load();

    expect(reloaded.skills).toEqual(expect.arrayContaining(graph.skills));
    expect(reloaded.relationships).toEqual(expect.arrayContaining(graph.relationships));
    expect(reloaded.getMastery("pitch.interval.m6")).toEqual(graph.getMastery("pitch.interval.m6"));
    expect(reloaded.getMastery("pitch.interval.m6").mastery).toBeGreaterThan(0);
  });

  test("ingests the same scoring event only once across reloads", async () => {
    const store = createStore();
    const graph = new SkillGraphStore(store);
    await graph.seed(seedCoreSkills());
    const event = correctIntervalEvent();

    await graph.ingest(event);
    await graph.ingest(event);
    expect(graph.getMastery("pitch.interval.m6").observations).toBe(1);

    const reloaded = new SkillGraphStore(store);
    await reloaded.ingest(event);
    expect(reloaded.getMastery("pitch.interval.m6").observations).toBe(1);
  });

  test("serializes first-load seed and ingest operations", async () => {
    const store = createStore();
    const graph = new SkillGraphStore(store);

    await Promise.all([graph.seed(seedCoreSkills()), graph.ingest(correctIntervalEvent())]);

    expect(graph.skills).toHaveLength(seedCoreSkills().skills.length);
    expect(graph.getMastery("pitch.interval.m6").mastery).toBeGreaterThan(0);

    const reloaded = new SkillGraphStore(store);
    await reloaded.load();
    expect(reloaded.skills).toHaveLength(seedCoreSkills().skills.length);
    expect(reloaded.getMastery("pitch.interval.m6").mastery).toBeGreaterThan(0);
  });

  test("seeds all planned core skill families with prerequisite and component links", () => {
    const seed = seedCoreSkills();
    const ids = new Set(seed.skills.map((skill) => skill.id));

    expect([...ids]).toEqual(
      expect.arrayContaining([
        "pitch.interval.m2",
        "pitch.interval.P8",
        "pitch.scale-degrees",
        "pitch.scale-degree.b2",
        "pitch.scale-degree.b6",
        "pitch.scale-degree.#4",
        "pitch.scale-degree.7",
        "harmony.triad.augmented",
        "harmony.seventh.major",
        "ear.cadences.authentic",
        "ear.cadences.deceptive",
        "harmony.ii-v-i",
        "rhythm.subdivision.eighths",
        "rhythm.subdivision.sixteenths",
        "rhythm.gap-click",
        "rhythm.triplets",
        "rhythm.sixteenths",
        "reading.treble.landmarks",
        "reading.treble.stepwise",
        "reading.bass.landmarks",
        "reading.bass.stepwise",
        "reading.polyphonic",
        "reading.rhythm.compound",
        "technique.scale.major",
        "technique.scale.natural-minor",
        "technique.aerophone.breath-steadiness",
        "technique.aerophone.dynamic-control",
        "technique.aerophone.articulation",
        "technique.aerophone.interval-landing",
        "intonation.interval-landing",
        "technique.strings",
        "technique.strings.spider",
        "technique.strings.spider.permutations",
        "technique.strings.note-finder",
        "technique.guitar.spider",
        "technique.guitar.note-finder",
        "technique.ukulele.spider",
        "technique.ukulele.note-finder",
        "technique.strings.chord-perfect",
        "technique.guitar.chord-perfect",
        "technique.ukulele.chord-perfect",
        "technique.strings.chord-changes",
        "technique.guitar.chord-changes",
        "technique.ukulele.chord-changes",
        "technique.strings.open-chord-id",
        "technique.guitar.open-chord-id",
        "technique.ukulele.open-chord-id",
        "technique.piano",
        "technique.piano.two-hand-independence",
        "technique.piano.independence.shell-line",
        "technique.mpc",
        "technique.mpc.single-strokes",
        "technique.mpc.paradiddles",
      ]),
    );
    expect(seed.skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "technique.mpc",
          name: "MPC Technique",
          capability: Capability.Technique,
          level: "beginner",
          tags: ["mpc", "pads", "finger-drumming"],
        }),
        expect.objectContaining({
          id: "technique.mpc.single-strokes",
          name: "MPC Alternating Single Strokes",
          capability: Capability.Technique,
          level: "beginner",
          tags: ["mpc", "pads", "rudiment", "single-strokes"],
        }),
        expect.objectContaining({
          id: "technique.mpc.paradiddles",
          name: "MPC Paradiddles",
          capability: Capability.Technique,
          level: "beginner",
          tags: ["mpc", "pads", "rudiment", "paradiddle"],
        }),
      ]),
    );
    expect(seed.relationships).toContainEqual({
      from: "technique.strings.spider",
      to: "technique.strings.spider.permutations",
      kind: SkillRelationKind.Component,
    });
    expect(seed.relationships).toContainEqual({
      from: "rhythm.subdivisions",
      to: "rhythm.subdivision.eighths",
      kind: SkillRelationKind.Component,
    });
    expect(seed.relationships).toContainEqual({
      from: "rhythm.subdivisions",
      to: "rhythm.gap-click",
      kind: SkillRelationKind.Component,
    });
    expect(seed.relationships).toContainEqual({
      from: "technique.mpc",
      to: "technique.mpc.single-strokes",
      kind: SkillRelationKind.Component,
    });
    expect(seed.relationships).toContainEqual({
      from: "technique.mpc",
      to: "technique.mpc.paradiddles",
      kind: SkillRelationKind.Component,
    });
    expect(seed.relationships).toContainEqual({
      from: "technique.piano.two-hand-independence",
      to: "technique.piano.independence.shell-line",
      kind: SkillRelationKind.Component,
    });
    expect(seed.relationships).toContainEqual({
      from: "ear.cadences",
      to: "ear.cadences.authentic",
      kind: SkillRelationKind.Component,
    });
    expect(seed.relationships).toContainEqual({
      from: "technique.strings.note-finder",
      to: "technique.guitar.note-finder",
      kind: SkillRelationKind.Component,
    });
    expect(seed.relationships).toContainEqual({
      from: "technique.strings.chord-changes",
      to: "technique.guitar.chord-changes",
      kind: SkillRelationKind.Component,
    });
    expect(
      seed.relationships.some((relation) => relation.kind === SkillRelationKind.Component),
    ).toBe(true);
    expect(
      seed.relationships.some((relation) => relation.kind === SkillRelationKind.Prerequisite),
    ).toBe(true);
  });

  test("keeps the canonical mastery mutator inside the skills engine", () => {
    const engineSources = import.meta.glob("../*/index.ts", {
      eager: true,
      import: "default",
      query: "?raw",
    }) as Record<string, string>;

    const unauthorized = Object.entries(engineSources)
      .filter(([path]) => path !== "./index.ts" && !path.endsWith("/skills/index.ts"))
      .filter(([, source]) => source.includes("applyScoringEventToSkillState"))
      .map(([path]) => path);

    expect(unauthorized).toEqual([]);
  });
});

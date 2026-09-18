import { describe, expect, it } from "vitest";
import { unixMs, type ScoringEvent } from "@repo/music-core/domain";

import { buildLearningPath, type LearningPathStepDefinition } from "./index";

const STEPS: LearningPathStepDefinition[] = [
  { id: "c", order: 3, title: "C", summary: "third", kind: "review", skillIds: ["x", "y"] },
  { id: "a", order: 1, title: "A", summary: "first", skillIds: ["done"] },
  {
    id: "b",
    order: 2,
    title: "B",
    summary: "second",
    kind: "reference",
    applies: "polyphonic",
    links: [{ label: "L", href: "/l" }],
  },
];

const event = (skill: string, overrides: Partial<ScoringEvent> = {}): ScoringEvent => ({
  id: skill,
  sessionId: "s1",
  exerciseId: "ear.scale-degree-recognition",
  skillIds: [skill],
  capabilities: [],
  at: unixMs(1),
  correct: true,
  partialCredit: 1,
  difficulty: 0.5,
  metrics: [],
  modality: "heard",
  assistance: "independent",
  ...overrides,
});

describe("buildLearningPath", () => {
  it("requires independent evidence for every skill and ignores historical aggregate mastery", () => {
    const path = buildLearningPath(STEPS, {
      mastery: () => 1,
      events: [event("done"), event("x")],
    });
    expect(path.steps.map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(path.done).toBe(1);
    expect(path.total).toBe(2);
    expect(path.next?.id).toBe("c");
    expect(path.steps[2]?.status).toBe("in-progress");
    expect(buildLearningPath(STEPS, { mastery: () => 1 }).steps[0]?.status).toBe("not-assessed");
    expect(
      buildLearningPath(STEPS, { events: [event("done", { assistance: "guided" })] }).done,
    ).toBe(0);
  });

  it("requires matching modality, exercise, session and attempt counts", () => {
    const steps: LearningPathStepDefinition[] = [
      {
        ...STEPS[1]!,
        modalities: ["played", "sung"],
        exerciseIds: ["ear.scale-degree-recognition"],
        minSessions: 2,
        minAttempts: 2,
      },
    ];
    const valid = event("done", { modality: "played" });
    expect(buildLearningPath(steps, { events: [valid, { ...valid, id: "2" }] }).done).toBe(0);
    for (const invalid of [
      { modality: "heard" },
      { exerciseId: "ear.melody-dictation" },
      { assistance: undefined },
    ]) {
      expect(
        buildLearningPath(steps, {
          events: [
            valid,
            event("done", { ...invalid, id: "2", sessionId: "s2" } as Partial<ScoringEvent>),
          ],
        }).done,
      ).toBe(0);
    }
    expect(
      buildLearningPath(steps, {
        events: [valid, event("done", { id: "2", sessionId: "s2", modality: "sung" })],
      }).done,
    ).toBe(1);
    expect(buildLearningPath(steps, { events: [valid, valid] }).done).toBe(0);
  });

  it("excludes unmeasured steps and annotates monophonic instruments", () => {
    const path = buildLearningPath(STEPS, { instrument: "aerophone" });
    expect(path.total).toBe(2);
    expect(path.steps[1]?.instrumentNote).toMatch(/arpeggio/i);
  });

  it("accepts song-specific repertoire exercises within the requested family", () => {
    const steps = [{ ...STEPS[1]!, exerciseIds: ["ear.repertoire-transfer"] }];
    expect(
      buildLearningPath(steps, {
        events: [event("done", { exerciseId: "ear.repertoire-transfer.song-1.phrase-1" })],
      }).done,
    ).toBe(1);
    expect(
      buildLearningPath(steps, {
        events: [event("done", { exerciseId: "ear.repertoire-transfer-other" })],
      }).done,
    ).toBe(0);
  });

  it("returns defensive copies of links and skill ids", () => {
    const path = buildLearningPath(STEPS);
    path.steps[1]?.links?.push({ label: "M", href: "/m" });
    path.steps[2]?.skillIds?.push("z");
    expect(STEPS[2]?.links).toHaveLength(1);
    expect(STEPS[0]?.skillIds).toEqual(["x", "y"]);
  });
});

describe("prerequisite edges", () => {
  const CHAIN: LearningPathStepDefinition[] = [
    { id: "one", order: 1, title: "One", summary: "first", skillIds: ["s1"] },
    {
      id: "two",
      order: 2,
      title: "Two",
      summary: "second",
      skillIds: ["s2"],
      requires: ["one"],
    },
    {
      id: "three",
      order: 3,
      title: "Three",
      summary: "third",
      skillIds: ["s3"],
      requires: ["two"],
    },
  ];

  it("marks the first open step next and locks everything behind an unfinished step", () => {
    const path = buildLearningPath(CHAIN);
    expect(path.steps.map((step) => step.status)).toEqual(["next", "locked", "locked"]);
    expect(path.next?.id).toBe("one");
  });

  it("unlocks the successor once the check is passed independently", () => {
    const path = buildLearningPath(CHAIN, { events: [event("s1")] });
    expect(path.steps.map((step) => step.status)).toEqual(["done", "next", "locked"]);
    expect(path.next?.id).toBe("two");
    expect(path.done).toBe(1);
  });

  it("does not unlock on hinted evidence alone", () => {
    const path = buildLearningPath(CHAIN, {
      events: [event("s1", { assistance: "hinted" })],
    });
    expect(path.steps.map((step) => step.status)).toEqual(["next", "locked", "locked"]);
  });

  it("does not unlock a successor through a step that is locked", () => {
    // "two" meets its own threshold but sits behind an unfinished "one", so it
    // is locked — and must not hand "three" an open door on the way past.
    const path = buildLearningPath(CHAIN, { events: [event("s2")] });
    expect(path.steps.map((step) => step.status)).toEqual(["next", "locked", "locked"]);
    expect(path.next?.id).toBe("one");
  });

  it("never gates a chain on a step that has no skills to measure", () => {
    const steps: LearningPathStepDefinition[] = [
      { id: "read", order: 1, title: "Read", summary: "reference", kind: "reference" },
      {
        id: "play",
        order: 2,
        title: "Play",
        summary: "drill",
        skillIds: ["s1"],
        requires: ["read"],
      },
    ];
    expect(buildLearningPath(steps).steps.map((step) => step.status)).toEqual(["todo", "next"]);
  });

  it("counts guided attempts only for a step whose drill has no check mode", () => {
    const steps: LearningPathStepDefinition[] = [
      { ...CHAIN[0]!, evidence: "guided-accepted" },
      CHAIN[1]!,
    ];
    const guided = buildLearningPath(steps, {
      events: [event("s1", { assistance: "guided" })],
    });
    expect(guided.steps.map((step) => step.status)).toEqual(["done", "next"]);

    const hinted = buildLearningPath(steps, {
      events: [event("s1", { assistance: "hinted" })],
    });
    expect(hinted.steps.map((step) => step.status)).toEqual(["next", "locked"]);
  });

  it("leaves paths without prerequisites on their existing statuses", () => {
    const path = buildLearningPath(STEPS, { events: [event("done"), event("x")] });
    expect(path.steps.map((step) => step.status)).toEqual(["done", "todo", "in-progress"]);
  });
});

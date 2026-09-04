import { describe, expect, it } from "vitest";

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

const mastery = (id: string) => ({ done: 0.9, x: 0.4, y: 0.2 })[id] ?? 0;

describe("buildLearningPath", () => {
  it("orders steps, derives status from mean mastery, and points Continue at the first unfinished step", () => {
    const path = buildLearningPath(STEPS, { mastery });
    expect(path.steps.map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(path.steps[0]?.status).toBe("done");
    expect(path.steps[1]?.status).toBe("todo");
    expect(path.steps[2]?.mastery).toBeCloseTo(0.3);
    expect(path.steps[2]?.status).toBe("in-progress");
    expect(path.done).toBe(1);
    expect(path.total).toBe(3);
    expect(path.next?.id).toBe("c");
  });

  it("defaults kind to drill and applicability to all, and clamps mastery", () => {
    const path = buildLearningPath(STEPS, { mastery: () => 7 });
    expect(path.steps[0]?.kind).toBe("drill");
    expect(path.steps[0]?.applies).toBe("all");
    expect(path.steps[0]?.mastery).toBe(1);
    expect(path.steps[1]?.kind).toBe("reference");
    // A reference step without skills never blocks Continue.
    expect(path.next).toBeUndefined();
    expect(buildLearningPath(STEPS, { mastery: (id) => (id === "done" ? 1 : 0) }).next?.id).toBe(
      "c",
    );
  });

  it("reports zero mastery without a mastery source and annotates polyphonic steps on monophonic instruments", () => {
    const path = buildLearningPath(STEPS, { instrument: "aerophone" });
    expect(path.steps.every((s) => s.mastery === 0 && s.status === "todo")).toBe(true);
    expect(path.steps[1]?.instrumentNote).toMatch(/arpeggio/i);
    expect(path.steps[0]?.instrumentNote).toBeUndefined();
  });

  it("returns defensive copies of links and skill ids", () => {
    const path = buildLearningPath(STEPS);
    path.steps[1]?.links?.push({ label: "M", href: "/m" });
    path.steps[2]?.skillIds?.push("z");
    expect(STEPS[2]?.links).toHaveLength(1);
    expect(STEPS[0]?.skillIds).toEqual(["x", "y"]);
  });
});

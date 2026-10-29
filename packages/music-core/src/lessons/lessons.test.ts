import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../types";
import { lessonProblems } from "./check";
import { pendingLessons, type Lesson } from "./types";

const a: Lesson = { id: "a", title: "A", screens: [{ title: "x", text: "One." }] };
const b: Lesson = { id: "b", title: "B", screens: [{ title: "y", text: "Two." }] };

describe("lessons", () => {
  it("pending skips seen lessons and keeps order", () => {
    expect(pendingLessons({ lessons: [a, b] }, ["a"]).map((l) => l.id)).toEqual(["b"]);
  });
  it("an old backup without lessonsSeen counts as nothing seen", () => {
    expect(pendingLessons({ lessons: [a] }, undefined)).toEqual([a]);
  });
  it("no ref, no lessons", () => expect(pendingLessons(null, [])).toEqual([]));
  it("lessonProblems flags dashes, banned words, long text and screen counts", () => {
    const bad: Lesson = {
      id: "z",
      title: "Z",
      screens: [{ title: "t", text: "A pivotal idea — really. Two. Three. Four." }],
    };
    const p = lessonProblems(bad);
    expect(p.some((m) => /dash/.test(m))).toBe(true);
    expect(p.some((m) => /pivotal/.test(m))).toBe(true);
    expect(p.some((m) => /sentences/.test(m))).toBe(true);
    expect(p.some((m) => /3 to 6 screens/.test(m))).toBe(true);
    expect(lessonProblems(a, "card")).toEqual([]);
  });
  it("defaults have an empty seen list", () => expect(DEFAULT_SETTINGS.lessonsSeen).toEqual([]));
});

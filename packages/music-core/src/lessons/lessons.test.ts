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
  it("lessonProblems reads the lesson title and catches a spaced hyphen used as a dash", () => {
    const titled: Lesson = {
      id: "t",
      title: "A crucial idea — here",
      screens: [{ title: "x", text: "One." }],
    };
    expect(lessonProblems(titled, "card")).toHaveLength(2);
    const hyphen: Lesson = {
      id: "h",
      title: "H",
      screens: [{ title: "x", text: "Two notes - then a rest." }],
    };
    expect(lessonProblems(hyphen, "card").some((m) => /dash/.test(m))).toBe(true);
    const fine: Lesson = {
      id: "f",
      title: "Re-entrant tuning",
      screens: [{ title: "x", text: "A 2-bar phrase." }],
    };
    expect(lessonProblems(fine, "card")).toEqual([]);
  });
  it("defaults have an empty seen list", () => expect(DEFAULT_SETTINGS.lessonsSeen).toEqual([]));
});

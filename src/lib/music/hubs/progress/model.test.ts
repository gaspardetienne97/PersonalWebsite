import { describe, expect, it } from "vitest";
import type { PracticeSession } from "@repo/music-core";
import {
  exerciseTitle,
  fallingSentence,
  formatDuration,
  plainPathText,
  scoreHistory,
  sessionTitle,
  type SkillRow,
} from "./model";

const row = (id: string, name: string) => ({ skill: { id, name } }) as unknown as SkillRow;

describe("What next: the falling sentence", () => {
  it("names the skill, or 'It' when the focus skill was just named, and counts the rest", () => {
    expect(fallingSentence([row("a", "Sight-reading")])).toMatch(
      /^Sight-reading dropped ten points/,
    );
    expect(fallingSentence([row("a", "Sight-reading")], "a")).toMatch(/^It dropped ten points/);
    expect(fallingSentence([row("a", "Sight-reading"), row("b", "B")], "a")).toMatch(
      /^It and 1 other skill dropped/,
    );
    expect(fallingSentence([row("a", "Sight-reading"), row("b", "B"), row("c", "C")])).toMatch(
      /^Sight-reading and 2 other skills dropped/,
    );
  });
});

describe("Journal names", () => {
  const run = (exerciseId: string, endedAt: number, score?: number) =>
    ({ exerciseId, endedAt, score }) as PracticeSession["runs"][number];
  const session = (runs: PracticeSession["runs"]) =>
    ({ source: "drill", runs }) as unknown as PracticeSession;

  it("names a run by its drill, with the mode when the modes record different exercises", () => {
    expect(exerciseTitle("ear.intervals")).toBe("Intervals");
    expect(exerciseTitle("technique.guitar.note-finder")).toBe("Fretboard: Note finder");
    expect(exerciseTitle("technique.ukulele.note-finder")).toBe("Fretboard: Note finder");
    expect(exerciseTitle("rhythm.pattern.dotted-quarter")).toBe("Rhythm: Read and tap");
    expect(exerciseTitle("made.up-id")).toBe("Made up id");
  });

  it("names a session by its drills, two then a count", () => {
    expect(sessionTitle(session([]))).toBe("Drill");
    expect(sessionTitle(session([run("ear.intervals", 1), run("ear.intervals", 2)]))).toBe(
      "Intervals",
    );
    expect(
      sessionTitle(
        session([run("ear.intervals", 1), run("ear.cadences", 2), run("ear.scales", 3)]),
      ),
    ).toBe("Intervals, Cadences and 1 more");
  });

  it("keeps one exercise's scores in order, up to the given run", () => {
    const sessions = [
      session([run("ear.intervals", 3, 0.9), run("ear.cadences", 2, 0.1)]),
      session([run("ear.intervals", 1, 0.5), run("ear.intervals", 5, 1)]),
    ];
    expect(scoreHistory(sessions, "ear.intervals", 3)).toEqual([0.5, 0.9]);
  });
});

describe("Durations", () => {
  it("reads seconds under a minute, minutes under an hour, then hours", () => {
    expect(formatDuration(0)).toBe("0 sec");
    expect(formatDuration(42_400)).toBe("42 sec");
    expect(formatDuration(59_600)).toBe("1 min");
    expect(formatDuration(6 * 60_000 + 20_000)).toBe("6 min");
    expect(formatDuration(60 * 60_000)).toBe("1 h");
    expect(formatDuration(95 * 60_000)).toBe("1 h 35 min");
  });
});

describe("Path copy", () => {
  it("says what the curriculum codes mean instead of printing them", () => {
    expect(plainPathText("The cadence that keeps the key waits for N1.")).toBe(
      "The cadence that keeps the key comes in a later update.",
    );
    expect(plainPathText("Narrowing the set waits for N1 (chosen degrees).")).toBe(
      "Narrowing the set comes in a later update.",
    );
    expect(plainPathText("The cadence and key context wait for N1.")).toBe(
      "The cadence and key context come in a later update.",
    );
    expect(plainPathText("The check against the score (N3) is still to come.")).toBe(
      "The check against the score is still to come.",
    );
    expect(plainPathText("(the reharmonisation sandbox, N10, is still to come)")).toBe(
      "(the reharmonisation sandbox is still to come)",
    );
    expect(plainPathText("a chord tone (a self-check until N10).")).toBe(
      "a chord tone (a self-check for now).",
    );
    expect(plainPathText("Circle T-1 and T-2")).toBe("Circle of fifths step 1 and step 2");
    expect(plainPathText("Hear the low band (Studio S-1, S-2)")).toBe(
      "Hear the low band (Studio ears step 1, step 2)",
    );
    expect(plainPathText("H1 The major scale")).toBe("The major scale");
    expect(plainPathText("Degrees 1 to 5")).toBe("Degrees 1 to 5");
  });
});

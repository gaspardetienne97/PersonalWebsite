import { describe, expect, it } from "vite-plus/test";
import type { PracticeSession } from "@repo/music-core";
import { exerciseTitle, fallingSentence, scoreHistory, sessionTitle, type SkillRow } from "./model";

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

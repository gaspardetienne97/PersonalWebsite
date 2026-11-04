import { describe, expect, it } from "vitest";
import type { PracticeSession } from "@repo/music-core";
import {
  exerciseTitle,
  fallingSentence,
  foldShort,
  runDelta,
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
    expect(formatDuration(0)).toBe("a few seconds");
    expect(formatDuration(4_400)).toBe("a few seconds");
    expect(formatDuration(5_000)).toBe("5 sec");
    expect(formatDuration(42_400)).toBe("42 sec");
    expect(formatDuration(59_600)).toBe("1 min");
    expect(formatDuration(6 * 60_000 + 20_000)).toBe("6 min");
    expect(formatDuration(60 * 60_000)).toBe("1 h");
    expect(formatDuration(95 * 60_000)).toBe("1 h 35 min");
  });
});

describe("Path copy", () => {
  it("says what the curriculum codes mean, and drops what is still to build", () => {
    expect(plainPathText("Name the degree. The cadence that keeps the key waits for N1.")).toBe(
      "Name the degree.",
    );
    expect(plainPathText("Narrowing the set waits for N1 (chosen degrees). Then sing it.")).toBe(
      "Then sing it.",
    );
    expect(plainPathText("Play it. The cadence and key context wait for N1.")).toBe("Play it.");
    expect(plainPathText("Play it twice. The check against the score (N3) is still to come.")).toBe(
      "Play it twice.",
    );
    expect(
      plainPathText(
        "The Create piano roll (the reharmonisation sandbox, N10, is still to come): try it.",
      ),
    ).toBe("The Create piano roll: try it.");
    expect(plainPathText("a chord tone (a self-check until N10).")).toBe(
      "a chord tone (a self-check).",
    );
    for (const t of ["waits for N1.", "x waits for N7. y"])
      expect(plainPathText(t)).not.toMatch(/later update|N\d/);
    expect(plainPathText("Circle T-1 and T-2")).toBe("Circle of fifths step 1 and step 2");
    expect(plainPathText("Hear the low band (Studio S-1, S-2)")).toBe(
      "Hear the low band (Studio ears step 1, step 2)",
    );
    expect(plainPathText("H1 The major scale")).toBe("The major scale");
    expect(plainPathText("Degrees 1 to 5")).toBe("Degrees 1 to 5");
  });
});

describe("Short sessions", () => {
  const session = (
    id: string,
    start: number,
    ms: number,
    events: number,
    exerciseId = "ear.intervals",
  ) =>
    ({
      id,
      startTime: start,
      endTime: start + ms,
      source: "drill",
      runs: [{ exerciseId, endedAt: start + ms }],
      eventIds: Array.from({ length: events }, (_, i) => `${id}-${i}`),
      tags: [],
      xp: 0,
    }) as unknown as PracticeSession;

  it("folds a tap-length session into the same drill's session before it, newest first", () => {
    const list = foldShort([
      session("a", 0, 60_000, 10),
      session("b", 70_000, 2_000, 1),
      session("c", 80_000, 2_000, 1, "rhythm.pulse"),
    ]);
    expect(list.map((x) => [x.session.id, x.folded])).toEqual([
      ["c", 0],
      ["a", 1],
    ]);
  });

  it("keeps a short session that has a note", () => {
    const noted = { ...session("b", 70_000, 2_000, 1), note: "felt rushed" };
    expect(foldShort([session("a", 0, 60_000, 10), noted])).toHaveLength(2);
  });
});

describe("Run deltas", () => {
  const run = (id: string, endedAt: number, score: number, setupKey = "k") => ({
    id,
    exerciseId: "ear.intervals",
    setupKey,
    endedAt,
    score,
  });
  const sessions = (runs: ReturnType<typeof run>[]) => [{ runs } as unknown as PracticeSession];
  it("names a new best, a rise, a drop and a first run", () => {
    const a = run("a", 1, 0.7);
    const b = run("b", 2, 0.9);
    const c = run("c", 3, 0.8);
    const all = sessions([a, b, c]);
    expect(runDelta(a, all)).toBeUndefined();
    expect(runDelta(b, all)).toEqual({ kind: "best", text: "Best yet, up from 70%" });
    expect(runDelta(c, all)).toEqual({ kind: "down", text: "Down from 90%" });
    expect(runDelta(run("d", 4, 0.85, "other"), all)).toBeUndefined();
  });
});

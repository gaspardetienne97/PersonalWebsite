import { describe, expect, it } from "vite-plus/test";
import {
  customTuningId,
  exerciseFor,
  parseTuningNotes,
  skillsFor,
  tuningName,
  tuningNotes,
  withSlips,
  type Outcome,
} from "./fretted";
import type { LineResult } from "@repo/music-core/scoring/technique";
import { setNamingKey, setNoteNaming } from "@repo/music-core";
import { TUNINGS } from "@repo/music-core/data/index";

describe("fretted helpers", () => {
  it("keeps each instrument's own skills and never claims a missing ukulele twin", () => {
    const spider = [
      "technique.strings.spider",
      "technique.guitar.spider",
      "technique.ukulele.spider",
    ];
    expect(skillsFor(spider, "guitar")).toEqual([
      "technique.strings.spider",
      "technique.guitar.spider",
    ]);
    expect(skillsFor(spider, "ukulele")).toEqual([
      "technique.strings.spider",
      "technique.ukulele.spider",
    ]);
    expect(skillsFor(["technique.strings.spider", "technique.guitar.spider"], "ukulele")).toEqual([
      "technique.strings.spider",
      "technique.ukulele.spider",
    ]);
    // there is no ukulele interval skill in the seed
    expect(
      skillsFor(["technique.guitar.intervals", "technique.guitar.intervals.7"], "ukulele"),
    ).toEqual([]);
  });

  it("swaps exercise ids for the ukulele", () => {
    expect(exerciseFor("technique.guitar.spider", "ukulele")).toBe("technique.ukulele.spider");
    expect(exerciseFor("technique.guitar.spider", "guitar")).toBe("technique.guitar.spider");
  });

  it("parses a tuning low to high into string-1-first MIDI", () => {
    expect(parseTuningNotes("E2 A2 D3 G3 B3 E4")).toEqual([64, 59, 50 + 5, 50, 45, 40]);
    expect(parseTuningNotes("40, 45 50 55 59 64")).toEqual([64, 59, 55, 50, 45, 40]);
    expect(parseTuningNotes("E A D")).toMatch(/octave/);
    expect(parseTuningNotes("")).toMatch(/low to high/);
    expect(customTuningId("Open D (Joni)")).toBe("custom.open-d-joni");
  });
});

describe("withSlips", () => {
  // C major up, eight steps; the grader matched every note by pitch, evenly.
  const line = [60, 62, 64, 65, 67, 69, 71, 72];
  const graded: LineResult = {
    evenness: 1,
    evennessErrorMs: 0,
    meanTimingErrorMs: 0,
    together: null,
    chordTogether: null,
    notMeasured: [],
    score: 1,
    correct: true,
    pitch: 1,
    clean: 8,
    total: 8,
    metrics: [
      ...line.map((m) => ({ kind: "pitch" as const, expectedMidi: m, actualMidi: m })),
      { kind: "timing", expectedMs: 0, actualMs: 0, errorMs: 0 },
    ],
  };
  const eight = line.map((m) => ({ notes: [{ midi: m }] }));

  it("counts a slip: a wrong note before the right one on note 5", () => {
    const played = line.map((_, i) => (i === 4 ? "wrong" : "correct") as Outcome);
    const r = withSlips(graded, eight, played, [, , , , 66]);
    expect(r.clean).toBe(7);
    expect(r.pitch).toBe(7 / 8);
    expect(r.score).toBeCloseTo(1 - 0.85 / 8);
    // The grader's 90% rule on the score with the slip taken out: 89% does not pass.
    expect(r.correct).toBe(false);
    expect(r.slips).toEqual([4]);
    expect(r.outcomes[4]).toBe("wrong");
    // The saved confusion names what was heard first.
    expect(r.metrics[4]).toMatchObject({ expectedMidi: 67, actualMidi: 66 });
    expect(r.metrics[8]).toMatchObject({ kind: "timing" });
  });

  it("leaves a clean run alone and never counts a step the grader missed", () => {
    const clean = withSlips(
      graded,
      eight,
      line.map(() => "correct" as const),
    );
    expect(clean).toMatchObject({ clean: 8, score: 1, correct: true, slips: [] });
    const unheard = {
      ...graded,
      clean: 7,
      pitch: 7 / 8,
      score: 0.9,
      metrics: graded.metrics.map((m, i) =>
        i === 2 && m.kind === "pitch" ? { ...m, actualMidi: undefined } : m,
      ),
    };
    const r = withSlips(
      unheard,
      eight,
      line.map(() => "correct" as const),
    );
    expect(r.outcomes[2]).toBe("missed");
    expect(r.clean).toBe(7);
  });
});

describe("tuning names", () => {
  const byId = (id: string) => [...TUNINGS.guitar, ...TUNINGS.ukulele].find((t) => t.id === id)!;
  const names = () =>
    [
      "guitar.standard",
      "guitar.drop-d",
      "guitar.dadgad",
      "guitar.open-g",
      "ukulele.high-g",
      "ukulele.baritone",
    ].map((id) => tuningName(byId(id)));

  it("keeps the curated names and a player's own as written, with letters", () => {
    expect(names()).toEqual(["Standard", "Drop D", "DADGAD", "Open G", "High G", "Baritone DGBE"]);
    expect(tuningName({ id: "custom.open-d", name: "Open D", source: "custom" })).toBe("Open D");
    expect(tuningNotes(byId("guitar.standard"))).toBe("E2 A2 D3 G3 B3 E4");
  });

  it("names the notes in solfège, absolute even in movable do", () => {
    setNoteNaming("fixed");
    try {
      expect(names()).toEqual([
        "Standard",
        "Drop Re",
        "Re La Re Sol La Re",
        "Open Sol",
        "High Sol",
        "Baritone Re Sol Si Mi",
      ]);
      expect(tuningName({ id: "custom.open-d", name: "Open D", source: "custom" })).toBe("Open D");
      expect(tuningNotes(byId("guitar.drop-d"))).toBe("Re2 La2 Re3 Sol3 Si3 Mi4");
      setNoteNaming("movable");
      setNamingKey({ tonic: "G" });
      expect(tuningName(byId("guitar.drop-d"))).toBe("Drop Re");
      expect(tuningNotes(byId("guitar.standard"))).toBe("Mi2 La2 Re3 Sol3 Si3 Mi4");
    } finally {
      setNamingKey(undefined);
      setNoteNaming("letters");
    }
  });
});

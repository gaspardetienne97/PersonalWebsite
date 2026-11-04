import { describe, expect, it } from "vitest";
import type { ScoringEvent } from "../types";
import { T0, ev, session } from "./fixtures";
import { ingestAnalytics } from "./analytics";
import { coach, practiceName } from "./coach";

let n = 0;
const reps = (count: number, over: Partial<ScoringEvent>) =>
  Array.from({ length: count }, () => ev({ id: `e${n++}`, ...over }));

const advise = (events: ScoringEvent[], instrument: "piano" | "guitar" = "piano") =>
  coach({
    instrument,
    stats: ingestAnalytics({}, [], events).stats,
    mastery: {},
    sessions: [session({ instrument: "piano" })],
    now: T0,
  });

describe("coach", () => {
  it("stays silent below 5 independent attempts on the instrument and says so", () => {
    const a = advise([
      ...reps(4, {
        instrument: "piano",
        skillIds: ["reading.treble.landmarks"],
        correct: false,
        partialCredit: 0,
      }),
      ...reps(3, {
        instrument: "piano",
        skillIds: ["reading.treble.landmarks"],
        assistance: "guided",
        correct: false,
      }),
      ...reps(3, {
        instrument: "piano",
        skillIds: ["reading.treble.landmarks"],
        assistance: "hinted",
        correct: false,
      }),
      ...reps(10, {
        instrument: "guitar",
        skillIds: ["technique.guitar.spider"],
        correct: false,
        partialCredit: 0,
      }),
    ]);
    expect(a.measured).toBe(false);
    expect(a.focus).toBeUndefined();
    expect(a.headline).toBe("Not measured yet");
    expect(a.summary).toBe(
      "The coach names a weak spot after 5 answers in Check mode on piano. You have 4 so far.",
    );
    // No instrument-wide percentage: it read as a second score for the focus skill.
    expect(a.insights.some((l) => l.includes("%"))).toBe(false);
  });

  it("counts checked answers with no instrument (clicked ear answers) on the instrument, never Practice ones", () => {
    const a = advise([
      ...reps(3, { skillIds: ["pitch.scale-degrees"], correct: true }),
      ...reps(2, { skillIds: ["pitch.scale-degrees"], correct: false, partialCredit: 0 }),
      ...reps(6, { skillIds: ["pitch.scale-degrees"], assistance: "guided", correct: false }),
      ...reps(9, {
        instrument: "guitar",
        skillIds: ["pitch.scale-degrees"],
        correct: false,
        partialCredit: 0,
      }),
    ]);
    expect(a.measured).toBe(true);
    expect(a.focus).toMatchObject({ skillId: "pitch.scale-degrees", accuracy: 0.6, attempts: 5 });
  });

  it("never frames a single attempt as a diagnosis", () => {
    const a = advise([
      ...reps(5, { instrument: "piano", skillIds: ["technique.scale.major"], correct: true }),
      ...reps(1, {
        instrument: "piano",
        skillIds: ["reading.bass.landmarks"],
        correct: false,
        partialCredit: 0,
      }),
    ]);
    expect(a.focus?.skillId).toBe("technique.scale.major");
    expect(a.headline).toBe("Everything measured is solid");
  });

  it("names the weakest measured skill on this instrument only", () => {
    const events = [
      ...reps(3, {
        instrument: "piano",
        skillIds: ["reading.treble.landmarks"],
        correct: false,
        partialCredit: 0.2,
      }),
      ...reps(3, { instrument: "piano", skillIds: ["technique.scale.major"], correct: true }),
      ...reps(9, {
        instrument: "guitar",
        skillIds: ["technique.guitar.spider"],
        correct: false,
        partialCredit: 0,
      }),
    ];
    const piano = advise(events);
    expect(piano.headline).toBe("Coach focus: Treble Landmark Notes");
    expect(piano.focus).toEqual({
      skillId: "reading.treble.landmarks",
      name: "Treble Landmark Notes",
      accuracy: 0,
      attempts: 3,
    });
    expect(piano.summary).toBe(
      "Treble Landmark Notes is at 0% across 3 answers in Check mode on piano, the lowest you have measured.",
    );
    expect(piano.action.href).toBe("/music/reading?instrument=piano");
    const guitar = advise(events, "guitar");
    expect(guitar.focus?.skillId).toBe("technique.guitar.spider");
    expect(guitar.action.href).toBe("/music/fretboard?instrument=guitar");
    expect(guitar.insights).toContain("0 saved sessions on guitar.");
  });

  it("names a drill's umbrella and instrument twins once, by the drill", () => {
    expect(practiceName("technique.strings.note-finder")).toBe("Note finder");
    expect(practiceName("technique.guitar.note-finder")).toBe("Note finder");
    expect(practiceName("technique.strings.spider.permutations")).toBe("Spider Permutations");
    expect(practiceName("reading.treble.landmarks")).toBe("Treble Landmark Notes");
    // One answer tagged with the umbrella and the guitar skill: one name, one count.
    const a = coach({
      instrument: "guitar",
      instrumentName: "Guitar",
      stats: ingestAnalytics(
        {},
        [],
        [
          ...reps(4, {
            instrument: "guitar",
            skillIds: ["technique.strings.note-finder", "technique.guitar.note-finder"],
            correct: true,
          }),
        ],
      ).stats,
      mastery: {},
      sessions: [],
      now: T0,
      checkedAnswers: 4,
    });
    expect(a.summary).toBe(
      "The coach names a weak spot after 5 answers in Check mode on Guitar. You have 4 so far.",
    );
  });
});

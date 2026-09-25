import { describe, expect, it } from "vitest";
import type { ScoringEvent } from "../types";
import { T0, ev, session } from "./fixtures";
import { ingestAnalytics } from "./analytics";
import { coach } from "./coach";

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
      "The coach needs 5 checked attempts on piano before it names a weak spot. You have 4.",
    );
    expect(a.insights).toContain("0% correct across 4 checked attempts on piano.");
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
      "Treble Landmark Notes is at 0% across 3 checked attempts on piano, the lowest you have measured.",
    );
    expect(piano.action.href).toBe("/music/reading?instrument=piano");
    const guitar = advise(events, "guitar");
    expect(guitar.focus?.skillId).toBe("technique.guitar.spider");
    expect(guitar.action.href).toBe("/music/fretboard?instrument=guitar");
    expect(guitar.insights).toContain("0 saved sessions on guitar.");
  });
});

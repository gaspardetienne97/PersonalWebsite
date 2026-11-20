import { describe, expect, it } from "vite-plus/test";
import type { NoteEvent } from "../types";
import { gradePhrase, matchEvents, phraseEvents } from "./phrases";

const on = (midi: number, at: number, extra: Partial<NoteEvent> = {}): NoteEvent => ({
  kind: "noteon",
  midi,
  velocity: 0.8,
  at,
  source: "midi",
  confidence: 1,
  velocityMeasured: true,
  ...extra,
});

// A turnaround: two dyads, then a single note.
const events = phraseEvents([
  { midi: 67, startBeat: 0 },
  { midi: 69, startBeat: 0 },
  { midi: 66, startBeat: 1 },
  { midi: 69, startBeat: 1 },
  { midi: 57, startBeat: 2 },
]);

describe("phrase grading", () => {
  it("groups notes that start together", () => {
    expect(events.map((e) => e.notes.length)).toEqual([2, 2, 1]);
  });

  it("takes a chord in any order and octave, and a single note as before", () => {
    const r = gradePhrase({
      events,
      notes: [on(81, 2), on(67, 10), on(66, 500), on(69, 505), on(45, 1000)],
      beatMs: 500,
      startAt: 0,
    });
    expect(r).toMatchObject({ matched: 3, total: 3, onTime: 3, correct: true });
  });

  it("calls a chord with a missing note wrong and keeps the rest aligned", () => {
    const r = gradePhrase({
      events,
      notes: [on(67, 0), on(70, 500), on(57, 1000)],
      beatMs: 500,
      startAt: 0,
    });
    // 67 alone, then 70 (not in the second dyad) is a wrong event of its own; the last note still lines up.
    expect(r.firstWrong).toBe(0);
    expect(r.matched).toBe(1);
  });

  it("keeps a doubled string with its chord, but not a late repeat", () => {
    const c = phraseEvents(
      [60, 64, 67, 72]
        .map((midi) => ({ midi, startBeat: 0 }))
        .concat([60, 64, 67, 72].map((midi) => ({ midi, startBeat: 1 }))),
    );
    const strum = (t: number) => [on(67, t), on(60, t + 10), on(64, t + 20), on(72, t + 30)];
    expect(
      matchEvents(c, [...strum(0), ...strum(500)]).map((x) => [x.right, x.played.length]),
    ).toEqual([
      [true, 4],
      [true, 4],
    ]);
  });
});

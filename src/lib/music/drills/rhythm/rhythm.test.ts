import { describe, expect, it } from "vitest";
import type { NoteEvent } from "@repo/music-core";
import { expandRhythm, rhythmPattern } from "@repo/music-core/content/rhythm";
import { gradePattern } from "@repo/music-core/scoring/rhythm";
import { demoNotes, midiHits, voicing } from "./rhythm";

const on = (at: number, midi: number, instrument?: NoteEvent["instrument"]): NoteEvent => ({
  kind: "noteon",
  midi,
  at,
  velocity: 1,
  source: "midi",
  confidence: 1,
  instrument,
});

describe("rhythm helpers", () => {
  it("merges a strummed chord into one hit with its pitch classes", () => {
    const hits = midiHits([on(1000, 55), on(1010, 59), on(1020, 62), on(1500, 60)]);
    expect(hits).toHaveLength(2);
    expect(hits[0].pcs!.sort()).toEqual([11, 2, 7].sort());
  });

  it("never treats MPC pad numbers as pitch", () => {
    expect(midiHits([on(0, 36, "mpc")])[0].pcs).toBeUndefined();
  });

  it("a keyboard strum of the right chords grades the chords; taps alone are timing only", () => {
    const def = rhythmPattern("guitar-four-on-the-floor")!;
    const plan = expandRhythm(def, { bpm: 100 });
    const strum = plan.events.flatMap((e) =>
      voicing(plan.chords.find((c) => e.atMs >= c.startMs && e.atMs < c.endMs)!.pitchClasses).map(
        (m, k) => on(e.atMs + k * 5, m),
      ),
    );
    const pitched = gradePattern(def, midiHits(strum), { startAt: 0, beatMs: plan.beatMs });
    expect(pitched.chords?.every((c) => c.held)).toBe(true);
    const taps = gradePattern(
      def,
      plan.events.map((e) => ({ at: e.atMs })),
      { startAt: 0, beatMs: plan.beatMs },
    );
    expect(taps.chords).toBeNull();
    expect(taps.notMeasured).toEqual(["chords"]);
  });

  it("demo lights every event once and keeps the silent bar silent", () => {
    const plan = expandRhythm(rhythmPattern("gap-click-1-on-1-off")!, { bpm: 120 });
    const notes = demoNotes(plan);
    expect(new Set(notes.filter((n) => n.event >= 0).map((n) => n.event)).size).toBe(
      plan.events.length,
    );
    expect(notes.filter((n) => n.voice === "click").every((n) => n.time < 2)).toBe(true);
  });
});

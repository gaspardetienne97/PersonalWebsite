import { describe, expect, it } from "vitest";
import { PROGRESSIONS } from "@repo/music-core/content/jam";
import { backingNotes, chordVoicing, degreeLabel, positionAt } from "./backing";

const blues = PROGRESSIONS.find((p) => p.id === "blues")!;
const pop = PROGRESSIONS.find((p) => p.id === "pop-axis")!;

describe("positionAt", () => {
  it("walks the form and counts wrapped choruses", () => {
    expect(positionAt(blues, 0, 0)).toEqual({ chordIndex: 0, choruses: 0, beatInChord: 0 });
    expect(positionAt(blues, 0, 17)).toEqual({ chordIndex: 1, choruses: 0, beatInChord: 1 });
    // 12 bars = 48 beats per chorus.
    expect(positionAt(blues, 0, 48)).toEqual({ chordIndex: 0, choruses: 1, beatInChord: 0 });
    // Starting from the last chord, one bar in wraps once.
    expect(positionAt(pop, 3, 4)).toEqual({ chordIndex: 0, choruses: 1, beatInChord: 0 });
  });
});

describe("backingNotes", () => {
  it("lays chords and a groove over every bar", () => {
    const notes = backingNotes(pop, { bpm: 120, mode: "both", choruses: 1 });
    const drums = notes.filter((n) => n.voice === "drum");
    expect(drums.filter((n) => n.midi === 38)).toHaveLength(8); // snare on 2 and 4, four bars
    const last = Math.max(...notes.map((n) => n.time));
    expect(last).toBeLessThan(8); // four bars at 120 BPM = 8 s
    expect(notes.some((n) => !n.voice && n.midi === 48)).toBe(true); // C in the bass
  });
  it("drums only has no pitched notes", () => {
    expect(
      backingNotes(pop, { bpm: 120, mode: "drums", choruses: 1 }).every((n) => n.voice === "drum"),
    ).toBe(true);
  });
});

it("voices a seventh without doubling the root", () => {
  expect(chordVoicing("C7")).toEqual({ bass: 48, upper: [55, 58, 64] });
});

it("names degrees from the chord root", () => {
  expect(degreeLabel("Cm7", 3)).toBe("b3");
  expect(degreeLabel("C7", 3)).toBe("#9");
  expect(degreeLabel("C7", 2)).toBe("9");
  expect(degreeLabel("Dm7b5", 2 + 6)).toBe("b5");
});

describe("backingNotes on a tune", () => {
  it("comps a half-bar chord once and keeps the form's length", async () => {
    const { TUNES } = await import("@repo/music-core/content/tunes");
    const rhythm = TUNES.find((t) => t.id === "tune-rhythm-changes")!;
    const notes = backingNotes(rhythm, { bpm: 120, mode: "chords", choruses: 1 });
    // Bb6 (bass Bb2) on beat 1 and G7 (bass G2) on beat 3 of bar 1.
    const bass = notes.filter((n) => n.time < 2 && n.velocity === 0.6).map((n) => n.midi);
    expect(bass).toEqual([46, 43]);
    expect(Math.max(...notes.map((n) => n.time))).toBeLessThan(64); // 32 bars at 120 = 64 s
  });

  it("drops the chords in the band's fours when trading", async () => {
    const { tradeWindows } = await import("@repo/music-core/scoring/improv");
    const notes = backingNotes(blues, {
      bpm: 120,
      mode: "both",
      choruses: 1,
      windows: tradeWindows(4),
    });
    const pitched = notes.filter((n) => !n.voice);
    // Bars 5 to 8 (8 s to 16 s at 120) have drums only.
    expect(pitched.some((n) => n.time >= 8 && n.time < 16)).toBe(false);
    expect(pitched.some((n) => n.time >= 16)).toBe(true);
    expect(notes.some((n) => n.voice === "drum" && n.time >= 8 && n.time < 16)).toBe(true);
  });
});

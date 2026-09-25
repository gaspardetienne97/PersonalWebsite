import { describe, expect, it } from "vitest";
import { gradeItem, voicingItems } from "./voicings";

const opts = { strict: true, arpeggio: false };

describe("voicingItems", () => {
  it("major: one key is Dm7 G7 Cmaj7, root in the left hand", () => {
    const items = voicingItems({ variant: "major", keyPc: 0, keys: 1 });
    expect(items.map((i) => i.symbol)).toEqual(["Dm7", "G7", "Cmaj7"]);
    expect(items[0].show[0]).toEqual({ midi: 62, hand: "left" });
    expect(items[0].hint).toContain("Dorian");
  });
  it("starts the cycle at the requested key", () => {
    expect(voicingItems({ variant: "major", keyPc: 10, keys: 2 }).map((i) => i.group)).toEqual([
      "Bb",
      "Bb",
      "Bb",
      "Ab",
      "Ab",
      "Ab",
    ]);
  });
  it("closest chords I IV V I in C (curriculum P2)", () => {
    const items = voicingItems({ variant: "inversions", keyPc: 0, keys: 1 });
    expect(items.map((i) => i.symbol)).toEqual(["C", "F", "G", "C"]);
    expect(items[1].closest?.rightHand).toEqual([60, 65, 69]);
  });
  it("voice leading groups targets by key", () => {
    const items = voicingItems({ variant: "voice-leading", keyPc: 0, keys: 2 });
    expect(items.map((i) => `${i.group}:${i.symbol}`)).toEqual([
      "C:G7",
      "C:Cmaj7",
      "Bb:Cm7",
      "Bb:F7",
      "Bb:Bbmaj7",
    ]);
  });
});

describe("gradeItem", () => {
  const [c, f] = voicingItems({ variant: "inversions", keyPc: 0, keys: 1 });
  it("closest chords: inversion, root and movement all right", () => {
    expect(gradeItem(c, [48, 60, 64, 67], opts)).toMatchObject({ score: 1, correct: true });
    expect(gradeItem(f, [41, 60, 65, 69], opts)).toMatchObject({ score: 1, correct: true });
  });
  it("closest chords: a root-position F is the wrong inversion", () => {
    const r = gradeItem(f, [41, 65, 69, 72], opts);
    expect(r.correct).toBe(false);
    expect(r.note).toBe("wrong inversion");
  });
  it("closest chords: without the left-hand root the score is capped at half", () => {
    const r = gradeItem(f, [60, 65, 69], opts);
    expect(r).toMatchObject({ correct: false, score: 0.5, note: "no root in the left hand" });
  });
  it("rootless voicing: right chord scores 1", () => {
    const [dm7] = voicingItems({ variant: "major", keyPc: 0, keys: 1 });
    expect(
      gradeItem(
        dm7,
        dm7.show.map((s) => s.midi),
        opts,
      ).correct,
    ).toBe(true);
    expect(gradeItem(dm7, [62, 65, 69], opts).note).toBe("missing notes");
  });
});

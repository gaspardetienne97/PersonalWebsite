import { describe, expect, it } from "vitest";
import { gradeItem, voicingItems } from "./voicings";

const opts = { strict: true, arpeggio: false };

describe("voicingItems", () => {
  it("major: one key is Dm7 G7 Cmaj7, root in the left hand", () => {
    const items = voicingItems({ variant: "major", keyPc: 0, keys: 1 });
    expect(items.map((i) => i.symbol)).toEqual(["Dm7", "G7", "Cmaj7"]);
    expect(items[0].show[0]).toEqual({ midi: 50, hand: "left" });
    expect(items[0].hint).toContain("Dorian");
    expect(items[0]).toMatchObject({ keyPc: 0, minor: false });
  });
  it("altered: the b9 chord's scale is half-whole diminished, one period per sentence", () => {
    const [b9] = voicingItems({ variant: "altered", keyPc: 0, keys: 1 });
    expect(b9.hint).toBe(
      "Diminished tension. Go-to scale: Diminished (half-whole). Gives b9 #9 #11 over V7.",
    );
    for (const v of ["major", "minor", "altered", "voice-leading", "cadence"] as const)
      for (const i of voicingItems({ variant: v, keyPc: 0, keys: 12 }))
        expect(i.hint ?? "", i.id).not.toContain("..");
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
  it("closest chords, notes collected: a stray or repeated key keeps the closest move", () => {
    const loose = { strict: false, arpeggio: false };
    expect(gradeItem(f, [41, 60, 62, 65, 69, 65], loose)).toMatchObject({ correct: true });
    expect(gradeItem(f, [41, 60, 62, 65, 69, 65], opts).correct).toBe(false);
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

describe("gospel and ballad chords", () => {
  it("voices slash chords with the bass in the left hand and the right hand moving least", () => {
    const items = voicingItems({ variant: "gospel", keyPc: 0, keys: 1, progression: "slash-walk" });
    expect(items.map((i) => i.symbol)).toEqual(["C", "G/B", "Am", "Am/G", "F", "C/E", "Dm7", "G"]);
    const gb = items[1];
    expect(gb.closest!.leftRootPc).toBe(11);
    expect(gb.show[0]).toEqual({ midi: 47, hand: "left" });
    expect(gb.show.slice(1).map((n) => n.midi)).toEqual([59, 62, 67]);
    // Played as shown, every chord grades right.
    for (const it of items)
      expect(
        gradeItem(
          it,
          it.show.map((n) => n.midi),
          { strict: true, arpeggio: false },
        ).correct,
        it.symbol,
      ).toBe(true);
  });

  it("spells the passing diminished a half step up, through three keys", () => {
    const items = voicingItems({
      variant: "gospel",
      keyPc: 0,
      keys: 3,
      progression: "passing-dim",
    });
    expect(items).toHaveLength(27);
    expect(items[1].symbol).toBe("C#dim7");
    expect(items[5].symbol).toBe("F#dim7");
    expect(new Set(items.map((i) => i.group)).size).toBe(3);
  });
});

describe("jazz voicing types", () => {
  it("every type grades right when played as shown, held or as an arpeggio", () => {
    for (const variant of [
      "sevenths",
      "so-what",
      "sus",
      "close",
      "drop2",
      "locked",
      "garland",
      "monk",
      "upper",
    ] as const)
      for (const it of voicingItems({ variant, keyPc: 2, keys: 1 })) {
        const shown = it.show.map((n) => n.midi);
        expect(gradeItem(it, shown, opts).correct, it.id).toBe(true);
        expect(gradeItem(it, shown, { strict: false, arpeggio: true }).correct, it.id).toBe(true);
      }
  });
  it("drop-2 played as 4-way close has the right notes in the wrong order", () => {
    const [drop] = voicingItems({ variant: "drop2", keyPc: 0, keys: 1 });
    const [close] = voicingItems({ variant: "close", keyPc: 0, keys: 1 });
    const r = gradeItem(
      drop,
      close.show.map((n) => n.midi),
      opts,
    );
    expect(r).toMatchObject({ correct: false, score: 0.5, note: "wrong note at the bottom" });
    // The same notes with the dropped voice lowest but the rest rearranged.
    const [low, ...rest] = drop.show.map((n) => n.midi);
    const swapped = [low, rest[0] + 12, rest[1], rest[2]];
    expect(gradeItem(drop, swapped, opts).note).toBe("notes in the wrong order");
  });
  it("a slash chord takes the triad in any inversion", () => {
    const [d7sus] = voicingItems({ variant: "sus", keyPc: 2, keys: 1 });
    expect(gradeItem(d7sus, [50, 57, 64, 67, 72], opts).correct).toBe(true);
  });
  it("a tune's upper structures run on that tune in one key", () => {
    const items = voicingItems({ variant: "upper", keyPc: 5, keys: 12, tune: "tune-jazz-blues" });
    expect(new Set(items.map((i) => i.group))).toEqual(new Set(["Jazz blues in F"]));
  });
});

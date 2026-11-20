import { describe, expect, it } from "vite-plus/test";
import { chordPositions, chordShapeById, tuningById } from "./fretboard";
import {
  chordVoicings,
  generatedChord,
  generatedChordId,
  generatedPositions,
  VOICING_QUALITIES,
} from "./voicings";

const guitar = tuningById("guitar.standard")!;
const uke = tuningById("ukulele.high-g")!;
const q = (quality: string) => VOICING_QUALITIES.find((x) => x.quality === quality)!.intervals;
const shape = (frets: (number | null)[]) => frets.map((f) => (f === null ? "x" : f)).join("");

describe("chord voicings", () => {
  it("finds the open chords every guitarist knows, then the barre shapes up the neck", () => {
    // Strings are 1 (high E) first, so x32010 reads backwards: 01023x.
    const c = chordVoicings(guitar, 0, q("maj"));
    expect(shape(c[0].frets)).toBe("01023x");
    expect(c[0]).toMatchObject({ kind: "open", label: "Open position", needsBarre: false });
    // The A-shape barre at fret 3 (x35553) and the E-shape at 8 (8 10 10 9 8 8).
    expect(c.map((v) => shape(v.frets))).toContain("35553x");
    expect(c.find((v) => v.baseFret === 8)).toMatchObject({
      kind: "barre",
      label: "Barre at fret 8",
    });
    // Open G and E, which the old generator missed (no note on fret 1).
    expect(shape(chordVoicings(guitar, 7, q("maj"))[0].frets)).toBe("300023");
    expect(shape(chordVoicings(guitar, 4, q("maj"))[0].frets)).toBe("001220");
  });

  it("says which voicings need a barre: F can't be fingered one note a finger", () => {
    const f = chordVoicings(guitar, 5, q("maj"));
    const full = f.find((v) => shape(v.frets) === "112331")!;
    expect(full).toMatchObject({
      kind: "barre",
      needsBarre: true,
      barre: { fret: 1, fromString: 1, toString: 6 },
    });
    expect(full.fingers).toEqual([1, 1, 2, 4, 3, 1]);
    // Bm, the A-shape minor at fret 2.
    expect(chordVoicings(guitar, 11, q("m")).map((v) => shape(v.frets))).toContain("23442x");
    // Every voicing sounds the whole chord with the root lowest.
    for (const v of chordVoicings(guitar, 9, q("m7"))) {
      const midi = v.frets.flatMap((fr, i) => (fr === null ? [] : [guitar.openStrings[i] + fr]));
      expect(Math.min(...midi) % 12).toBe(9);
    }
  });

  it("voices the ukulele on all four strings, barre chords included, and drops the 5th to fit", () => {
    const c = chordVoicings(uke, 0, q("maj"));
    expect(shape(c[0].frets)).toBe("3000");
    // Bb: the classic barre at fret 1 (3211 written low to high: string 4 first).
    const bb = chordVoicings(uke, 10, q("maj"));
    expect(bb.map((v) => shape(v.frets))).toContain("1123");
    expect(bb.find((v) => shape(v.frets) === "1123")!.kind).toBe("barre");
    // A 9th chord has five notes for four strings: the 5th goes.
    const g9 = chordVoicings(uke, 7, q("9"));
    expect(g9.length).toBeGreaterThan(0);
    expect(g9.every((v) => v.frets.every((f) => f !== null))).toBe(true);
    expect(g9[0].omitsFifth).toBe(true);
  });

  it("covers every quality on every root somewhere on the neck", () => {
    for (const { quality, intervals } of VOICING_QUALITIES)
      for (let root = 0; root < 12; root++) {
        expect(
          chordVoicings(guitar, root, intervals).length,
          `guitar ${root} ${quality}`,
        ).toBeGreaterThan(0);
        expect(
          chordVoicings(uke, root, intervals).length,
          `uke ${root} ${quality}`,
        ).toBeGreaterThan(0);
      }
  });
});

describe("generated chords as drill shapes", () => {
  it("turns an id into positions the drills already understand", () => {
    const id = generatedChordId("ukulele", 10, "maj");
    expect(id).toBe("gen.ukulele.10.maj");
    const pos = chordPositions(id);
    expect(pos[0]).toMatchObject({
      id,
      shapeId: id,
      positionIndex: 0,
      kind: "barre",
      positionLabel: "Barre at fret 1",
      tuningId: "ukulele.high-g",
    });
    expect(pos[1].id).toBe(`${id}@1`);
    expect(chordShapeById(id)!.name).toBe("Bb, Bb major");
    expect(generatedChord("gen.guitar.0.nope")).toBeUndefined();
    // Curated shapes keep their own positions.
    expect(chordPositions("guitar.c-major")[0].id).toBe("guitar.c-major");
    // Another tuning: the same chord voiced for that tuning's strings.
    const lowG = tuningById("ukulele.low-g")!;
    const onLowG = generatedPositions(id, lowG);
    expect(onLowG[0].tuningId).toBe("ukulele.low-g");
    for (const p of onLowG)
      expect(
        new Set(p.frets.flatMap((f, i) => (f === null ? [] : [(lowG.openStrings[i] + f) % 12]))),
      ).toEqual(new Set([10, 2, 5]));
  });
});

import { afterEach, describe, expect, it } from "vite-plus/test";
import { setNoteNaming } from "@repo/music-core";
import { aeroSpeller, fingeringWords, namedNotes, namedKeys } from "./names";

describe("aeroSpeller", () => {
  it("spells a heard note by the exercise key", () => {
    expect(aeroSpeller(0, 0)(61)).toBe("C#4");
    expect(aeroSpeller(0, -5)(61)).toBe("Db4");
    expect(aeroSpeller(0, 2)(70)).toBe("A#4");
  });
  it("uses the chart's spelling when the exercise has no key", () => {
    expect(aeroSpeller(0, null)(63)).toBe("Eb4");
    expect(aeroSpeller(0, null)(61)).toBe("C#4");
  });
  it("names the written note for a transposing reading key", () => {
    // Bb reading: concert Bb3 is written C4.
    expect(aeroSpeller(2, 0)(58)).toBe("C4");
  });
});

describe("fingeringWords", () => {
  it("lists the keys of a charted note", () => {
    expect(fingeringWords(67)).toBe("1 (left index), 2 (left middle), 3 (left ring)");
  });
  it("is null outside the chart", () => {
    expect(fingeringWords(20)).toBeNull();
  });
});

describe("named labels", () => {
  afterEach(() => setNoteNaming("letters"));

  it("leaves letters as they are", () => {
    expect(namedNotes("C#5 to D5")).toBe("C#5 to D5");
    expect(fingeringWords(86)).toContain("palm D");
  });
  it("names the notes in a label and in a key's words in fixed do", () => {
    setNoteNaming("fixed");
    expect(namedNotes("G4 A4")).toBe("Sol4 La4");
    expect(namedNotes("De C#5 a D5")).toBe("De Do#5 a Re5");
    expect(namedNotes("meñique izquierdo, de B a Bb")).toBe("meñique izquierdo, de Si a Sib");
    expect(namedKeys("Alto Eb")).toBe("Alto Mib");
    expect(fingeringWords(86)).toContain("palm Re");
    // The labels printed on the instrument stay.
    expect(fingeringWords(59)).toContain("B (left pinky)");
  });
});

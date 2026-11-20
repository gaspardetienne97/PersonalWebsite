import { describe, expect, it } from "vite-plus/test";
import { aeroSpeller, fingeringWords } from "./names";

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

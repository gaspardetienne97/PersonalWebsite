import { describe, expect, it } from "vitest";
import { spellDegree } from "./degrees";

describe("spellDegree", () => {
  it("spells degree 4 of Gb major as Cb, an octave number above the B it sounds as", () => {
    expect(spellDegree(59, 54, "4")).toBe("Cb4");
    expect(spellDegree(54, 54, "1")).toBe("Gb3");
    expect(spellDegree(65, 54, "7")).toBe("F4");
  });
  it("keeps plain keys plain and spells chromatic degrees by their letter", () => {
    expect(spellDegree(64, 60, "3")).toBe("E4");
    expect(spellDegree(63, 60, "b3")).toBe("Eb4");
    expect(spellDegree(66, 60, "#4")).toBe("F#4");
    expect(spellDegree(73, 71, "2")).toBe("C#5");
  });
});

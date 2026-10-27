import { describe, expect, it } from "vitest";
import { pcOf } from "./notes";
import {
  CHOICE_NAMES,
  choicesForKey,
  diatonicNames,
  enharmonicEqual,
  KEY_SIGNATURES,
  keyByName,
  spellInKey,
} from "./spelling";

describe("spelling", () => {
  it("has the selectable keys with their signatures", () => {
    expect(KEY_SIGNATURES.map((k) => `${k.name}:${k.fifths}`)).toEqual([
      "C major:0",
      "G major:1",
      "F major:-1",
      "D major:2",
      "Bb major:-2",
      "A minor:0",
      "E minor:1",
      "D minor:-1",
      "A major:3",
      "E major:4",
      "Eb major:-3",
      "Ab major:-4",
      "B minor:2",
      "F# minor:3",
      "C# minor:4",
      "G minor:-2",
      "C minor:-3",
      "F minor:-4",
    ]);
    expect(CHOICE_NAMES).toEqual([
      "C",
      "C#",
      "Db",
      "D",
      "D#",
      "Eb",
      "E",
      "F",
      "F#",
      "Gb",
      "G",
      "G#",
      "Ab",
      "A",
      "A#",
      "Bb",
      "B",
    ]);
  });

  it("spells diatonic notes by the signature", () => {
    expect(diatonicNames(keyByName("Bb major")!)).toEqual(["C", "D", "Eb", "F", "G", "A", "Bb"]);
    expect(diatonicNames(keyByName("D major")!)).toEqual(["C#", "D", "E", "F#", "G", "A", "B"]);
    expect(spellInKey(70, keyByName("F major")!)).toBe("Bb");
    expect(spellInKey(66, keyByName("E minor")!)).toBe("F#");
  });

  it("spells a minor key's raised leading tone as a sharp", () => {
    expect(spellInKey(68, keyByName("A minor")!)).toBe("G#");
    expect(spellInKey(63, keyByName("E minor")!)).toBe("D#");
    expect(spellInKey(61, keyByName("D minor")!)).toBe("C#");
    expect(spellInKey(72, keyByName("C# minor")!)).toBe("B#");
    expect(spellInKey(64, keyByName("F minor")!)).toBe("E");
    expect(spellInKey(71, keyByName("C minor")!)).toBe("B");
  });

  it("offers 12 choices per key, all from the 17-name list, one per pitch class", () => {
    for (const k of KEY_SIGNATURES) {
      const choices = choicesForKey(k);
      expect(
        choices.every((c) => (CHOICE_NAMES as readonly string[]).includes(c)),
        k.name,
      ).toBe(true);
      expect(new Set(choices.map((c) => pcOf(c))).size).toBe(12);
    }
    expect(choicesForKey(keyByName("F major")!)).toContain("Bb");
    expect(choicesForKey(keyByName("F major")!)).not.toContain("A#");
  });

  it("compares answers enharmonically", () => {
    expect(enharmonicEqual("C#", "Db")).toBe(true);
    expect(enharmonicEqual("C-E-G", "C-Fb-G")).toBe(true);
    expect(enharmonicEqual("C-E-G", "C-E")).toBe(false);
    expect(enharmonicEqual("C", "D")).toBe(false);
    expect(enharmonicEqual("C", "")).toBe(false);
  });
});

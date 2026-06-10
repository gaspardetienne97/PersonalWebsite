import { describe, expect, test } from "vitest";

import {
  AEROPHONE_FINGERINGS,
  AEROPHONE_KEYS,
  AEROPHONE_RANGE,
  aerophoneChart,
  fingeringForMidi,
  type AerophoneKeyId,
} from "./index";

describe("fingeringForMidi", () => {
  test("flags out-of-range notes with no keys", () => {
    expect(fingeringForMidi(AEROPHONE_RANGE.lowestMidi - 1).inRange).toBe(false);
    expect(fingeringForMidi(AEROPHONE_RANGE.highestMidi + 1)).toMatchObject({
      inRange: false,
      keys: [],
      octave: false,
    });
  });

  test("returns the charted main-key fingerings (sax descent)", () => {
    // G4/A4/B4 are unambiguous anchors on the chart: 123 → 12 → 1.
    expect(fingeringForMidi(67).keys).toEqual(["k1", "k2", "k3"]); // G4
    expect(fingeringForMidi(69).keys).toEqual(["k1", "k2"]); // A4
    expect(fingeringForMidi(71).keys).toEqual(["k1"]); // B4
  });

  test("engages the octave key in the upper register only", () => {
    expect(fingeringForMidi(62).octave).toBe(false); // D4
    expect(fingeringForMidi(74).octave).toBe(true); // D5
    // D5 mirrors D4's main keys plus the octave key.
    expect(fingeringForMidi(74).keys).toEqual(fingeringForMidi(62).keys);
  });

  test("returns a fresh keys array (callers can mutate safely)", () => {
    const a = fingeringForMidi(67);
    a.keys.push("k6");
    expect(fingeringForMidi(67).keys).toEqual(["k1", "k2", "k3"]);
  });
});

describe("aerophoneChart", () => {
  test("covers every note in the charted range, ascending", () => {
    const chart = aerophoneChart();
    expect(chart).toHaveLength(AEROPHONE_RANGE.highestMidi - AEROPHONE_RANGE.lowestMidi + 1);
    expect(chart[0]?.midi).toBe(AEROPHONE_RANGE.lowestMidi);
    expect(chart.at(-1)?.midi).toBe(AEROPHONE_RANGE.highestMidi);
    expect(chart.every((f) => f.inRange)).toBe(true);
  });
});

describe("data integrity", () => {
  const KNOWN: ReadonlySet<AerophoneKeyId> = new Set(AEROPHONE_KEYS.map((k) => k.id));

  test("every fingering references only known keys", () => {
    for (const [midi, entry] of Object.entries(AEROPHONE_FINGERINGS)) {
      for (const key of entry.keys) {
        expect(KNOWN.has(key), `note ${midi} references unknown key ${key}`).toBe(true);
      }
    }
  });

  test("key layout ids are unique", () => {
    expect(KNOWN.size).toBe(AEROPHONE_KEYS.length);
  });
});

import { describe, expect, it } from "vite-plus/test";
import { SCALE_DATA } from "../data";
import { fingeringForOctaves, SCALE_FINGERINGS, scaleFingerMap } from "./piano-fingering";

const BLACK = new Set([1, 3, 6, 8, 10]);

describe("piano scale fingering", () => {
  it("every key and kind is playable: no thumb on a black key, no finger twice in a row", () => {
    for (const [kind, byTonic] of Object.entries(SCALE_FINGERINGS)) {
      const steps = (SCALE_DATA.semitonesByKind as Record<string, number[]>)[kind];
      for (let pc = 0; pc < 12; pc++) {
        for (const hand of ["rh", "lh"] as const) {
          const fingers = fingeringForOctaves(byTonic[pc], hand, 2);
          const pitches = [...steps.slice(0, 7), ...steps.slice(0, 7).map((s) => s + 12), 24].map(
            (s) => pc + s,
          );
          expect(fingers, `${kind} ${pc} ${hand}`).toHaveLength(15);
          fingers.forEach((f, i) => {
            if (f === 1)
              expect(
                BLACK.has(pitches[i] % 12),
                `${kind} ${pc} ${hand} note ${i}: thumb on a black key`,
              ).toBe(false);
            if (i)
              expect(f, `${kind} ${pc} ${hand} note ${i}: same finger twice`).not.toBe(
                fingers[i - 1],
              );
          });
        }
      }
    }
  });

  it("C major two octaves reads as the books print it", () => {
    expect(fingeringForOctaves(SCALE_FINGERINGS.major[0], "rh", 2)).toEqual([
      1, 2, 3, 1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 4, 5,
    ]);
    expect(fingeringForOctaves(SCALE_FINGERINGS.major[0], "lh", 2)).toEqual([
      5, 4, 3, 2, 1, 3, 2, 1, 4, 3, 2, 1, 3, 2, 1,
    ]);
  });

  it("maps a line's pitches to fingers, a pentascale 1 to 5, and none for kinds without a standard", () => {
    const g = scaleFingerMap("major", 55, "rh", 1)!;
    expect([55, 57, 59, 60, 62, 64, 66, 67].map((m) => g.get(m))).toEqual([1, 2, 3, 1, 2, 3, 4, 5]);
    const penta = scaleFingerMap("major", 48, "lh", "pentascale")!;
    expect([48, 50, 52, 53, 55].map((m) => penta.get(m))).toEqual([5, 4, 3, 2, 1]);
    expect(scaleFingerMap("dorian", 60, "rh", 1)).toBeNull();
  });
});

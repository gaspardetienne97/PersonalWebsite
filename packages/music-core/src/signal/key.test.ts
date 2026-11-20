import { describe, expect, it } from "vite-plus/test";
import { homeTonics, rankKeys, regionChroma } from "./key";

const RATE = 22050;
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

/** Chords one after another, half a second each, as summed sines. */
function chords(list: number[][], seconds = 0.5): Float32Array {
  const per = Math.round(seconds * RATE);
  const out = new Float32Array(per * list.length);
  list.forEach((ch, k) => {
    for (let i = 0; i < per; i++)
      for (const m of ch)
        out[k * per + i] += (0.2 * Math.sin((2 * Math.PI * hz(m) * i) / RATE)) / ch.length;
  });
  return out;
}

describe("key finding", () => {
  it("hears C major in I-IV-V-I, and the relative is not close", () => {
    const c = regionChroma(
      chords(
        [
          [48, 60, 64, 67],
          [53, 60, 65, 69],
          [55, 59, 62, 67],
          [48, 60, 64, 67],
        ].flatMap((x) => [x, x]),
      ),
      RATE,
    );
    const ranked = rankKeys(c);
    expect(ranked[0]).toMatchObject({ tonicPc: 0, minor: false });
    expect(homeTonics(ranked)).toContain(0);
  });

  it("hears A minor in i-iv-V-i", () => {
    const c = regionChroma(
      chords(
        [
          [45, 57, 60, 64],
          [50, 62, 65, 69],
          [52, 56, 59, 64],
          [45, 57, 60, 64],
        ].flatMap((x) => [x, x]),
      ),
      RATE,
    );
    expect(homeTonics(rankKeys(c))).toContain(9);
  });

  it("takes only the region asked for and skips silence", () => {
    const g = chords(
      [
        [43, 55, 59, 62],
        [48, 60, 64, 67],
        [50, 62, 66, 69],
        [43, 55, 59, 62],
      ].flatMap((x) => [x, x]),
    );
    const padded = new Float32Array(g.length + RATE * 2);
    padded.set(g, RATE * 2);
    expect(rankKeys(regionChroma(padded, RATE, 2))[0]).toMatchObject({ tonicPc: 7, minor: false });
    expect(regionChroma(padded, RATE, 0, 1.5).every((v) => v === 0)).toBe(true);
  });
});

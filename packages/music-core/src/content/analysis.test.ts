import { describe, expect, it } from "vite-plus/test";
import { analysisSheet, ANALYSIS_TUNES, FUNCTIONS } from "./analysis";
import { TUNES } from "./tunes";

const sheet = (id: string) =>
  analysisSheet(TUNES.find((t) => t.id === id)!).map((c) => `${c.symbol} ${c.key} ${c.fn}`);

// Checked by hand against published analyses (the Real Book changes as the tune player has them).
describe("lead-sheet analysis by rule", () => {
  it("All the Things You Are: vi ii V I IV through Ab, C, Eb, G and E, the bridge's V of vi", () => {
    expect(sheet("tune-all-the-things-you-are")).toEqual([
      "Fm7 Ab vi",
      "Bbm7 Ab ii",
      "Eb7 Ab V",
      "Abmaj7 Ab I",
      "Dbmaj7 Ab IV",
      "Dm7 C ii",
      "G7 C V",
      "Cmaj7 C I",
      "Cm7 Eb vi",
      "Fm7 Eb ii",
      "Bb7 Eb V",
      "Ebmaj7 Eb I",
      "Abmaj7 Ab I",
      "Am7 G ii",
      "D7 G V",
      "Gmaj7 G I",
      "Am7 G ii",
      "D7 G V",
      "Gmaj7 G I",
      "F#m7b5 E iiø",
      "B7 E V",
      "Emaj7 E I",
      "C7#5 Ab V of",
      "Fm7 Ab vi",
      "Bbm7 Ab ii",
      "Eb7 Ab V",
      "Abmaj7 Ab I",
      "Dbmaj7 Ab IV",
      "Dbm7 Ab iv",
      "Cm7 Ab iii",
      "Bdim7 Ab Passing dim",
      "Bbm7 Ab ii",
      "Eb7 Ab V",
      "Abmaj7 Ab I",
      "Gm7b5 Ab Related ii",
      "C7 Ab V of",
    ]);
  });

  it("Autumn Leaves: the relative major and the minor ii-V-i, the last line's V of ii", () => {
    expect(sheet("tune-autumn-leaves").slice(0, 7)).toEqual([
      "Cm7 Bb ii",
      "F7 Bb V",
      "Bbmaj7 Bb I",
      "Ebmaj7 Bb IV",
      "Am7b5 Gm iiø",
      "D7 Gm V",
      "Gm6 Gm i",
    ]);
    expect(sheet("tune-autumn-leaves")).toContain("C7 Eb V of");
  });

  it("names tritone subs, backdoors and ii-Vs left hanging", () => {
    expect(sheet("tune-satin-doll").slice(0, 13)).toEqual([
      "Dm7 C ii",
      "G7 C V",
      "Dm7 C ii",
      "G7 C V",
      "Em7 D ii",
      "A7 D V",
      "Em7 D ii",
      "A7 D V",
      "Am7 G ii",
      "D7 G V",
      "Abm7 C Related ii",
      "Db7 C Tritone sub",
      "Cmaj7 C I",
    ]);
    expect(sheet("tune-just-friends").slice(0, 6)).toEqual([
      "Cmaj7 C I",
      "Cm7 G iv",
      "F7 G Backdoor",
      "Gmaj7 G I",
      "Bbm7 Ab ii",
      "Eb7 Ab V",
    ]);
    expect(sheet("tune-stella-by-starlight")).toContain("Ab7 Bb Backdoor");
  });

  it("Fly Me to the Moon: a ii-V to vi is a related ii and a V of, in C", () => {
    expect(sheet("tune-fly-me-to-the-moon").slice(0, 9)).toEqual([
      "Am7 C vi",
      "Dm7 C ii",
      "G7 C V",
      "Cmaj7 C I",
      "Fmaj7 C IV",
      "Bm7b5 C Related ii",
      "E7 C V of",
      "Am7 C vi",
      "A7 C V of",
    ]);
  });

  it("asks each section once and names every chord of the offered tunes", () => {
    for (const id of ANALYSIS_TUNES) {
      const t = TUNES.find((x) => x.id === id)!;
      const s = analysisSheet(t);
      const distinct = new Set(t.sections!.map((x) => x.label));
      const bars = [...distinct].reduce(
        (n, l) => n + t.sections!.find((x) => x.label === l)!.bars,
        0,
      );
      expect(
        s.reduce((n, c) => n + c.bars, 0),
        id,
      ).toBeCloseTo(bars);
      for (const c of s) expect(FUNCTIONS, `${id} ${c.symbol}`).toContain(c.fn);
      expect(
        s.map((c) => c.fn),
        id,
      ).not.toContain("Other");
    }
  });
});

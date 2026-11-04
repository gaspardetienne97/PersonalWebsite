import { describe, expect, it } from "vitest";
import { CATALOG } from "@repo/music-core/content/catalog";
import { drillPreview } from "./drill-preview";

describe("drill previews", () => {
  it("marks the scale the link asks for on the keys, or on the frets for strings", () => {
    const keys = drillPreview("/music/scales?kind=major&tonic=G4");
    expect(keys).toMatchObject({ kind: "keys", notes: [67, 69, 71, 72, 74, 76, 78, 79] });
    expect(keys.kind === "keys" && keys.caption).toMatch(/^G major/);
    const frets = drillPreview("/music/scales?instrument=ukulele&kind=major");
    expect(frets).toMatchObject({ kind: "frets", strings: 4 });
  });

  it("draws the chord box the link names and the strum's real strokes", () => {
    expect(
      drillPreview("/music/chords?mode=strum&instrument=guitar&shape=guitar.a-major"),
    ).toMatchObject({
      kind: "chord",
      name: expect.stringMatching(/^A/),
    });
    const strum = drillPreview("/music/strum?instrument=guitar&progression=guitar-g-d-em-c");
    expect(strum).toMatchObject({ kind: "rhythm", chords: ["G", "D", "Em", "C"] });
    expect(strum.kind === "rhythm" && strum.hits.every((h) => !!h.stroke)).toBe(true);
  });

  it("follows the instrument: a ukulele fretboard has four strings", () => {
    expect(drillPreview("/music/fretboard?mode=spider", "ukulele")).toMatchObject({
      kind: "frets",
      strings: 4,
    });
    expect(drillPreview("/music/fretboard?mode=spider", "guitar")).toMatchObject({
      kind: "frets",
      strings: 6,
    });
  });

  it("names the interval it draws", () => {
    expect(drillPreview("/music/ear/intervals?intervals=m3,M3")).toMatchObject({
      kind: "keys",
      notes: [60, 64],
    });
  });

  it("draws the mixed ear review instead of the area icon", () => {
    expect(drillPreview("/music/ear/mixed?instrument=voice")).toMatchObject({ kind: "keys" });
  });

  it("has a picture or the area icon for every catalogue drill, and never throws", () => {
    for (const e of CATALOG) expect(() => drillPreview(e.route, "piano")).not.toThrow();
    expect(drillPreview("/music/songs/shelf/guitar/blackbird")).toEqual({ kind: "icon" });
  });
});

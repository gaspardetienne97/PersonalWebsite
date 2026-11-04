import { describe, expect, it } from "vitest";
import { CATALOG } from "@repo/music-core/content/catalog";
import { drillPreview, intervalFrets } from "./drill-preview";

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

  it("draws intervals on the neck for a stringed instrument, both notes named", () => {
    const g = drillPreview("/music/ear/intervals?intervals=P5", "guitar");
    expect(g).toMatchObject({ kind: "frets", strings: 6 });
    if (g.kind !== "frets") return;
    expect(g.dots.map((d) => d.label)).toEqual(["C", "G"]);
    // The C on the A string, fret 3; G a fifth up, inside the drawn window.
    expect(g.dots[0]).toMatchObject({ string: 5, fret: 3 });
    for (const d of g.dots) expect(d.fret >= g.from && d.fret <= g.to).toBe(true);
    for (const semis of [1, 4, 7, 12]) {
      const f = intervalFrets("ukulele", semis);
      expect(f.top.fret).toBeGreaterThanOrEqual(f.from);
      expect(f.top.fret).toBeLessThanOrEqual(f.to);
    }
  });

  it("puts scale degrees on the keys, home numbered 1", () => {
    expect(drillPreview("/music/ear/scale-degrees?level=anchor")).toMatchObject({
      kind: "keys",
      notes: [60, 67],
      labels: { 60: "1", 67: "5" },
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

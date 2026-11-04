import { describe, expect, it } from "vitest";
import type { NoteEvent } from "@repo/music-core";
import { expandRhythm, RHYTHM_PATTERNS, rhythmPattern } from "@repo/music-core/content/rhythm";
import { gradePattern } from "@repo/music-core/scoring/rhythm";
import {
  beatsPerRow,
  cellVerdict,
  countInText,
  demoNotes,
  lengthText,
  midiHits,
  readPatterns,
  signedMs,
  voicing,
} from "./rhythm";
import { rhythmLine } from "./notation";

const on = (at: number, midi: number, instrument?: NoteEvent["instrument"]): NoteEvent => ({
  kind: "noteon",
  midi,
  at,
  velocity: 1,
  source: "midi",
  confidence: 1,
  instrument,
});

describe("rhythm helpers", () => {
  it("merges a strummed chord into one hit with its pitch classes", () => {
    const hits = midiHits([on(1000, 55), on(1010, 59), on(1020, 62), on(1500, 60)]);
    expect(hits).toHaveLength(2);
    expect(hits[0].pcs!.sort()).toEqual([11, 2, 7].sort());
  });

  it("never treats MPC pad numbers as pitch", () => {
    expect(midiHits([on(0, 36, "mpc")])[0].pcs).toBeUndefined();
  });

  it("a keyboard strum of the right chords grades the chords; taps alone are timing only", () => {
    const def = rhythmPattern("guitar-four-on-the-floor")!;
    const plan = expandRhythm(def, { bpm: 100 });
    const strum = plan.events.flatMap((e) =>
      voicing(plan.chords.find((c) => e.atMs >= c.startMs && e.atMs < c.endMs)!.pitchClasses).map(
        (m, k) => on(e.atMs + k * 5, m),
      ),
    );
    const pitched = gradePattern(def, midiHits(strum), { startAt: 0, beatMs: plan.beatMs });
    expect(pitched.chords?.every((c) => c.held)).toBe(true);
    const taps = gradePattern(
      def,
      plan.events.map((e) => ({ at: e.atMs })),
      { startAt: 0, beatMs: plan.beatMs },
    );
    expect(taps.chords).toBeNull();
    expect(taps.notMeasured).toEqual(["chords"]);
  });

  it("lists the rhythms and only this instrument's strums, never the plain pulse", () => {
    const guitar = readPatterns("guitar");
    expect(guitar.map((p) => p.value)).not.toContain("quarter-pulse");
    expect(guitar.filter((p) => p.group === "Guitar strums").map((p) => p.value)).toEqual([
      "guitar-four-on-the-floor",
      "guitar-island-strum",
      "guitar-old-faithful",
      "guitar-backbeat-chuck",
    ]);
    expect(
      readPatterns("ukulele").filter((p) => p.group === "Ukulele strums").length,
    ).toBeGreaterThanOrEqual(14);
    expect(guitar.find((p) => p.value === "guitar-old-faithful")!.label).toMatch(/^Old Faithful/);
    expect(readPatterns("piano").every((p) => p.group === "Rhythms")).toBe(true);
    expect(readPatterns("piano")).toHaveLength(8);
  });

  it("demo lights every event once and keeps the silent bar silent", () => {
    const plan = expandRhythm(rhythmPattern("gap-click-1-on-1-off")!, { bpm: 120 });
    const notes = demoNotes(plan);
    expect(new Set(notes.filter((n) => n.event >= 0).map((n) => n.event)).size).toBe(
      plan.events.length,
    );
    expect(notes.filter((n) => n.voice === "click").every((n) => n.time < 2)).toBe(true);
  });
});

describe("rhythm copy and layout", () => {
  it("signs each offset, and says 0 only when it rounds to 0", () => {
    expect(signedMs(4.4)).toBe("+4 ms");
    expect(signedMs(-7)).toBe("−7 ms");
    expect(signedMs(0.3)).toBe("0 ms");
    expect(signedMs(-0.4)).toBe("0 ms");
  });

  it("says the length as the grid draws it, and the count-in apart", () => {
    expect(lengthText(16, 4)).toBe("4 bars of 4");
    expect(lengthText(4, 4)).toBe("1 bar of 4");
    expect(lengthText(6, 4)).toBe("6 beats");
    expect(countInText(1)).toBe("1 bar count-in");
    expect(countInText(2)).toBe("2 bars count-in");
    expect(countInText(0)).toBe("no count-in");
  });

  it("grades a written cell", () => {
    expect(cellVerdict(true, true)).toBe("right");
    expect(cellVerdict(false, true)).toBe("extra");
    expect(cellVerdict(true, false)).toBe("missed");
    expect(cellVerdict(false, false)).toBeNull();
  });

  it("keeps dictation cells 44 px wide: a whole bar on a laptop, half a bar on a phone", () => {
    expect(beatsPerRow(0, 2, 4)).toBe(4);
    expect(beatsPerRow(1000, 2, 4, 64)).toBe(4);
    expect(beatsPerRow(334, 2, 4)).toBe(2);
    expect(beatsPerRow(334, 2, 4, 64)).toBe(2);
    expect(beatsPerRow(334, 3, 4)).toBe(2);
    expect(beatsPerRow(334, 4, 4, 64)).toBe(1);
    // Three beats a bar never splits into a share that leaves a beat over.
    expect(beatsPerRow(334, 2, 3)).toBe(3);
    expect(beatsPerRow(200, 2, 3)).toBe(1);
  });
});

describe("rhythm notation", () => {
  const VALUE: Record<string, number> = { w: 4, h: 2, q: 1, "8": 0.5, "16": 0.25, "32": 0.125 };
  /** A tick's length from its written value: dots, and three in the time of two in a triplet. */
  const length = (t: { vf: string; dots: number; tuplet?: number }) =>
    VALUE[t.vf] * (t.dots ? 1.5 : 1) * (t.tuplet === undefined ? 1 : 2 / 3);

  it.each(RHYTHM_PATTERNS.map((p) => [p.id, p] as const))("%s engraves bar by bar", (_, p) => {
    const line = rhythmLine(p);
    expect(line.bars).toHaveLength(p.defaultBars);
    expect(line.notes).toHaveLength(p.events.length);
    const barLen = (line.meter.beats * 4) / line.meter.beatUnit;
    for (const bar of line.ticks) {
      // Every value is a real note value, and the bar adds up to the time signature.
      for (const t of bar) expect(VALUE[t.vf], t.vf).toBeDefined();
      expect(bar.reduce((a, t) => a + length(t), 0)).toBeCloseTo(barLen, 6);
    }
    const ticks = line.ticks.flat();
    // One attack per event, in order, at its written place; tied pieces add up to its length.
    const attacks = ticks.filter((t) => t.attack);
    expect(attacks.map((t) => t.group)).toEqual(p.events.map((_, i) => i));
    line.notes.forEach((n, i) => {
      const at = ticks.findIndex((t) => t.group === i);
      expect(ticks[at].start).toBeCloseTo(n.startBeat, 6);
      let held = 0;
      for (let k = at; k < ticks.length; k++) {
        held += length(ticks[k]);
        if (!ticks[k].tieNext) break;
      }
      expect(held).toBeCloseTo(n.durationBeats, 6);
    });
    // A written rest is silent on the staff.
    for (const r of p.rests) {
      const from = line.written(r.startBeat);
      expect(ticks.some((t) => !t.midis.length && Math.abs(t.start - from) < 1e-6)).toBe(true);
    }
  });

  it("writes 6/8 in eighths, swing as straight eighths, and 4/4 triplets as triplets", () => {
    const six = rhythmLine(rhythmPattern("ukulele-six-eight")!);
    expect(six.meter).toEqual({ beats: 6, beatUnit: 8 });
    expect(six.ticks[0].map((t) => t.vf)).toEqual(["8", "8", "8", "8", "8", "8"]);
    expect(six.ticks[0].some((t) => t.tuplet !== undefined)).toBe(false);
    const swing = rhythmLine(rhythmPattern("swing-eighths")!);
    expect(swing.swing).toBe(true);
    expect(swing.notes.map((n) => n.startBeat)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
    expect(swing.written(2 / 3)).toBeCloseTo(0.5, 6);
    const triplets = rhythmLine(rhythmPattern("triplets")!);
    expect(triplets.meter).toEqual({ beats: 4, beatUnit: 4 });
    expect(triplets.ticks[0].every((t) => t.tuplet !== undefined)).toBe(true);
  });

  it("ties a dotted quarter over the bar line", () => {
    const line = rhythmLine(rhythmPattern("dotted-quarters")!);
    const last = line.ticks[0].at(-1)!;
    expect([last.vf, last.tieNext]).toEqual(["q", true]);
    expect(line.ticks[1][0]).toMatchObject({ vf: "8", attack: false });
  });
});

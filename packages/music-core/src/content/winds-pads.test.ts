import { describe, expect, it } from "vite-plus/test";
import {
  AEROPHONE_CHART,
  AEROPHONE_KEYS,
  drumKey,
  hitDrumKey,
  scoreDrumPad,
  FINGERING_LESSONS,
  fingeringSlip,
  lessonSequence,
  lessonLine,
  articulationTargets,
  fingeringFor,
  GROOVE_PAD_RANGE,
  grooveTargets,
  LANDING_INTERVALS,
  landingTarget,
  rudimentHits,
  rudimentPerBeat,
  rudimentSkills,
  RUDIMENTS,
  SUBDIVISION_NAMES,
} from "./winds-pads";

describe("aerophone", () => {
  it("charts Bb3..F#6 with the verified set flagged", () => {
    expect(AEROPHONE_CHART.map((c) => c.midi)).toEqual(
      Array.from({ length: 33 }, (_, i) => 58 + i),
    );
    expect(AEROPHONE_CHART.filter((c) => c.verified).map((c) => c.name)).toEqual([
      "C4",
      "D4",
      "E4",
      "F4",
      "G4",
      "A4",
      "B4",
      "C#5",
      "D5",
      "Eb5",
    ]);
    expect(fingeringFor(66)).toEqual({
      midi: 66,
      name: "F#4",
      keys: ["k1", "k2", "k3", "k5"],
      octave: false,
      verified: false,
    });
    expect(fingeringFor(74)?.octave).toBe(true);
    expect(fingeringFor(73)?.keys).toEqual([]);
    expect(fingeringFor(57)).toBeUndefined();
    // Middle C is key 2 alone; G5 is G4 with the octave key.
    expect(fingeringFor(72)?.keys).toEqual(["k2"]);
    expect(fingeringFor(79)).toMatchObject({ keys: ["k1", "k2", "k3"], octave: true });
    // The palm keys: D6 is palm D with the octave key, F#6 adds the high F# key.
    expect(fingeringFor(86)).toMatchObject({
      name: "D6",
      keys: ["C1"],
      octave: true,
      verified: false,
    });
    expect(fingeringFor(90)?.keys).toEqual(["C1", "C2", "C3", "C4", "C5"]);
    expect(fingeringFor(91)).toBeUndefined();
    expect(fingeringSlip(86, 87)?.text).toBe("Lift C2 (palm Eb)");
  });

  it("every chart key is a Roland key, and the lessons stay in the chart", () => {
    const ids = new Set(AEROPHONE_KEYS.map((k) => k.id));
    for (const c of AEROPHONE_CHART) for (const k of c.keys) expect(ids.has(k), k).toBe(true);
    expect(FINGERING_LESSONS).toHaveLength(14);
    for (const l of FINGERING_LESSONS)
      for (const n of lessonLine(l)) expect(fingeringFor(n), `${l.id} ${n}`).toBeDefined();
    expect(lessonSequence([67, 69, 71])).toEqual([67, 69, 71, 69, 67]);
    // A chosen set: 20 cards, at least half of them F#4 or Bb4.
    const fsBb = lessonLine(FINGERING_LESSONS.find((l) => l.id === "fs-bb")!);
    expect(fsBb).toHaveLength(20);
    expect(fsBb.filter((m) => m === 66 || m === 70).length).toBeGreaterThanOrEqual(10);
  });

  it("names the slip between a played note and the target", () => {
    // G#4 for G4: the G# key went down.
    expect(fingeringSlip(67, 68)?.text).toBe("Lift G# (left pinky)");
    // A4 for G4: key 3 is missing.
    expect(fingeringSlip(67, 69)?.text).toBe("Press 3 (left ring)");
    // D5 for D4: the octave key.
    expect(fingeringSlip(62, 74)?.text).toBe("Lift +1 octave (left thumb)");
    expect(fingeringSlip(67, 67)).toBeNull();
    expect(fingeringSlip(67, 40)).toBeNull();
  });

  it("lands intervals inside the chart only", () => {
    expect(LANDING_INTERVALS.map((i) => i.semitones)).toEqual([5, 7, 12, 4, 3]);
    expect(landingTarget(67, 5, "up")).toBe(72);
    expect(landingTarget(67, 12, "down")).toBeUndefined();
    const t = articulationTargets({ midi: 67, bpm: 90, count: 8, style: "staccato" });
    expect(t).toHaveLength(8);
    expect(t[1].atMs).toBeCloseTo(666.667, 2);
    expect(t[0].soundingMs).toBeCloseTo(666.667 * 0.35, 2);
  });
});

describe("MPC rudiments", () => {
  it("alternates two pads on the chosen grid", () => {
    const hits = rudimentHits({ patternId: "single-strokes", subdivision: 2, hits: 16, bpm: 60 });
    expect(hits).toHaveLength(16);
    expect(hits.map((h) => h.atMs)).toEqual(Array.from({ length: 16 }, (_, i) => i * 500));
    expect(hits.slice(0, 4).map((h) => h.pad)).toEqual([36, 38, 36, 38]);
    const para = rudimentHits({
      patternId: "paradiddle",
      subdivision: 4,
      hits: 8,
      bpm: 60,
      pads: [40, 41],
    });
    expect(para.map((h) => h.hand[0]).join("")).toBe("lrllrlrr");
  });

  it("lets a pattern's own grid win and clamps tempo 30..240", () => {
    expect(
      rudimentHits({ patternId: "single-16ths", subdivision: 2, hits: 8, bpm: 60 })[1].atMs,
    ).toBe(250);
    expect(
      rudimentHits({ patternId: "triple-strokes", subdivision: 4, hits: 8, bpm: 60 })[1].atMs,
    ).toBeCloseTo(333.333, 2);
    expect(
      rudimentHits({ patternId: "single-strokes", subdivision: 2, hits: 8, bpm: 300 })[1].atMs,
    ).toBe(125);
    expect(
      rudimentHits({ patternId: "single-strokes", subdivision: 2, hits: 8, bpm: 10 })[1].atMs,
    ).toBe(1000);
    expect(() =>
      rudimentHits({
        patternId: "single-strokes",
        subdivision: 2,
        hits: 8,
        bpm: 60,
        pads: [36, 36],
      }),
    ).toThrow();
  });

  it("adds flam grace notes 30 ms early on the other pad", () => {
    const hits = rudimentHits({ patternId: "flam", subdivision: 2, hits: 8, bpm: 60 });
    expect(hits.filter((h) => !h.grace)).toHaveLength(8);
    expect(hits.slice(0, 2)).toEqual([
      { index: -1, atMs: -30, hand: "right", pad: 38, accent: false, grace: true },
      { index: 0, atMs: 0, hand: "left", pad: 36, accent: false, grace: false },
    ]);
  });

  it("moves the accent one position each beat with velocity bands", () => {
    const hits = rudimentHits({ patternId: "moving-accent", subdivision: 4, hits: 16, bpm: 60 });
    expect(hits.flatMap((h, i) => (h.accent ? [i] : []))).toEqual([0, 5, 10, 15]);
    expect(hits[0].velocityBand).toEqual([0.75, 1]);
    expect(hits[1].velocityBand).toEqual([0.25, 0.7]);
    expect(
      rudimentHits({ patternId: "single-strokes", subdivision: 2, hits: 8, bpm: 60 })[0]
        .velocityBand,
    ).toBeUndefined();
  });
});

describe("MPC grooves", () => {
  it("expands every catalog groove with the authored counts", () => {
    const count = (id: string) => grooveTargets(id, 90).targets.length;
    expect(
      ["backbeat", "eighth-hats", "syncopated", "boom-bap-2bar", "turnaround-fill"].map(count),
    ).toEqual([4, 12, 13, 25, 52]);
    expect(GROOVE_PAD_RANGE).toEqual([35, 51]);
  });

  it("carries voice, pad, accent and section per target", () => {
    const { targets, matchWindowMs, lengthMs } = grooveTargets("turnaround-fill", 90);
    expect(matchWindowMs).toBeCloseTo(666.667 / 8, 2);
    expect(lengthMs).toBeCloseTo(16 * 666.667, 1);
    const fill = targets.filter((t) => t.section === "fill");
    expect(fill).toHaveLength(15);
    expect(fill.at(-1)).toMatchObject({ beat: 16, voice: "kick", pad: 36, bar: 4 });
    expect(targets.find((t) => t.voice === "perc")).toMatchObject({
      pad: 39,
      accent: true,
      beat: 14,
    });
    expect(targets.filter((t) => t.bar === 1)).toHaveLength(13);
    expect(
      grooveTargets("boom-bap-2bar", 60).targets.find((t) => t.voice === "openhat"),
    ).toMatchObject({ pad: 46, atMs: 3500 });
    expect(grooveTargets("backbeat", 60).matchWindowMs).toBe(125);
    expect(grooveTargets("backbeat", 20).matchWindowMs).toBe(180);
  });
});

describe("finger-drumming rudiments", () => {
  it("times every rudiment on a named grid: its own, a pyramid's closest spacing, else the chosen one", () => {
    for (const p of RUDIMENTS) expect(SUBDIVISION_NAMES[rudimentPerBeat(p, 3)], p.id).toBeDefined();
    expect(
      rudimentPerBeat(
        RUDIMENTS.find((p) => p.id === "pyramid")!,
        2,
      ),
    ).toBe(4);
    expect(
      rudimentPerBeat(
        RUDIMENTS.find((p) => p.id === "roll-32")!,
        2,
      ),
    ).toBe(8);
    expect(
      rudimentPerBeat(
        RUDIMENTS.find((p) => p.id === "single-strokes")!,
        3,
      ),
    ).toBe(3);
    expect(SUBDIVISION_NAMES[6]).toBe("sixteenth triplets");
  });

  it("rolls two fingers on one pad, at sixteenths, thirty-seconds and sixteenth triplets", () => {
    const roll = rudimentHits({
      patternId: "roll-32",
      subdivision: 2,
      hits: 8,
      bpm: 120,
      pads: [36, 42],
    });
    expect(new Set(roll.map((h) => h.pad))).toEqual(new Set([42]));
    expect(roll[1].atMs).toBeCloseTo(62.5);
    const t = rudimentHits({ patternId: "roll-16t", subdivision: 2, hits: 6, bpm: 120 });
    expect(t[5].atMs).toBeCloseTo((5 * 500) / 6);
    expect(rudimentSkills("finger-roll")).toContain("technique.mpc.rolls");
  });

  it("walks the pyramid: one note in a beat, then two, three, four", () => {
    const p = rudimentHits({ patternId: "pyramid", subdivision: 2, hits: 10, bpm: 60 });
    expect(p.map((h) => Math.round(h.atMs))).toEqual([
      0, 1000, 1500, 2000, 2333, 2667, 3000, 3250, 3500, 3750,
    ]);
  });

  it("marks accents and taps with velocity bands", () => {
    const a = rudimentHits({ patternId: "accents-ghosts", subdivision: 4, hits: 8, bpm: 90 });
    expect(a.map((h) => h.accent)).toEqual([true, false, false, false, true, false, false, false]);
    expect(a.every((h) => h.velocityBand)).toBe(true);
    const six = rudimentHits({ patternId: "six-stroke", subdivision: 2, hits: 6, bpm: 90 });
    expect(six.map((h) => h.hand[0]).join("")).toBe("rllrrl");
    expect(six.map((h) => h.accent)).toEqual([true, false, false, false, false, true]);
  });
});

describe("drum parts in songs", () => {
  const counts = (gm: number, pad: number) => drumKey(gm) === hitDrumKey(pad);
  it("takes any hat for a hat, and kick and snare exactly", () => {
    expect(counts(42, 46)).toBe(true); // open hat pad for a closed hat
    expect(counts(46, 44)).toBe(true);
    expect(counts(36, 36)).toBe(true);
    expect(counts(35, 36)).toBe(true); // GM's two bass drums are the one kick
    expect(counts(38, 38)).toBe(true);
    expect(counts(40, 38)).toBe(true); // electric snare
    expect(counts(36, 38)).toBe(false);
    expect(counts(38, 37)).toBe(false); // the rim is not the snare
    expect(counts(42, 38)).toBe(false);
  });

  it("folds the toms the kit lacks onto its three, and keeps its cowbell on 47", () => {
    expect(counts(43, 41)).toBe(true);
    expect(counts(47, 45)).toBe(true);
    expect(counts(50, 48)).toBe(true);
    expect(counts(47, 47)).toBe(false); // pad 47 is the kit's cowbell, not GM's tom
    expect(counts(56, 47)).toBe(true);
    expect(counts(41, 48)).toBe(false);
  });

  it("matches nothing for a note that is no drum, and plays each GM drum on its kit pad", () => {
    expect([36, 38, 42, 46, 47, 56].map(drumKey)).not.toContain(hitDrumKey(60));
    expect([36, 42, 46, 47, 56, 50].map(scoreDrumPad)).toEqual([36, 42, 46, 45, 47, 48]);
  });
});

describe("singles in 5 and 7", () => {
  it("accents 3 + 2 and 2 + 2 + 3 on alternating hands", () => {
    const five = rudimentHits({ patternId: "fives", subdivision: 2, hits: 10, bpm: 100 });
    expect(five.map((h) => (h.accent ? "A" : "-")).join("")).toBe("A--A-A--A-");
    expect(five.map((h) => h.hand[0]).join("")).toBe("rlrlrlrlrl");
    const seven = rudimentHits({ patternId: "sevens", subdivision: 2, hits: 16, bpm: 100 });
    expect(seven.map((h) => (h.accent ? "A" : "-")).join("")).toBe("A-A-A--A-A-A--A-");
    expect(seven.every((h) => h.velocityBand)).toBe(true);
  });
});

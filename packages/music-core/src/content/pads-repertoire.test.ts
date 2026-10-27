import { describe, expect, it } from "vitest";
import { GROOVE_VOICES, grooveTargetsFor } from "./winds-pads";
import { gradeGroove, type GrooveResult } from "../scoring/pads";
import {
  closestGapMs,
  gradeTier,
  measuredSwing,
  PAD_LEVELS,
  PAD_REPERTOIRE,
  repertoireFor,
  TIERS,
} from "./pads-repertoire";

describe("finger-drumming repertoire", () => {
  it("covers eight levels, every groove on known voices, no two hits on one pad at once", () => {
    expect(PAD_LEVELS.map((l) => l.level)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new Set(PAD_REPERTOIRE.map((r) => r.level))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(new Set(PAD_REPERTOIRE.map((r) => r.groove.value)).size).toBe(PAD_REPERTOIRE.length);
    for (const r of PAD_REPERTOIRE) {
      const voices = new Set(GROOVE_VOICES.map((v) => v.id));
      for (const t of r.groove.targets)
        expect(voices.has(t.voice), `${r.groove.value} ${t.voice}`).toBe(true);
      const keys = r.groove.targets.map((t) => `${t.voice}@${t.beat.toFixed(3)}`);
      expect(new Set(keys).size, r.groove.value).toBe(keys.length);
      expect(r.bpm.start).toBeLessThanOrEqual(r.bpm.target);
      expect(Math.max(...r.groove.targets.map((t) => t.beat))).toBeLessThanOrEqual(
        r.groove.bars * (r.groove.beatsPerBar ?? 4),
      );
    }
  });

  it("writes the classic breaks as transcribed", () => {
    const fd = repertoireFor("funky-drummer")!.groove;
    expect(
      fd.targets.filter((t) => t.voice === "snare").map((t) => `${t.beat}:${t.accent}`),
    ).toEqual(["1:accent", "1.75:ghost", "2.25:ghost", "2.75:ghost", "3:accent", "3.75:ghost"]);
    const amen = repertoireFor("amen")!.groove;
    expect(amen.bars).toBe(4);
    expect(amen.targets.find((t) => t.voice === "crash")?.beat).toBe(14.5);
    // Trap: the last beat of hats rolls in thirty-seconds.
    const trap = repertoireFor("trap-32")!.groove.targets.filter(
      (t) => t.voice === "hats" && t.beat >= 3,
    );
    expect(trap.map((t) => t.beat)).toEqual([3, 3.125, 3.25, 3.375, 3.5, 3.625, 3.75, 3.875]);
    // Think: one kick, the backbeat with ghosts on the a of 2 and the & of 3.
    const think = repertoireFor("think")!.groove.targets;
    expect(think.filter((t) => t.voice === "kick").map((t) => t.beat)).toEqual([0]);
    // (lightly swung, so the off-sixteenth ghost sits a little late: compare the written step)
    expect(
      think
        .filter((t) => t.voice === "snare")
        .map((t) => `${Math.round(t.beat * 4) / 4}:${t.accent}`),
    ).toEqual(["1:accent", "1.75:ghost", "2.5:ghost", "3:accent"]);
    // The Latin grooves: the dembow snare (3+3+2), the tamborzão's tresillo, the kompa bell.
    const on = (id: string, voice: string) =>
      repertoireFor(id)!
        .groove.targets.filter((t) => t.voice === voice)
        .map((t) => t.beat);
    expect(on("reggaeton", "snare")).toEqual([0.75, 1.5, 2.75, 3.5]);
    expect(on("tamborzao", "kick")).toEqual([0, 1.5]);
    expect(on("tamborzao", "tom-high")).toEqual([0.75, 1.5]);
    expect(on("kompa", "cowbell").slice(0, 6)).toEqual([0, 0.75, 1, 2, 2.5, 3]);
    expect(repertoireFor("kompa")!.feel).toMatch(/provisional/i);
    // Tony Allen: kicks in pairs, on 1 and 1e, 3 and 3e.
    expect(
      repertoireFor("tony-allen")!
        .groove.targets.filter((t) => t.voice === "kick")
        .map((t) => t.beat),
    ).toEqual([0, 0.25, 2, 2.25]);
    // Swing 62: the off-sixteenth hats land late.
    const sw = repertoireFor("swing-62")!.groove.targets.filter((t) => t.voice === "hats");
    expect(sw[1].beat).toBeCloseTo(0.31);
  });

  it("grades perfect and good per tier, the good window capped by the closest spacing", () => {
    expect(TIERS.advanced.perfect).toBeLessThan(TIERS.beginner.perfect);
    const errors = [5, -10, 20, 30, -40, 90, null, 8, 12, -3];
    const g = gradeTier(errors, "beginner", 167);
    expect(g.goodMs).toBe(Math.min(70, 0.4 * 167));
    expect(g.perfect).toBeCloseTo(0.7);
    expect(g.good).toBeCloseTo(0.8);
    expect(g.pass).toBe(false);
    expect(gradeTier([0, 2, -4, 6, 8, 1, 0, 3, 2, 50], "beginner", 167).pass).toBe(true);
    expect(closestGapMs(repertoireFor("trap-32")!.groove.targets, 428)).toBeCloseTo(428 / 8);
  });

  it("measures swing as an MPC percentage from where the off-sixteenths land", () => {
    const targets = [{ beat: 0 }, { beat: 0.25 }, { beat: 0.5 }, { beat: 0.75 }];
    // At 90 BPM an eighth is 333 ms: 16% of it late is 53 ms.
    expect(measuredSwing(targets, [0, 0, 0, 0], 667)).toBe(50);
    expect(measuredSwing(targets, [0, 53, 0, 53], 667)).toBe(66);
    expect(measuredSwing(targets, [0, null, 0, null], 667)).toBeNull();
  });
});

describe("shuffles and odd meters, graded", () => {
  const PADS = Object.fromEntries(GROOVE_VOICES.map((v) => [v.id, v.midi]));
  const grade = (id: string, bpm: number, shift: (beat: number) => number = (b) => b) => {
    const g = repertoireFor(id)!.groove;
    const gt = grooveTargetsFor(g, bpm);
    const beatMs = 60000 / bpm;
    const hits = gt.targets.map((t) => ({
      kind: "noteon" as const,
      midi: t.pad,
      velocity: t.accent ? 0.9 : t.ghost ? 0.25 : 0.55,
      at: shift(t.beat) * beatMs,
      source: "midi" as const,
      confidence: 1,
      velocityMeasured: true,
    }));
    return {
      gt,
      r: gradeGroove({
        targets: gt.targets.map((t) => ({
          voice: t.voice,
          beat: t.beat,
          accent: t.accent ? "accent" : "normal",
        })),
        voicePads: PADS,
        sectionLabels: g.sectionLabels,
        beatsPerBar: g.beatsPerBar ?? 4,
        beatMs,
        startAt: 0,
        hits,
        responseEnd: gt.lengthMs,
      }) as GrooveResult,
    };
  };

  it("passes a shuffle played on the triplets and misses its offbeats played straight", () => {
    const { r } = grade("blues-shuffle", 120);
    expect(r).toMatchObject({ correct: true, missed: 0, extra: 0 });
    // The same hits a sixteenth-grid player would put down: the shuffle's last triplet on the &.
    const straight = grade("blues-shuffle", 120, (b) =>
      Math.abs((b % 1) - 2 / 3) < 1e-6 ? Math.floor(b) + 0.5 : b,
    ).r;
    expect(straight.missed).toBe(4);
    expect(straight.correct).toBe(false);
  });

  it("times 5/4, 7/4 and 7/8 bars by their own length", () => {
    for (const [id, beats] of [
      ["five-four", 5],
      ["seven-four", 7],
      ["seven-eight", 7],
    ] as const) {
      const { gt, r } = grade(id, 120);
      expect(gt.groove.beatsPerBar).toBe(beats);
      expect(gt.lengthMs).toBe(beats * 500);
      expect(gt.targets.every((t) => t.bar === 0)).toBe(true);
      expect(r.correct, id).toBe(true);
    }
    // Two bars of 5/4: the second bar's downbeat is beat 5, in its own section.
    const two = grooveTargetsFor(
      {
        ...repertoireFor("five-four")!.groove,
        bars: 2,
        sectionLabels: ["a", "b"],
        targets: [
          { voice: "kick", beat: 0, accent: "accent" },
          { voice: "kick", beat: 5, accent: "accent" },
        ],
      },
      120,
    );
    expect(two.targets.map((t) => t.section)).toEqual(["a", "b"]);
    expect(two.lengthMs).toBe(5000);
  });

  it("swings a shuffle's half-time cousins on the sixteenth-triplet grid too", () => {
    const g = repertoireFor("fool-in-the-rain")!.groove;
    expect(g.stepsPerBeat).toBe(6);
    expect(grade("fool-in-the-rain", 130).r.correct).toBe(true);
    expect(repertoireFor("slow-blues")!.groove.meter).toBe("12/8");
  });
});

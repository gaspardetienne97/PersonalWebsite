import { describe, expect, it } from "vite-plus/test";
import { rng } from "./random";
import { ostinatoGroove, ostinatoReport, readingLines } from "./pad-skills";
import {
  CHOP_EDITS,
  CHOP_PADS,
  CHOP_SOURCES,
  FEELS,
  chopPiece,
  chopSourceNotes,
  feelPrompt,
  gradeBuild,
  gradeFreeChop,
  gradeLiveLoop,
  gradeWrittenSong,
  newWrittenSong,
  setCheck,
  writtenPiece,
  WRITTEN_GROOVES,
  nextRepeatAt,
  noteRepeatPiece,
  quantiseBeat,
  repeatTimes,
  sectionDynamics,
  sectionPasses,
  SONG_FORMS,
  songFormPiece,
  sliceSamples,
} from "./pads-studio";
import { RUDIMENTS, rudimentHits, STICK_CONTROL } from "./winds-pads";

const range = { soft: 0.2, loud: 0.9 };

describe("chops", () => {
  it("lays slices 1 to 16 on A01 to A16, in order across the loop", () => {
    const p = chopPiece(CHOP_SOURCES[0], "order");
    expect(p.targets.map((t) => CHOP_PADS[t.voice])).toEqual(
      Array.from({ length: 16 }, (_, i) => 36 + i),
    );
    expect(p.targets.map((t) => t.beat)).toEqual(Array.from({ length: 16 }, (_, i) => i / 4));
    const amen = chopPiece(
      CHOP_SOURCES.find((s) => s.id === "amen")!,
      "order",
    );
    expect(amen.bars).toBe(4);
    expect(amen.targets[1].beat).toBe(1);
  });

  it("writes every edit on real slices, a gap letting the last ring", () => {
    for (const e of CHOP_EDITS) {
      expect(e.steps.every((x) => x >= 0 && x <= 16)).toBe(true);
      const p = chopPiece(CHOP_SOURCES[0], "reorder", e.id);
      expect(p.targets.length).toBe(e.steps.filter(Boolean).length);
      expect(p.bars * 4).toBeGreaterThanOrEqual(e.steps.length * e.every);
    }
    for (const s of CHOP_SOURCES) expect(chopSourceNotes(s.id).length).toBeGreaterThan(8);
  });

  it("cuts a channel into equal slices that fade out", () => {
    const data = new Float32Array(1600).fill(1);
    const slices = sliceSamples(data, 16, 1600, 8000);
    expect(slices).toHaveLength(16);
    expect(slices.every((x) => x.length === 100)).toBe(true);
    expect(slices[3][0]).toBe(1);
    expect(slices[3][99]).toBe(0);
  });

  it("grades a free chop on playing it again, in time", () => {
    const beat = 500;
    const first = [0, 2, 4, 5, 8, 10, 12, 13, 14].map((step, i) => ({
      midi: 36 + (i % 4),
      at: 1000 + step * 125,
    }));
    const again = first.map((h) => ({ ...h, at: h.at + 16 * beat }));
    const g = gradeFreeChop([...first, ...again], 1000, beat, 4);
    expect(g.repeat).toBe(1);
    expect(g.correct).toBe(true);
    const wrong = again.map((h) => ({ ...h, midi: 50 }));
    expect(gradeFreeChop([...first, ...wrong], 1000, beat, 4).repeat).toBe(0);
    expect(gradeFreeChop(first.slice(0, 3), 1000, beat, 4).correct).toBe(false);
  });
});

describe("note repeat", () => {
  it("repeats on the grid after the hit, the hit standing for its own step", () => {
    expect(repeatTimes(0, 1000, 0, 250)).toEqual([250, 500, 750]);
    expect(repeatTimes(10, 1000, 0, 250)).toEqual([250, 500, 750]);
    // A hit nearer the next step stands for it.
    expect(nextRepeatAt(140, 140, 0, 250)).toBe(500);
  });

  it("writes the roll bars at their rates and the build at 1/8 then 1/16", () => {
    const rolls = noteRepeatPiece("rolls");
    const bar2beat4 = rolls.targets.filter((t) => t.voice === "hats" && t.beat >= 7 && t.beat < 8);
    expect(bar2beat4).toHaveLength(8);
    expect(rolls.rateAt(10.5)).toBe("1/16T");
    const build = noteRepeatPiece("build");
    expect(build.rateAt(3)).toBe("1/8");
    expect(build.rateAt(9)).toBe("1/16");
    expect(build.targets.filter((t) => t.voice === "snare")).toHaveLength(16 + 32);
  });

  it("hears a build rise", () => {
    const hits = Array.from({ length: 16 }, (_, k) => ({
      at: k * 500,
      velocity: 0.25 + (k / 15) * 0.6,
    }));
    expect(gradeBuild(hits, 0, 500, 16, range).rising).toBe(true);
    expect(
      gradeBuild(
        hits.map((h) => ({ ...h, velocity: 0.6 })),
        0,
        500,
        16,
        range,
      ).rising,
    ).toBe(false);
  });
});

describe("live loop", () => {
  it("quantises as played, half way or on the grid, swing kept", () => {
    expect(quantiseBeat(0.27, 1)).toBe(0.25);
    expect(quantiseBeat(0.27, 0.5)).toBeCloseTo(0.26);
    expect(quantiseBeat(0.27, 0)).toBe(0.27);
    expect(quantiseBeat(0.32, 1, 66)).toBeCloseTo(0.33);
    expect(quantiseBeat(7.98, 1, 50, 8)).toBe(0);
  });

  it("passes three kept passes in time, not a late undo or a slow build", () => {
    const pass = (midi: number) => ({
      undone: false,
      hits: [0, 1, 2, 3].map((b) => ({ midi, beat: b + 0.01, velocity: 0.8 })),
    });
    expect(gradeLiveLoop([pass(36), pass(38), pass(42)], { bpm: 120, minutes: 2 }).correct).toBe(
      true,
    );
    expect(gradeLiveLoop([pass(36), pass(38), pass(42)], { bpm: 120, minutes: 7 }).correct).toBe(
      false,
    );
    const late = gradeLiveLoop([pass(36), pass(38), { ...pass(42), undone: true }, pass(42)], {
      bpm: 120,
      minutes: 2,
    });
    expect(late.lateUndo).toBe(true);
    expect(late.correct).toBe(false);
    expect(
      gradeLiveLoop([{ ...pass(36), undone: true }, pass(36), pass(38), pass(42)], {
        bpm: 120,
        minutes: 2,
      }).correct,
    ).toBe(true);
    const sloppy = [36, 38, 42].map((m) => ({
      undone: false,
      hits: [0, 1, 2, 3].map((b) => ({ midi: m, beat: b + 0.11, velocity: 0.8 })),
    }));
    expect(gradeLiveLoop(sloppy, { bpm: 120, minutes: 2 }).correct).toBe(false);
  });
});

describe("song form", () => {
  it("builds each piece from its sections, a band per bar", () => {
    for (const f of SONG_FORMS) {
      const p = songFormPiece(f);
      expect(p.bars).toBe(f.sections.reduce((n, s) => n + s.bars, 0));
      expect(p.sectionLabels).toHaveLength(p.bars);
      expect(p.dyn).toHaveLength(p.bars);
      expect(Math.max(...p.targets.map((t) => t.beat))).toBeLessThan(p.bars * 4);
    }
    const house = songFormPiece(SONG_FORMS[0]);
    expect(house.bars).toBe(32);
    expect(house.targets.some((t) => t.voice === "crash" && t.beat === 16 * 4)).toBe(true);
  });

  it("checks each section's level against its band", () => {
    const p = {
      sectionLabels: ["intro", "intro", "drop", "drop"],
      dyn: ["soft", "soft", "loud", "loud"] as const,
    };
    const hits = [0, 1, 2, 3, 4, 5, 6, 7]
      .map((b) => ({ at: b * 500, velocity: 0.85 }))
      .concat([8, 9, 10, 11, 12, 13, 14, 15].map((b) => ({ at: b * 500, velocity: 0.85 })));
    const d = sectionDynamics({ ...p, dyn: [...p.dyn] }, hits, 0, 500, range);
    expect(d.map((x) => [x.label, x.ok])).toEqual([
      ["intro", false],
      ["drop", true],
    ]);
    expect(sectionPasses({ matched: 19, missed: 1, extra: 1 }, true)).toBe(true);
    expect(sectionPasses({ matched: 19, missed: 1, extra: 1 }, false)).toBe(false);
    expect(sectionPasses({ matched: 15, missed: 5, extra: 0 }, null)).toBe(false);
  });
});

describe("reading lines and the clave", () => {
  it("deals four new bars to read, each with three notes or more", () => {
    const lines = readingLines(rng(3));
    expect(lines).toHaveLength(4);
    expect(new Set(lines).size).toBe(4);
    for (const l of lines) {
      expect(l).toMatch(/^[x.]{16}$/);
      expect([...l].filter((c) => c === "x").length).toBeGreaterThanOrEqual(3);
    }
    const kick = ostinatoGroove("read", { interp: "kick", lines });
    expect(kick.targets.some((t) => t.voice === "snare")).toBe(false);
    expect(kick.targets.filter((t) => t.voice === "kick" && t.beat < 8)).toHaveLength(0);
  });

  it("holds the clave on the rim while the kick moves", () => {
    const g = ostinatoGroove("clave");
    expect(g.ostinato).toBe("rim");
    expect(g.targets.filter((t) => t.voice === "rim")).toHaveLength(6 * 5);
    const per = g.targets.map((t) => (t.voice === "rim" && t.beat >= 8 && t.beat < 12 ? null : 0));
    const r = ostinatoReport(g, per, "rim");
    expect(r.alone).toBe(1);
    expect(r.held).toBe(false);
  });
});

describe("Stick Control and feel", () => {
  it("has the 16 four-note stickings, 20 repetitions each", () => {
    expect(new Set(STICK_CONTROL.map((r) => r.unit.join(""))).size).toBe(16);
    expect(RUDIMENTS.filter((r) => r.hits)).toHaveLength(16);
    const h = rudimentHits({
      patternId: "stick-rrll",
      subdivision: 4,
      hits: 16,
      bpm: 90,
      pads: [36, 38],
    });
    expect(h).toHaveLength(80);
    expect(h.slice(0, 4).map((x) => x.hand)).toEqual(["right", "right", "left", "left"]);
    expect(h[1].atMs).toBeCloseTo(60000 / 90 / 2);
  });

  it("plays each feel on grooves of its kind", () => {
    const r = rng(5);
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const p = feelPrompt(r);
      seen.add(p.feel);
      expect(FEELS.find((f) => f.id === p.feel)!.grooves).toContain(p.groove.value);
    }
    expect(seen.size).toBe(4);
  });
});

describe("a piece you write", () => {
  const song = newWrittenSong("t");
  const bpm = 90;
  const beatMs = 60000 / bpm;
  const pads = { ...CHOP_PADS };
  const drum: Record<string, number> = { kick: 36, snare: 38, hats: 42, crash: 49, openhat: 46 };

  it("builds the sections in order, the slices as their own voices and the solo's loop under it", () => {
    const p = writtenPiece(song);
    expect(p.spans.map((s) => s.label)).toEqual([
      "intro",
      "groove 1",
      "groove 2",
      "chop",
      "groove 3",
      "solo",
      "end",
    ]);
    expect(p.bars).toBe(4 + 16 + 16 + 8 + 16 + 8 + 2);
    expect(p.sectionLabels).toHaveLength(p.bars);
    expect(p.dyn[p.spans[2].from]).toBe("loud");
    const chop = p.spans[3];
    const inChop = p.targets.filter((t) => t.beat >= chop.from * 4 && t.beat < (chop.from + 8) * 4);
    expect(inChop.every((t) => t.voice.startsWith("slice-"))).toBe(true);
    expect(p.chop).toBe("boom-bap-b");
    const solo = p.spans[5];
    expect(p.targets.some((t) => t.beat >= solo.from * 4 && t.beat < (solo.from + 8) * 4)).toBe(
      false,
    );
    expect(p.under.length).toBeGreaterThan(0);
    expect(p.under.every((t) => t.beat >= solo.from * 4 && t.beat < (solo.from + 8) * 4)).toBe(
      true,
    );
    // The end: the fill bar, then crash and kick on the one after it.
    const end = p.spans[6];
    expect(
      p.targets
        .filter((t) => t.beat === (end.from + 1) * 4)
        .map((t) => t.voice)
        .sort(),
    ).toEqual(["crash", "kick"]);
    expect(WRITTEN_GROOVES.every((r) => (r.groove.stepsPerBeat ?? 4) === 4)).toBe(true);
  });

  it("checks the set's shape: three levels, a chop, a solo, an end, 3 to 5 minutes", () => {
    expect(setCheck(song, bpm)).toMatchObject({ ok: true, missing: [] });
    expect(setCheck(song, 200).missing).toEqual(["3 to 5 minutes"]);
    const same = {
      ...song,
      sections: song.sections.map((s) => (s.role === "groove" ? { ...s, ref: "basic-rock" } : s)),
    };
    expect(setCheck(same, bpm).missing).toEqual(["grooves from three levels (1 now)"]);
    const bare = { ...song, sections: song.sections.filter((s) => s.role === "groove") };
    expect(setCheck(bare, bpm).missing).toContain("a chop section");
  });

  /** Every target played, the solo as steady eighths on the snare, each section at its level. */
  function take(p: ReturnType<typeof writtenPiece>, skip = new Set<string>()) {
    const vel = (bar: number) => {
      const d = p.dyn[bar];
      return d === "soft" ? 0.3 : d === "loud" ? 0.85 : 0.55;
    };
    const hits = p.targets.flatMap((t) => {
      const bar = Math.min(p.bars - 1, Math.floor(t.beat / 4));
      if (skip.has(p.sectionLabels[bar])) return [];
      const midi = t.voice.startsWith("slice-") ? pads[t.voice] : drum[t.voice];
      return [
        {
          kind: "noteon" as const,
          midi,
          velocity: vel(bar),
          at: t.beat * beatMs + 3,
          source: "midi" as const,
          confidence: 1,
          velocityMeasured: true,
        },
      ];
    });
    const solo = p.spans.find((s) => s.role === "solo")!;
    for (let k = 0; k < solo.bars * 8; k++)
      hits.push({
        kind: "noteon",
        midi: k % 2 ? 42 : 38,
        velocity: vel(solo.from),
        at: (solo.from * 4 + k / 2) * beatMs + 4,
        source: "midi",
        confidence: 1,
        velocityMeasured: true,
      });
    return hits.sort((a, b) => a.at - b.at);
  }

  it("grades every section in one take, the chop on the slices and the solo on time", () => {
    const p = writtenPiece(song);
    const g = gradeWrittenSong(p, take(p), 0, beatMs, range);
    expect(g.sections.map((s) => [s.label, s.pass])).toEqual(p.spans.map((s) => [s.label, true]));
    expect(g.correct).toBe(true);
    expect(g.sections.find((s) => s.role === "chop")!.matched).toBeGreaterThan(30);
    expect(g.sections.find((s) => s.role === "solo")!.solo!.density).toBe(1);
    expect(g.perTarget.every((e) => e !== null)).toBe(true);
  });

  it("fails the section left out and the band missed, and passes the rest", () => {
    const p = writtenPiece(song);
    const hits = take(p, new Set(["chop"])).map((h) =>
      h.at >= p.spans[1].from * 4 * beatMs && h.at < p.spans[2].from * 4 * beatMs - 50
        ? { ...h, velocity: 0.95 }
        : h,
    );
    const g = gradeWrittenSong(p, hits, 0, beatMs, range);
    expect(g.sections.filter((s) => !s.pass).map((s) => s.label)).toEqual(["groove 1", "chop"]);
    expect(g.sections[1].dyn?.ok).toBe(false);
    expect(g.score).toBeCloseTo(5 / 7);
    // Velocity not measured: the bands are not checked.
    expect(gradeWrittenSong(p, hits, 0, beatMs, null).sections[1].pass).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import {
  EAR_RHYTHM_LEVELS,
  earRhythmPattern,
  expandRhythm,
  pulseTargets,
  RHYTHM_CELLS,
  RHYTHM_PATTERNS,
  rhythmPattern,
  rhythmSkills,
} from "./rhythm";
import { rng } from "./random";

const plan = (id: string, bpm: number, bars?: number) =>
  expandRhythm(rhythmPattern(id)!, { bpm, bars });

describe("rhythm patterns", () => {
  it("has the 11 catalog patterns with their event counts", () => {
    expect(RHYTHM_PATTERNS.map((p) => `${p.id}:${p.defaultBars}:${p.events.length}`)).toEqual([
      "quarter-pulse:1:4",
      "eighths:1:8",
      "sixteenths:1:16",
      "eighth-rests:1:4",
      "triplets:1:12",
      "off-beats:1:4",
      "dotted-quarters:2:6",
      "swing-eighths:1:8",
      "gap-click-1-on-1-off:2:8",
      "guitar-four-on-the-floor:4:16",
      "guitar-island-strum:4:28",
    ]);
  });

  it("times onsets in ms from bpm", () => {
    const p = plan("quarter-pulse", 120);
    expect(p.events.map((e) => e.atMs)).toEqual([0, 500, 1000, 1500]);
    expect(p.events.map((e) => e.accent)).toEqual([true, false, false, false]);
    expect(p.lengthMs).toBe(2000);
    expect(plan("swing-eighths", 60).events.map((e) => e.atMs)[1]).toBeCloseTo(666.667, 2);
    expect(plan("sixteenths", 60).matchWindowMs).toBe(125);
  });

  it("keeps rests explicit", () => {
    expect(plan("eighth-rests", 60).rests).toEqual([
      { startMs: 500, endMs: 1000 },
      { startMs: 1500, endMs: 2000 },
      { startMs: 2500, endMs: 3000 },
      { startMs: 3500, endMs: 4000 },
    ]);
    expect(plan("off-beats", 60).events.map((e) => e.atMs)).toEqual([500, 1500, 2500, 3500]);
  });

  it("repeats the pattern cycle for longer runs and silences gap-click bars", () => {
    const two = plan("quarter-pulse", 60, 2);
    expect(two.events.map((e) => e.id)).toEqual([
      "tap-1",
      "tap-2",
      "tap-3",
      "tap-4",
      "tap-1#1",
      "tap-2#1",
      "tap-3#1",
      "tap-4#1",
    ]);
    const gap = plan("gap-click-1-on-1-off", 60);
    expect(gap.clicks.map((c) => c.audible)).toEqual([
      true,
      true,
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
    expect(plan("gap-click-1-on-1-off", 60, 4).clicks.filter((c) => !c.audible)).toHaveLength(8);
    const dotted = plan("dotted-quarters", 60);
    expect(dotted.events.map((e) => [e.beat, e.accent])).toEqual([
      [0, true],
      [1.5, false],
      [3, true],
      [4.5, false],
      [6, true],
      [7.5, false],
    ]);
  });

  it("carries strokes, mutes and chord spans for the guitar patterns", () => {
    const island = plan("guitar-island-strum", 80);
    expect(island.events.slice(0, 7).map((e) => e.stroke)).toEqual([
      "down",
      "down",
      "up",
      "mute",
      "up",
      "down",
      "up",
    ]);
    expect(island.events.filter((e) => e.stroke === "mute")).toHaveLength(4);
    expect(island.events.map((e) => e.chord)).toEqual([
      ...Array.from({ length: 14 }, () => "G"),
      ...Array.from({ length: 14 }, () => "C"),
    ]);
    expect(island.events[0].durationMs).toBe(750);
    expect(island.chords.map((c) => [c.symbol, c.startMs, c.endMs])).toEqual([
      ["G", 0, 6000],
      ["C", 6000, 12000],
    ]);
    const floor = plan("guitar-four-on-the-floor", 60);
    expect(floor.events.filter((e) => e.accent).map((e) => e.beat)).toEqual([0, 4, 8, 12]);
    expect(floor.events.every((e) => e.stroke === "down")).toBe(true);
  });

  it("builds pulse targets, clamped to 2..16 beats and 40..220 BPM", () => {
    expect(pulseTargets(4, 100)).toEqual([0, 600, 1200, 1800]);
    expect(pulseTargets(1, 60)).toHaveLength(2);
    expect(pulseTargets(40, 60)).toHaveLength(16);
    expect(pulseTargets(2, 500)[1]).toBeCloseTo(60000 / 220);
    expect(rhythmSkills("pulse")).toEqual(["rhythm.subdivisions", "rhythm.quarter-pulse"]);
  });
});

describe("rhythm by ear", () => {
  it("fills each level's bars with its cells, never a rest first or twice in a row", () => {
    for (const level of EAR_RHYTHM_LEVELS)
      for (let seed = 1; seed <= 30; seed++) {
        const p = earRhythmPattern(rng(seed), level.id);
        const beats = p.cells.reduce((t, c) => t + RHYTHM_CELLS[c].beats, 0);
        expect(beats).toBe(level.bars * 4);
        expect(p.cells.every((c) => level.cells.includes(c))).toBe(true);
        expect(p.cells[0]).not.toBe("rest");
        p.cells.forEach(
          (c, i) => i && expect(c === "rest" && p.cells[i - 1] === "rest").toBe(false),
        );
        // Every onset sits on the dictation grid unless it is a triplet.
        if (!p.cells.includes("triplet"))
          for (const e of p.events) expect((e.beat * level.perBeat) % 1).toBeCloseTo(0);
        expect(expandRhythm(p, { bpm: 90 }).events).toHaveLength(p.events.length);
      }
  });

  it("leaves triplets out of dictation", () => {
    for (let seed = 1; seed <= 40; seed++)
      expect(earRhythmPattern(rng(seed), "syncopation", { dictation: true }).cells).not.toContain(
        "triplet",
      );
  });
});

import { describe, expect, it } from "vitest";
import type { Score } from "@repo/music-core";
import {
  buildPass,
  planPasses,
  retryBpm,
  statesByBeat,
  statesFor,
  toScoreBeat,
  voiceChoices,
} from "./studio";

// Four bars of quarter notes, one per beat: midi 60 + beat.
const score: Score = {
  id: "s",
  title: "S",
  bpm: 90,
  meter: { beats: 4, beatUnit: 4 },
  voices: [
    {
      id: "p-v1",
      name: "Piano voice 1",
      partId: "p",
      notes: Array.from({ length: 16 }, (_, i) => ({
        midi: 60 + i,
        startBeat: i,
        durationBeats: 1,
      })),
    },
    {
      id: "p-v2",
      name: "Piano voice 2",
      partId: "p",
      notes: [{ midi: 48, startBeat: 0, durationBeats: 4 }],
    },
  ],
  lengthBeats: 16,
  source: { kind: "musicxml" },
};
const sections = [
  { label: "A", startBeat: 0, endBeat: 4 },
  { label: "B", startBeat: 4, endBeat: 8 },
  { label: "C", startBeat: 8, endBeat: 12 },
];

describe("planPasses", () => {
  it("defaults to the whole score", () => {
    expect(
      planPasses(score, sections, {
        mode: "sections",
        picked: [],
        order: "sequence",
        custom: null,
      }),
    ).toEqual([[{ label: "Whole score", startBeat: 0, endBeat: 16 }]]);
  });
  it("joins sections in score order, or splits them per section", () => {
    const seq = planPasses(score, sections, {
      mode: "sections",
      picked: [2, 0],
      order: "sequence",
      custom: null,
    });
    expect(seq.map((p) => p.map((s) => s.label))).toEqual([["A", "C"]]);
    const per = planPasses(score, sections, {
      mode: "sections",
      picked: [2, 0],
      order: "per-section",
      custom: null,
    });
    expect(per.map((p) => p.map((s) => s.label))).toEqual([["A"], ["C"]]);
  });
  it("uses a custom range", () => {
    expect(
      planPasses(score, sections, {
        mode: "custom",
        picked: [],
        order: "sequence",
        custom: { startBeat: 4, endBeat: 6 },
      })[0][0],
    ).toMatchObject({ startBeat: 4, endBeat: 6 });
  });
});

describe("buildPass", () => {
  const segs = planPasses(score, sections, {
    mode: "sections",
    picked: [0, 2],
    order: "sequence",
    custom: null,
  })[0];
  const pass = buildPass(score, ["p-v1"], segs);
  it("rebases joined sections onto one clock", () => {
    expect(pass.lengthBeats).toBe(8);
    expect(pass.groups.map((g) => g.startBeat)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(pass.groups.map((g) => g.notes[0].midi)).toEqual([60, 61, 62, 63, 68, 69, 70, 71]);
    expect(pass.scoreBeat).toEqual([0, 1, 2, 3, 8, 9, 10, 11]);
    expect(pass.sections).toEqual([
      { label: "A", startBeat: 0, endBeat: 4 },
      { label: "C", startBeat: 4, endBeat: 8 },
    ]);
  });
  it("tallies the song's sections inside a single range", () => {
    const whole = buildPass(
      score,
      ["p-v1"],
      [{ label: "Whole score", startBeat: 0, endBeat: 16 }],
      sections,
    );
    expect(whole.sections.map((s) => s.label)).toEqual(["A", "B", "C"]);
    const custom = buildPass(
      score,
      ["p-v1"],
      [{ label: "Custom range", startBeat: 2, endBeat: 6 }],
      sections,
    );
    expect(custom.sections).toEqual([
      { label: "A", startBeat: 0, endBeat: 2 },
      { label: "B", startBeat: 2, endBeat: 4 },
    ]);
  });
  it("maps the pass clock back to score beats", () => {
    expect(toScoreBeat(pass, 1.5)).toBe(1.5);
    expect(toScoreBeat(pass, 5)).toBe(9);
    expect(toScoreBeat(pass, 99)).toBe(12);
  });
  it("marks groups by score beat, with a wrong note only on the current group", () => {
    const byBeat = statesByBeat(
      pass,
      ["clean", "with-errors", "current", "pending", "pending", "pending", "pending", "pending"],
      true,
      2,
    );
    const view = [0, 1, 2, 8].map((b, index) => ({ index, startBeat: b }));
    expect(statesFor(view, byBeat)).toEqual({ 0: "correct", 1: "correct", 2: "wrong" });
    const later = statesByBeat(
      pass,
      ["clean", "clean", "current", "pending", "missed", "pending", "pending", "pending"],
      false,
      2,
    );
    expect(statesFor(view, later)).toEqual({
      0: "correct",
      1: "correct",
      2: "active",
      3: "missed",
    });
  });
});

it("retries at +8 / -8 with a 20 BPM floor", () => {
  expect(retryBpm(90, 8)).toBe(98);
  expect(retryBpm(24, -8)).toBe(20);
});

it("groups MusicXML voices by part", () => {
  expect(voiceChoices(score)).toEqual([{ id: "p", label: "Piano", voiceIds: ["p-v1", "p-v2"] }]);
  expect(voiceChoices({ ...score, source: { kind: "midi" } }).map((c) => c.id)).toEqual([
    "p-v1",
    "p-v2",
  ]);
});

import { describe, expect, it } from "vitest";
import type { Score } from "@repo/music-core";
import {
  buildPass,
  firstSlip,
  defaultParts,
  fitToRange,
  gradedDrums,
  spotAfter,
  spotRange,
  startSpot,
  tuningRange,
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

describe("fitting a score to an instrument", () => {
  const line = (midis: number[]): Score => ({
    ...score,
    voices: [
      {
        id: "a",
        name: "A",
        notes: midis.map((midi, i) => ({ midi, startBeat: i, durationBeats: 1 })),
      },
    ],
  });
  const uke = tuningRange({ openStrings: [67, 60, 64, 69], fretCount: 15 }); // C4..C6

  it("moves a line by whole octaves when that fits it all, and leaves a fitting one alone", () => {
    const low = line([48, 52, 55, 59]); // C3..B3, below a ukulele
    const r = fitToRange(low, ["a"], uke.low, uke.high);
    expect(r.shift).toBe(12);
    expect(r.folded).toBe(0);
    expect(r.score.voices[0].notes.map((n) => n.midi)).toEqual([60, 64, 67, 71]);
    const ok = line([60, 64, 67]);
    expect(fitToRange(ok, ["a"], uke.low, uke.high).score).toBe(ok);
  });

  it("folds the notes one octave shift cannot reach", () => {
    const wide = line([40, 60, 64, 67, 72]); // an E2 bass note under a melody
    const r = fitToRange(wide, ["a"], uke.low, uke.high);
    expect(r.shift).toBe(0);
    expect(r.folded).toBe(1);
    expect(r.score.voices[0].notes[0].midi).toBe(64);
    expect(r.score.voices[0].notes.every((n) => n.midi >= uke.low && n.midi <= uke.high)).toBe(
      true,
    );
  });
});

describe("fix the trouble spot", () => {
  it("loops the slip's bar and its run-up, slower, then full tempo, then wider, then done", () => {
    const pass = buildPass(score, ["p-v1"], [{ label: "Whole score", startBeat: 0, endBeat: 16 }]);
    // Groups 0..5 clean, group 6 (beat 6, bar 2) slipped.
    expect(firstSlip(pass, (i) => i < 6)).toBe(6);
    expect(firstSlip(pass, () => true)).toBeNull();
    const bounds = { startBeat: 0, endBeat: 16 };
    expect(spotRange(6, 4, bounds)).toEqual({ startBeat: 0, endBeat: 8 });
    expect(spotRange(13, 4, bounds)).toEqual({ startBeat: 8, endBeat: 16 });
    let s = startSpot({ startBeat: 4, endBeat: 12 }, bounds, 100);
    expect(s.bpm).toBe(85);
    // A slip eases the tempo and resets the streak.
    s = spotAfter(s, false, 4);
    expect(s).toMatchObject({ bpm: 81, streak: 0, stage: "slow" });
    for (let i = 0; i < 3; i++) s = spotAfter(s, true, 4);
    expect(s).toMatchObject({ bpm: 100, stage: "tempo", streak: 0 });
    for (let i = 0; i < 3; i++) s = spotAfter(s, true, 4);
    expect(s).toMatchObject({ range: { startBeat: 0, endBeat: 16 }, stage: "wide" });
    for (let i = 0; i < 3; i++) s = spotAfter(s, true, 4);
    expect(s).toMatchObject({ stage: "done", takes: 10 });
    // Never below half the target.
    let slow = startSpot(bounds, bounds, 60);
    for (let i = 0; i < 30; i++) slow = spotAfter(slow, false, 4);
    expect(slow.bpm).toBe(30);
  });
});

describe("gradedDrums", () => {
  it("turns drum notes into drum keys, one per drum per onset, and leaves pitched voices alone", () => {
    const score: Score = {
      id: "d",
      title: "Drums",
      bpm: 100,
      meter: { beats: 4, beatUnit: 4 },
      lengthBeats: 4,
      voices: [
        {
          id: "hands",
          name: "Hands",
          drums: true,
          notes: [
            { midi: 46, startBeat: 0, durationBeats: 1 },
            { midi: 38, startBeat: 1, durationBeats: 1 },
          ],
        },
        {
          id: "feet",
          name: "Feet",
          drums: true,
          notes: [{ midi: 44, startBeat: 0, durationBeats: 1 }],
        },
        { id: "bass", name: "Bass", notes: [{ midi: 40, startBeat: 0, durationBeats: 1 }] },
      ],
    };
    const g = gradedDrums(score);
    expect(g.voices[0].notes.map((n) => n.midi)).toEqual([42, 38]);
    expect(g.voices[1].notes).toEqual([]);
    expect(g.voices[2]).toBe(score.voices[2]);
    const pass = buildPass(g, ["hands", "feet"], [{ label: "Whole", startBeat: 0, endBeat: 4 }]);
    expect(pass.groups.map((x) => x.notes.map((n) => n.midi))).toEqual([[42], [38]]);
  });
});

describe("defaultParts", () => {
  const v = (id: string, drums?: boolean) => ({ id, name: id, drums, notes: [] });
  const song = (...voices: ReturnType<typeof v>[]) =>
    ({
      id: "s",
      title: "S",
      bpm: 90,
      meter: { beats: 4, beatUnit: 4 },
      lengthBeats: 4,
      voices,
    }) as Score;
  it("opens a drums-only song on its drums on any instrument, a mixed one only on the MPC", () => {
    expect(defaultParts(song(v("kit", true)), "guitar")).toBe(true);
    expect(defaultParts(song(v("kit", true), v("bass")), "guitar")).toBe(false);
    expect(defaultParts(song(v("kit", true), v("bass")), "mpc")).toBe(true);
    expect(defaultParts(song(v("bass")), "mpc")).toBe(false);
  });
});

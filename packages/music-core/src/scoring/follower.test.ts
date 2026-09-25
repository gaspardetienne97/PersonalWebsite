import { describe, expect, it } from "vitest";
import type { NoteEvent, Score } from "../types";
import { followChords } from "./chord-follower";
import { compareTakes } from "./compare";
import {
  aggregateTakes,
  followerInput,
  followerResult,
  gradePerformance,
  liveState,
  performanceStart,
  scoreGroups,
  waitStart,
  WRONG_FLASH_MS,
  type FollowerState,
} from "./follower";

const on = (midi: number, at: number): NoteEvent => ({
  kind: "noteon",
  midi,
  velocity: 0.8,
  at,
  source: "midi",
  confidence: 1,
  velocityMeasured: true,
});

const score: Score = {
  id: "s",
  title: "t",
  bpm: 120,
  meter: { beats: 4, beatUnit: 4 },
  lengthBeats: 8,
  sections: [
    { label: "A", startBeat: 0, endBeat: 2 },
    { label: "B", startBeat: 2, endBeat: 4 },
  ],
  voices: [
    {
      id: "rh",
      name: "RH",
      hand: "right",
      notes: [
        { midi: 60, startBeat: 0, durationBeats: 1 },
        { midi: 64, startBeat: 1, durationBeats: 1 },
        { midi: 64, startBeat: 2, durationBeats: 1, tieFrom: true },
        { midi: 72, startBeat: 3, durationBeats: 1 },
      ],
    },
    { id: "lh", name: "LH", hand: "left", notes: [{ midi: 55, startBeat: 1, durationBeats: 2 }] },
  ],
};

describe("scoreGroups", () => {
  it("groups by onset, skips ties, selects voices and ranges", () => {
    const g = scoreGroups(score);
    expect(g.map((x) => [x.startBeat, x.notes.map((n) => n.midi)])).toEqual([
      [0, [60]],
      [1, [55, 64]],
      [3, [72]],
    ]);
    expect(g[1].durationBeats).toBe(2);
    expect(scoreGroups(score, { voiceIds: ["lh"] }).length).toBe(1);
    expect(
      scoreGroups(score, { range: { startBeat: 1, endBeat: 3 } }).map((x) => x.startBeat),
    ).toEqual([1]);
  });
});

const run = (state: FollowerState, events: NoteEvent[]) =>
  events.reduce((s, e) => followerInput(s, e), state);

describe("wait mode", () => {
  const groups = scoreGroups(score);

  it("advances when every pitch of the group is struck, key by key or at once", () => {
    let s: FollowerState = waitStart(groups, true);
    s = run(s, [on(60, 0), on(55, 100)]);
    expect(liveState(s, 100).index).toBe(1);
    s = run(s, [on(64, 150)]);
    expect(liveState(s, 150)).toMatchObject({ index: 2, expected: [72] });
  });

  it("a wrong note flashes for its lifetime, then clears", () => {
    const s = run(waitStart(groups, true), [on(61, 100)]);
    expect(liveState(s, 100 + WRONG_FLASH_MS - 1).wrong).toEqual([{ midi: 61, at: 100 }]);
    expect(liveState(s, 100 + WRONG_FLASH_MS).wrong).toEqual([]);
  });

  it("wrong notes never accumulate across groups", () => {
    const s = run(waitStart(groups, true), [on(61, 100), on(60, 120)]);
    const live = liveState(s, 130);
    expect(live.index).toBe(1);
    expect(live.wrong).toEqual([]);
    expect(live.verdicts).toEqual(["with-errors", "current", "pending"]);
  });

  it("piano is octave-exact; other instruments match pitch class", () => {
    expect(liveState(run(waitStart(groups, true), [on(72, 0)]), 0).index).toBe(0);
    expect(liveState(run(waitStart(groups, false), [on(72, 0)]), 0).index).toBe(1);
  });

  it("scores clean groups over all groups", () => {
    const s = run(waitStart(groups, true), [
      on(61, 0),
      on(60, 10),
      on(55, 20),
      on(64, 30),
      on(72, 40),
    ]);
    expect(followerResult(s)).toMatchObject({
      completed: 3,
      cleanGroups: 2,
      wrongNotes: 1,
      correct: false,
    });
    expect(followerResult(s).score).toBeCloseTo(2 / 3, 10);
    expect(liveState(s, 40).done).toBe(true);
  });
});

describe("performance mode", () => {
  const groups = scoreGroups(score);
  const opts = {
    bpm: 120,
    startAt: 1000,
    strictness: "normal" as const,
    octaveExact: true,
    sections: score.sections,
  };
  const perfect = [on(60, 1000), on(55, 1500), on(64, 1500), on(72, 2500)];

  it("a clean take scores 1 with every note on time", () => {
    const r = gradePerformance(groups, perfect, opts);
    expect(r).toMatchObject({
      score: 1,
      correct: true,
      matched: 4,
      expected: 4,
      onTime: 4,
      early: 0,
      late: 0,
      missed: 0,
      extra: 0,
    });
    expect(r.perSection).toEqual([
      { label: "A", matched: 3, total: 3, missed: 0, meanAbsErrorMs: 0 },
      { label: "B", matched: 1, total: 1, missed: 0, meanAbsErrorMs: 0 },
    ]);
  });

  it("a missed note does not shift later notes; early, late and extra are counted", () => {
    const r = gradePerformance(
      groups,
      [on(60, 1000), on(64, 1450), on(72, 2560), on(40, 2000)],
      opts,
    );
    expect(r).toMatchObject({ matched: 3, missed: 1, early: 1, late: 1, onTime: 1, extra: 1 });
    expect(r.groupVerdicts).toEqual(["hit", "partial", "hit"]);
    expect(r.pitchCompletion).toBe(0.75);
  });

  it("aggregates takes with the best take", () => {
    const a = gradePerformance(groups, perfect, opts);
    const b = gradePerformance(groups, perfect.slice(0, 2), opts);
    expect(aggregateTakes([b, a])).toMatchObject({
      takes: 2,
      bestIndex: 1,
      meanScore: (a.score + b.score) / 2,
    });
  });

  it("liveState follows the clock and flashes extra notes", () => {
    let s: FollowerState = performanceStart(groups, opts);
    s = run(s, [on(60, 1000), on(40, 1600)]);
    const live = liveState(s, 1605);
    expect(live.index).toBe(1);
    expect(live.wrong).toEqual([{ midi: 40, at: 1600 }]);
    expect(live.verdicts[0]).toBe("hit");
    expect(liveState(s, 1600 + WRONG_FLASH_MS).wrong).toEqual([]);
    expect(liveState(s, 4000)).toMatchObject({ done: true, verdicts: ["hit", "missed", "missed"] });
  });
});

describe("chord follower", () => {
  const chords = [
    { symbol: "C", pcs: [0, 4, 7], startBeat: 0, durationBeats: 4 },
    { symbol: "G", pcs: [7, 11, 2], startBeat: 4, durationBeats: 4 },
    { symbol: "Am", pcs: [9, 0, 4], startBeat: 8, durationBeats: 4 },
  ];
  const base = { chords, bpm: 60, startAt: 0, strictness: "normal" as const };
  it("aligns strums to chords within the strictness window and verifies tones", () => {
    const r = followChords({
      ...base,
      observed: [
        { at: 30, pcs: [0, 4, 7] },
        { at: 4200, pcs: [7, 11, 2, 9] },
        { at: 8400, pcs: [9, 0, 4] },
      ],
    });
    expect(r.chords.map((c) => c.matched)).toEqual([true, true, false]); // the last strum is outside 320 ms
    expect(r.matched).toBe(2);
    expect(r.score).toBeCloseTo((1 + (1 - 0.25 / 3) + 0) / 3, 10);
  });
});

describe("compareTakes", () => {
  const a = [60, 62, 64, 65].map((m, i) => ({ midi: m, at: i * 500 }));
  it("aligns a slower take onto the first", () => {
    expect(
      compareTakes(
        a,
        a.map((n) => ({ ...n, at: 3000 + n.at * 2 })),
      ),
    ).toEqual({ accuracy: 1, matched: 4, total: 4 });
    expect(compareTakes(a, [a[0], a[1], { midi: 63, at: 1000 }, a[3]])).toEqual({
      accuracy: 0.75,
      matched: 3,
      total: 4,
    });
    expect(compareTakes(a, [])).toEqual({ accuracy: 0, matched: 0, total: 4 });
  });
});

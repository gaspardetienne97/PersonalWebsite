import { describe, expect, it } from "vitest";
import { followChords, onChord } from "@repo/music-core/scoring/chord-follower";
import {
  pairStrums,
  slotAt,
  strokeTally,
  strokeVerdict,
  strumScore,
  strumSlots,
  timingCounts,
} from "./strum-slots";

const row = (r: ReturnType<typeof strumSlots>) =>
  r.slots.map((s) => (s.stroke ? { down: "D", up: "U", mute: "X" }[s.stroke] : "-")).join("");

describe("strum slots", () => {
  it("draws D DU UDU on eight slots with its counts", () => {
    const r = strumSlots(
      [0, 1, 1.5, 2.5, 3, 3.5].map((beat, i) => ({
        beat,
        stroke: (["down", "down", "up", "up", "down", "up"] as const)[i],
      })),
    );
    expect(r.step).toBe(0.5);
    expect(row(r)).toBe("D-DU-UDU");
    expect(r.slots.map((s) => s.count).join(" ")).toBe("1 & 2 & 3 & 4 &");
  });

  it("keeps eighths for quarter-note strums, and finer grids for triplets and sixteenths", () => {
    expect(row(strumSlots([0, 1, 2, 3].map((beat) => ({ beat, stroke: "down" as const }))))).toBe(
      "D-D-D-D-",
    );
    const trip = strumSlots([0, 1 / 3, 2 / 3].map((beat) => ({ beat })));
    expect(trip.slots).toHaveLength(12);
    expect(trip.slots.slice(0, 3).map((s) => s.count)).toEqual(["1", "&", "a"]);
    expect(strumSlots([0, 0.25, 0.5, 0.75].map((beat) => ({ beat }))).slots).toHaveLength(16);
    // Triplets on 1 and eighths on 2 need sixths of a beat.
    expect(strumSlots([0, 1 / 3, 2 / 3, 1, 1.5].map((beat) => ({ beat }))).slots).toHaveLength(24);
  });

  it("lights the slot sounding now, bar after bar", () => {
    expect(slotAt(null, 0.5)).toBeNull();
    expect(slotAt(-0.2, 0.5)).toBeNull();
    expect(slotAt(0, 0.5)).toBe(0);
    expect(slotAt(1.6, 0.5)).toBe(3);
    expect(slotAt(5.6, 0.5)).toBe(3);
  });

  it("judges each strum against its nearest stroke, once, within half a beat", () => {
    expect(strokeVerdict(25, 40)).toEqual({ kind: "ontime", text: "On time" });
    expect(strokeVerdict(-62.4, 40)).toEqual({ kind: "early", text: "Early 62 ms" });
    expect(strokeVerdict(90, 40)).toEqual({ kind: "late", text: "Late 90 ms" });
    // Strokes at 0, 500, 1000 ms; strums at 20, 30 (a double), 1400 (too far), 1460.
    const offs = pairStrums([0, 500, 1000], [20, 30, 1400, 1460], 1000);
    expect(offs).toEqual([20, undefined, 400]);
    expect(timingCounts(offs, 40)).toEqual({ onTime: 1, early: 0, late: 1, missed: 1 });
  });

  it("scores the expected strums: on time with a chord tone, never the strums heard alone", () => {
    // 24 expected, 8 strummed: 6 on time, 1 late, 1 with no chord tone. 16 missed.
    const hits = [...Array(6).fill(10), 90, "wrong" as const, ...Array(16).fill(undefined)];
    expect(strumScore(hits, 40)).toEqual({ landed: 6, total: 24, score: 0.25 });
    expect(strumScore([], 40).score).toBe(0);
  });
});

describe("on the chord: one rule for strums and chords followed", () => {
  // G then C, two strums each at 120 BPM. G reads as G and B only (the D too quiet in the chroma):
  // one chord tone used to count the strum, the follower never counted the chord.
  const chords = [
    { symbol: "G", pcs: [7, 11, 2], startBeat: 0, durationBeats: 4 },
    { symbol: "C", pcs: [0, 4, 7], startBeat: 4, durationBeats: 4 },
  ];
  const observed = [
    { at: 0, pcs: [7, 11] },
    { at: 1000, pcs: [7, 11] },
    { at: 2000, pcs: [0, 4, 7] },
    { at: 3000, pcs: [0, 4, 7] },
  ];

  it("a strum lands only when the follower would follow its chord", () => {
    const r = followChords({ chords, observed, bpm: 120, startAt: 0, strictness: "relaxed" });
    const hits = observed.map((o, k) => (onChord(chords[k < 2 ? 0 : 1].pcs, o.pcs) ? 0 : "wrong"));
    const s = strumScore(hits, 40);
    expect(r.chords.map((c) => c.matched)).toEqual([false, true]);
    expect(s).toEqual({ landed: 2, total: 4, score: 0.5 });
    // The ring can never read full while a chord was not followed.
    expect(s.score < 1).toBe(r.matched < r.total);
  });

  it("the tally puts every strum in one place, and its on time is the score's count", () => {
    // The round 11 case: 24 strums all on the beat, 16 of them on the wrong chord.
    const hits = [...Array(8).fill(5), ...Array(16).fill("wrong")];
    const t = strokeTally(hits, 40);
    expect(t).toEqual({ ontime: 8, early: 0, late: 0, wrong: 16, miss: 0 });
    expect(t.ontime).toBe(strumScore(hits, 40).landed);
    const mixed = strokeTally([0, -90, 70, "wrong", undefined], 40);
    expect(mixed).toEqual({ ontime: 1, early: 1, late: 1, wrong: 1, miss: 1 });
    expect(Object.values(mixed).reduce((a, b) => a + b)).toBe(5);
  });

  it("a full voicing with one extra tone is on the chord; a lone shared tone is not", () => {
    expect(onChord([7, 11, 2], [7, 11, 2, 4])).toBe(true);
    expect(onChord([7, 11, 2], [7])).toBe(false);
  });
});

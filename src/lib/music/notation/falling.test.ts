import { describe, expect, it } from "vite-plus/test";
import type { Score } from "@repo/music-core";
import { whiteKeyLayout } from "./groups";
import {
  beatY,
  fallingNotes,
  gridInView,
  inView,
  laneGuides,
  lineScore,
  sounding,
} from "./falling";

const score: Score = {
  id: "s",
  title: "S",
  bpm: 120,
  meter: { beats: 3, beatUnit: 4 },
  lengthBeats: 9,
  voices: [
    {
      id: "a",
      name: "A",
      hand: "right",
      notes: [
        { midi: 64, startBeat: 0, durationBeats: 1, finger: 3 },
        { midi: 64, startBeat: 1, durationBeats: 1 },
        { midi: 66, startBeat: 2, durationBeats: 1 },
        { midi: 100, startBeat: 3, durationBeats: 1 },
      ],
    },
    { id: "b", name: "B", hand: "left", notes: [{ midi: 48, startBeat: 0, durationBeats: 3 }] },
  ],
};

describe("falling notes layout", () => {
  it("puts each lane over its key as the keyboard draws it", () => {
    const keys = whiteKeyLayout(48, 72);
    // 15 white keys; a black key is 0.62 of a white key, centred on the gap.
    expect(keys[49].width).toBeCloseTo(0.62 / 15);
    expect(keys[49].x + keys[49].width / 2).toBeCloseTo(1 / 15);
    expect(keys[72].x + keys[72].width).toBeCloseTo(1);
  });

  it("draws guides before each C and F, the octave lines marked", () => {
    const g = laneGuides(whiteKeyLayout(48, 72));
    expect(g.map((x) => [Math.round(x.x * 15), x.octave])).toEqual([
      [3, false],
      [7, true],
      [10, false],
      [14, true],
    ]);
  });

  it("places beats above the hit line as a fraction of the lookahead", () => {
    expect(beatY(4, 4, 8)).toBe(0);
    expect(beatY(8, 4, 8)).toBe(0.5);
    expect(beatY(12, 4, 8)).toBe(1);
    expect(beatY(3, 4, 8)).toBe(-0.125);
  });

  it("lays notes on their lanes by hand and drops notes off the keyboard", () => {
    const keys = whiteKeyLayout(48, 72);
    const notes = fallingNotes(score, null, keys);
    expect(notes.map((n) => n.midi)).toEqual([48, 64, 64, 66]);
    expect(notes[0]).toMatchObject({ side: "left", group: 0, x: 0, black: false });
    expect(notes[1]).toMatchObject({ side: "right", group: 0, finger: 3, x: keys[64].x });
    expect(notes[3]).toMatchObject({ black: true, width: keys[66].width });
    expect(new Set(notes.map((n) => n.key)).size).toBe(4);
    expect(fallingNotes(score, ["b"], keys).map((n) => n.midi)).toEqual([48]);
  });

  it("keeps a note in view from the lookahead until it has fallen past", () => {
    const n = { start: 4, dur: 1 };
    expect(inView(n, 0, 4)).toBe(false);
    expect(inView(n, 0.5, 4)).toBe(true);
    expect(inView(n, 5.1, 4)).toBe(true);
    expect(inView(n, 5.5, 4)).toBe(false);
    expect(sounding(n, 4)).toBe(true);
    expect(sounding(n, 5)).toBe(false);
  });

  it("finds bar lines with numbers and the beats between them", () => {
    const { barLines, beatLines } = gridInView(score, 2, 4);
    expect(barLines).toEqual([
      { number: 2, beat: 3 },
      { number: 3, beat: 6 },
    ]);
    expect(beatLines).toEqual([2, 4, 5]);
  });

  it("turns a drill's line into a score, a voice per hand", () => {
    const s = lineScore([
      { midi: 60, startBeat: 0, durationBeats: 1, hand: "right", finger: 1 },
      { midi: 48, startBeat: 0, durationBeats: 2, hand: "left" },
      { midi: 62, startBeat: 4, durationBeats: 1, hand: "right" },
    ]);
    expect(s.voices.map((v) => [v.id, v.hand, v.notes.length])).toEqual([
      ["rh", "right", 2],
      ["lh", "left", 1],
    ]);
    expect(s.voices[0].notes[0]).toEqual({ midi: 60, startBeat: 0, durationBeats: 1, finger: 1 });
    expect(s.lengthBeats).toBe(8);
    expect(lineScore([{ midi: 60, startBeat: 0, durationBeats: 1 }]).voices[0].id).toBe("line");
  });
});

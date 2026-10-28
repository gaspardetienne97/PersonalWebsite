import { describe, expect, it } from "vite-plus/test";
import {
  NOW_X,
  ballY,
  beatX,
  behindBeats,
  chordBlock,
  hitVerdict,
  inView,
  laneY,
  spanX,
} from "./highway";

describe("highway layout", () => {
  it("puts string 1 in the top lane and the lowest string in the bottom one", () => {
    expect(laneY(1, 6)).toBeCloseTo(1 / 12);
    expect(laneY(6, 6)).toBeCloseTo(11 / 12);
    expect(laneY(4, 4)).toBeCloseTo(7 / 8);
  });

  it("maps time to x with the now line fixed and `ahead` beats to the right edge", () => {
    expect(beatX(3, 3, 4)).toBeCloseTo(NOW_X);
    expect(beatX(7, 3, 4)).toBeCloseTo(1);
    expect(beatX(5, 3, 4)).toBeCloseTo(NOW_X + (1 - NOW_X) / 2);
    // Past notes keep moving left, off the edge after behindBeats.
    expect(beatX(3 - behindBeats(4), 3, 4)).toBeCloseTo(0);
    // A longer lookahead packs the same beat closer to the line.
    expect(beatX(5, 3, 8)).toBeLessThan(beatX(5, 3, 4));
    expect(spanX(2, 4)).toBeCloseTo(beatX(5, 3, 4) - beatX(3, 3, 4));
  });

  it("keeps in view what has not left the screen", () => {
    expect(inView({ startBeat: 6.9, durationBeats: 0.5 }, 3, 4)).toBe(true);
    expect(inView({ startBeat: 7, durationBeats: 0.5 }, 3, 4)).toBe(false);
    expect(inView({ startBeat: 2, durationBeats: 0.5 }, 3, 4)).toBe(true);
    expect(inView({ startBeat: 1, durationBeats: 0.5 }, 3, 4)).toBe(false);
  });

  it("spans a chord block from its highest to its lowest string", () => {
    expect(chordBlock([2, 3, 4, 5], 6)).toEqual({ top: 1 / 6, height: 4 / 6 });
    expect(chordBlock([1, 2, 3, 4, 5, 6], 6)).toEqual({ top: 0, height: 1 });
    // Re-entrant ukulele: order by string, not pitch.
    expect(chordBlock([4, 1, 3], 4)).toEqual({ top: 0, height: 1 });
  });

  it("calls a hit perfect, early or late by its offset", () => {
    expect(hitVerdict(10, 50)).toBe("perfect");
    expect(hitVerdict(-80, 50)).toBe("early");
    expect(hitVerdict(80, 50)).toBe("late");
    expect(hitVerdict("missed", 50)).toBe("missed");
  });

  it("bounces the ball onto each onset as it reaches the line", () => {
    const onsets = [
      { beat: 0, y: 0.9 },
      { beat: 1, y: 0.1 },
      { beat: 1.5, y: 0.1 },
    ];
    expect(ballY(onsets, 0)).toBeCloseTo(0.9); // just landed on the first, heading for the second
    expect(ballY(onsets, 0.5)).toBeCloseTo(0.5 - 0.3);
    expect(ballY(onsets, 0.999)!).toBeCloseTo(0.1, 1);
    // A half-beat hop arcs half as high.
    expect(ballY(onsets, 1.25)).toBeCloseTo(0.1 - 0.15);
    // Before the first onset it falls in from a beat out; after the last, none.
    expect(ballY(onsets, -0.5)).toBeCloseTo(0.9 - 0.3);
    expect(ballY(onsets, 2)).toBeNull();
  });
});

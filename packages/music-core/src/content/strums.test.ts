import { describe, expect, it } from "vite-plus/test";
import { expandRhythm, RHYTHM_PATTERNS, rhythmPattern, rhythmSkills } from "./rhythm";
import { STRUM_PATTERNS, strumPattern } from "./strums";

const strokes = (id: string, bar = 0) => {
  const p = rhythmPattern(id)!;
  return p.events
    .filter((e) => e.beat >= bar * p.meter.beats && e.beat < (bar + 1) * p.meter.beats)
    .map(
      (e) =>
        `${+(e.beat - bar * p.meter.beats).toFixed(3)}${e.stroke![0]}${e.accent === "accent" ? "!" : ""}`,
    )
    .join(" ");
};

describe("strum patterns", () => {
  it("follow the verified patterns, with unique ids and a chord per bar", () => {
    expect(RHYTHM_PATTERNS.slice(-STRUM_PATTERNS.length)).toEqual(STRUM_PATTERNS);
    expect(new Set(RHYTHM_PATTERNS.map((p) => p.id)).size).toBe(RHYTHM_PATTERNS.length);
    for (const p of STRUM_PATTERNS) {
      expect(p.chords, p.id).toHaveLength(p.defaultBars);
      expect(
        p.chords!.every((c) => c.pitchClasses.length >= 3),
        p.id,
      ).toBe(true);
      expect(rhythmSkills(p.id)).toContain("technique.strumming");
    }
  });

  it("write each stroke where the path says", () => {
    expect(strokes("ukulele-d-du")).toBe("0d! 1d 1.5u 2d 3d 3.5u");
    expect(strokes("ukulele-waltz")).toBe("0d! 1d 1.5u 2d 2.5u");
    expect(strokes("ukulele-six-eight")).toBe("0d! 0.333d 0.667u 1d! 1.333d 1.667u");
    expect(strokes("ukulele-calypso")).toBe("0d! 1d 1.5u 2.5u! 3d 3.5u");
    expect(strokes("ukulele-split-stroke")).toBe("0d! 1d 1.5u! 2d! 3d 3.5u!");
    expect(strokes("ukulele-swing-comp")).toBe("0d 1m! 2d 3m!");
    expect(strokes("guitar-backbeat-chuck")).toBe("0d 0.5u 1m! 1.5u 2d 2.5u 3m! 3.5u");
    // Bossa: the thumb on 1 and 3 in both bars, the fingers moving between.
    expect(strokes("ukulele-bossa", 0)).toBe("0d! 1.5u 2d 3u");
    expect(strokes("ukulele-bossa", 1)).toBe("0d 1u 2d 2.5u");
    expect(strokes("ukulele-fan")).toBe(
      "0d! 0.25d 0.5d 0.75d 1d 1.5u 2d! 2.25d 2.5d 2.75d 3d 3.5u",
    );
    expect(strokes("ukulele-triple-stroke")).toBe(
      "0d! 0.333d 0.667u 1d 1.5u 2d! 2.333d 2.667u 3d 3.5u",
    );
  });

  it("keep reggae's beats as rests and let held strokes ring", () => {
    const reggae = expandRhythm(rhythmPattern("ukulele-reggae")!, { bpm: 60, bars: 1 });
    expect(reggae.rests.map((r) => r.startMs)).toEqual([0, 1000, 2000, 3000]);
    expect(reggae.events.map((e) => e.atMs)).toEqual([500, 1500, 2500, 3500]);
    expect(rhythmPattern("ukulele-d-du")!.events[0].durationBeats).toBe(1);
  });

  it("refuse a bar of the wrong length", () => {
    expect(() =>
      strumPattern("x", "x", { beats: 4, perBeat: 2, bars: ["D-du"], chords: ["C"] }),
    ).toThrow();
  });
});

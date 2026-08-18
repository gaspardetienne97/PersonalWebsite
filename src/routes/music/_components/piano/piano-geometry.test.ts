import { describe, expect, test } from "vite-plus/test";

import {
  MIN_WHITE_KEY_PX,
  PIANO_MAX_MIDI,
  PIANO_MIN_MIDI,
  isWhiteKey,
  keyPercent,
  minKeyboardWidthPx,
  noteLane,
  pianoGeometry,
  pianoRange,
} from "./piano-geometry";

describe("piano geometry", () => {
  test("lays out one octave in white-key units", () => {
    const geometry = pianoGeometry({ lowMidi: 60, highMidi: 72 });

    expect(geometry).toMatchObject({ lowMidi: 60, highMidi: 72, whiteCount: 8 });
    expect(geometry.keys).toHaveLength(13);
    expect(geometry.blackKeys).toHaveLength(5);
    expect(geometry.whiteKeys[0]).toMatchObject({ midiNote: 60, name: "C4", left: 0, width: 1 });
    expect(geometry.whiteKeys[1]).toMatchObject({ midiNote: 62, name: "D4", left: 1 });
  });

  test("every black key is centred on the boundary of its two white neighbours", () => {
    const geometry = pianoGeometry({ lowMidi: 36, highMidi: 96 });

    for (const black of geometry.blackKeys) {
      const nextWhite = geometry.whiteKeys.find((key) => key.midiNote === black.midiNote + 1);
      expect(nextWhite, `white key above ${black.name}`).toBeDefined();
      expect(black.left + black.width / 2).toBeCloseTo(nextWhite!.left, 10);
    }
  });

  test("a waterfall lane is its own key's box, so notes land on the key they name", () => {
    const geometry = pianoGeometry({ lowMidi: 60, highMidi: 72 });

    for (const key of geometry.keys) {
      expect(noteLane(geometry, key.midiNote)).toEqual({ left: key.left, width: key.width });
    }
    expect(noteLane(geometry, 21)).toBeUndefined();
  });

  test("percent boxes span the keyboard exactly once", () => {
    const geometry = pianoGeometry({ lowMidi: 60, highMidi: 72 });
    const last = geometry.whiteKeys.at(-1)!;

    expect(keyPercent(geometry, geometry.whiteKeys[0]!)).toEqual({ left: 0, width: 12.5 });
    expect(keyPercent(geometry, last).left + keyPercent(geometry, last).width).toBeCloseTo(100, 10);
  });

  test("auto range pads the material by one key and shows at least an octave", () => {
    expect(pianoRange({ notes: ["C4"] })).toEqual({ lowMidi: 59, highMidi: 71 });
    expect(pianoRange({ notes: [60, 64, 67] }).lowMidi).toBe(59);

    const range = pianoRange({ notes: [60] });
    expect(range.highMidi - range.lowMidi).toBeGreaterThanOrEqual(12);
  });

  test("auto range clamps to the 88 keys and caps the view at four octaves", () => {
    const wide = pianoRange({ notes: [0, 200] });

    expect(wide.lowMidi).toBe(PIANO_MIN_MIDI);
    expect(wide.highMidi - wide.lowMidi).toBeLessThanOrEqual(48);
    expect(wide.highMidi).toBeLessThanOrEqual(PIANO_MAX_MIDI);
  });

  test("an explicit range is clamped and ordered but not padded", () => {
    expect(pianoRange({ lowMidi: 10, highMidi: 130 })).toEqual({ lowMidi: 21, highMidi: 108 });
    expect(pianoRange({ lowMidi: 72, highMidi: 60 })).toEqual({ lowMidi: 60, highMidi: 72 });
    expect(pianoRange({ lowMidi: 60, highMidi: 64 })).toEqual({ lowMidi: 60, highMidi: 64 });
  });

  test("ranges always start and end on a white key", () => {
    for (const notes of [["C#4"], ["A#3", "D#5"], [61], [22, 106]]) {
      const range = pianoRange({ notes });
      expect(isWhiteKey(range.lowMidi), `low of ${notes.join()}`).toBe(true);
      expect(isWhiteKey(range.highMidi), `high of ${notes.join()}`).toBe(true);
    }
  });

  test("no material falls back to a two-octave view", () => {
    expect(pianoRange()).toEqual({ lowMidi: 48, highMidi: 72 });
  });

  test("interactive white keys keep the 36px touch floor, so wide ranges scroll", () => {
    const full = pianoGeometry({ lowMidi: PIANO_MIN_MIDI, highMidi: PIANO_MAX_MIDI });

    expect(MIN_WHITE_KEY_PX).toBe(36);
    expect(full.whiteCount).toBe(52);
    expect(minKeyboardWidthPx(full)).toBe(52 * 36);
    // A phone-width viewport cannot fit it, which is what forces the scroller.
    expect(minKeyboardWidthPx(full)).toBeGreaterThan(375);
  });
});

import { describe, expect, it } from "vitest";
import { flashcardPrompt } from "@repo/music-core/content/reading";
import { rng } from "@repo/music-core/content/random";
import { TUNINGS } from "@repo/music-core/data/index";
import {
  clampRange,
  comparisonScore,
  handLabel,
  playableWrittenRange,
  soundingScore,
} from "./reading";

describe("reading helpers", () => {
  const p = flashcardPrompt(rng(1), {
    kind: "note",
    clefs: ["treble"],
    key: "C major",
    range: [60, 72],
    difficulty: 0.2,
  });

  it("puts a named answer beside the expected note in the nearest octave", () => {
    const s = comparisonScore({ ...p, midi: [64] }, [65 + 24]);
    expect(s.voices[0].notes.map((n) => [n.midi, n.startBeat])).toEqual([
      [64, 0],
      [65, 2],
    ]);
  });

  it("writes guitar an octave up and knows its playable range", () => {
    const guitar = TUNINGS.guitar[0];
    expect(playableWrittenRange(guitar)).toEqual([52, 88]);
    const s = soundingScore(
      {
        ...comparisonScore(p, []),
        voices: [{ id: "m", name: "m", notes: [{ midi: 64, startBeat: 0, durationBeats: 1 }] }],
      },
      -12,
    );
    expect(s.voices[0].notes[0].midi).toBe(52);
  });

  it("keeps at least an octave when clamping", () => {
    expect(clampRange([48, 84], [52, 88])).toEqual([52, 84]);
    expect(clampRange([90, 95], [52, 88])).toEqual([76, 88]);
  });

  it("names the hand of a group", () => {
    const g = (ids: string[]) => ({
      index: 0,
      startBeat: 0,
      durationBeats: 1,
      notes: ids.map((voiceId) => ({ midi: 60, startBeat: 0, durationBeats: 1, voiceId })),
    });
    expect(handLabel(g(["rh", "lh"]))).toBe("Both hands");
    expect(handLabel(g(["lh"]))).toBe("Left hand");
    expect(handLabel(g(["melody"]))).toBeNull();
  });
});

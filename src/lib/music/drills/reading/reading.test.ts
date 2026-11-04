import { describe, expect, it } from "vitest";
import { flashcardPrompt } from "@repo/music-core/content/reading";
import { rng } from "@repo/music-core/content/random";
import { TUNINGS } from "@repo/music-core/data/index";
import {
  combineLanes,
  kickGroups,
  KICK_MIDI,
  clampRange,
  comparisonScore,
  flashcardScore,
  fretPosition,
  placeInPosition,
  positionRange,
  handLabel,
  keyboardSpan,
  playableWrittenRange,
  soundingScore,
  stepWords,
  waitHeadline,
  followerModeNotes,
  FOLLOWER_NAME,
  missMarks,
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

  it("starts the keyboard on the C under the lowest note, not an octave below it", () => {
    expect(keyboardSpan([60, 64, 67])).toEqual([60, 84]);
    expect(keyboardSpan([62, 79])).toEqual([60, 84]);
    expect(keyboardSpan([59, 62])).toEqual([48, 72]);
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

  it("reads guitar and ukulele in a hand position: the range and the frets agree", () => {
    const guitar = TUNINGS.guitar[0];
    const uke = TUNINGS.ukulele[0];
    expect(positionRange(guitar, fretPosition("guitar", "open")!.frets)).toEqual([52, 81]);
    expect(positionRange(guitar, fretPosition("guitar", "2")!.frets)).toEqual([54, 83]);
    expect(positionRange(guitar, fretPosition("guitar", "5")!.frets)).toEqual([56, 85]);
    expect(positionRange(uke, fretPosition("ukulele", "open")!.frets)).toEqual([60, 72]);
    expect(positionRange(uke, fretPosition("ukulele", "up")!.frets)).toEqual([60, 76]);
    expect(fretPosition("guitar", "nonsense")!.value).toBe("open");
    // Sounding E4 to C5 in fifth position: B string fret 5, then the high E string from fret 5.
    const placed = placeInPosition(
      [64, 67, 69, 72].map((midi) => ({ midi })),
      guitar,
      [4, 9],
    );
    expect(placed.map((n) => [n.string, n.fret])).toEqual([
      [2, 5],
      [2, 8],
      [1, 5],
      [1, 8],
    ]);
    // In open position the same E4 is the open string.
    expect(placeInPosition([{ midi: 64 }], guitar, [0, 5])[0]).toMatchObject({
      string: 1,
      fret: 0,
    });
  });

  it("draws a four-part chord across both staves", () => {
    const satb = flashcardPrompt(rng(3), {
      kind: "satb",
      clefs: ["treble", "bass"],
      key: "C major",
      range: [41, 84],
      difficulty: 0.9,
    });
    const s = flashcardScore(satb);
    expect(s.voices.map((v) => v.clef)).toEqual(["treble", "bass"]);
    expect(s.voices.flatMap((v) => v.notes.map((n) => n.midi)).sort((a, b) => a - b)).toEqual(
      satb.midi,
    );
    expect(s.voices[1].notes.every((n) => n.midi < 60)).toBe(true);
  });
});

describe("the kick lane", () => {
  it("puts a kick on every quarter", () => {
    expect(kickGroups(4).map((g) => [g.startBeat, g.notes[0].midi])).toEqual(
      [0, 1, 2, 3].map((b) => [b, KICK_MIDI]),
    );
    expect(kickGroups(2.5)).toHaveLength(3);
  });
  it("weighs the taps and the kicks by count, clean only when both are", () => {
    expect(combineLanes({ score: 0.9, correct: true, n: 10 }, null)).toEqual({
      score: 0.9,
      correct: true,
    });
    const both = combineLanes(
      { score: 1, correct: true, n: 6 },
      { score: 0.5, correct: false, n: 2 },
    );
    expect(both.score).toBeCloseTo(0.875);
    expect(both.correct).toBe(false);
  });
});

describe("plain words for the cursor's steps and the follower", () => {
  const g = (...sizes: number[]) =>
    sizes.map((n, i) => ({
      index: i,
      startBeat: i,
      durationBeats: 1,
      notes: Array.from({ length: n }, (_, j) => ({
        midi: 60 + j,
        startBeat: i,
        durationBeats: 1,
        voiceId: "rh",
      })),
    }));

  it("a step is a note when every group is one note, else a note or chord", () => {
    expect(stepWords(g(1, 1, 1))).toEqual({ one: "Note", many: "notes" });
    expect(stepWords(g(1, 2, 1))).toEqual({ one: "Note or chord", many: "notes and chords" });
  });
  it("the wait headline counts steps right first time, and the wrong notes on the way", () => {
    expect(waitHeadline({ cleanGroups: 6, total: 6, wrongNotes: 0 }, stepWords(g(1)))).toBe(
      "All 6 notes right first time.",
    );
    expect(waitHeadline({ cleanGroups: 5, total: 6, wrongNotes: 1 }, stepWords(g(1)))).toBe(
      "5 of 6 notes right first time, 1 wrong note on the way.",
    );
    expect(waitHeadline({ cleanGroups: 2, total: 4, wrongNotes: 3 }, stepWords(g(2)))).toBe(
      "2 of 4 notes and chords right first time, 3 wrong notes on the way.",
    );
  });
  it("each mode note opens with the follower's own name, and Wait for me never counts", () => {
    for (const f of ["wait", "performance", "tap"] as const) {
      const n = followerModeNotes(f);
      expect(n.practice.startsWith(`${FOLLOWER_NAME[f]}:`)).toBe(true);
      expect(n.check.startsWith(`${FOLLOWER_NAME[f]}:`)).toBe(true);
    }
    expect(followerModeNotes("wait").check).toContain("does not count");
    expect(followerModeNotes("performance").check).toContain("This run counts");
  });
  it("after a miss the right keys carry a check and the played ones a cross; a shared key keeps the check", () => {
    expect(missMarks([67], [69])).toEqual({ 67: { target: true, label: "✓" }, 69: { label: "✕" } });
    expect(missMarks([60, 64], [60, 65])).toEqual({
      60: { target: true, label: "✓" },
      64: { target: true, label: "✓" },
      65: { label: "✕" },
    });
  });
});

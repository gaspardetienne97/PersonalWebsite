import { describe, expect, it } from "vite-plus/test";
import { estimateTempo, notesToScore, type HeardNote } from "./transcription";

// A deterministic wobble of up to ±12 ms, like a person playing.
const wobble = (i: number) => (((i * 7919) % 25) - 12) / 1000;

describe("transcription to a score", () => {
  it("finds the tempo and the first beat of a played line", () => {
    const p = 60 / 80;
    const notes: HeardNote[] = [];
    for (let beat = 0; beat < 64; beat++) {
      notes.push({
        midi: 60 + (beat % 5),
        start: 0.37 + beat * p + wobble(beat),
        duration: p * 0.9,
        amplitude: 0.8,
      });
      if (beat % 4 === 1)
        notes.push({
          midi: 67,
          start: 0.37 + (beat + 0.5) * p + wobble(beat + 100),
          duration: p / 2,
          amplitude: 0.5,
        });
    }
    const t = estimateTempo(notes);
    expect(Math.abs(t.bpm - 80)).toBeLessThanOrEqual(1);
    expect(Math.abs(t.offset - 0.37)).toBeLessThan(0.03);
    const score = notesToScore(notes, { bpm: t.bpm, offset: t.offset, title: "Line" });
    expect(score.voices).toHaveLength(1);
    expect(score.voices[0].notes.slice(0, 3).map((n) => n.startBeat)).toEqual([0, 1, 1.5]);
  });

  it("reads steady eighths at 70 as 70, not 140, but keeps a real 140", () => {
    const eighths: HeardNote[] = Array.from({ length: 128 }, (_, i) => ({
      midi: i % 2 ? 67 : 48,
      start: 0.2 + i * (30 / 70) + wobble(i),
      duration: 0.3,
      amplitude: i % 2 ? 0.5 : 1,
    }));
    expect(Math.abs(estimateTempo(eighths).bpm - 70)).toBeLessThanOrEqual(1);
    const quarters: HeardNote[] = Array.from({ length: 96 }, (_, i) => ({
      midi: 60,
      start: 0.1 + i * (60 / 140) + wobble(i),
      duration: 0.3,
      amplitude: 0.8,
    }));
    expect(Math.abs(estimateTempo(quarters).bpm - 140)).toBeLessThanOrEqual(1);
  });

  it("snaps to sixteenths, keeps one note per pitch and onset, cuts overlapping repeats, splits the hands", () => {
    const heard: HeardNote[] = [
      { midi: 72, start: 0.01, duration: 0.98, amplitude: 0.9 }, // beat 0, 2 beats at 120
      { midi: 72, start: 0.02, duration: 0.2, amplitude: 0.4 }, // the same onset again: dropped
      { midi: 72, start: 0.5, duration: 0.5, amplitude: 0.9 }, // a repeat at beat 1 cuts the first
      { midi: 48, start: 0, duration: 2, amplitude: 0.7 },
    ];
    const score = notesToScore(heard, { bpm: 120, title: "Hands" });
    const [right, left] = score.voices;
    expect(right.hand).toBe("right");
    expect(right.notes.map((n) => [n.startBeat, n.durationBeats])).toEqual([
      [0, 1],
      [1, 1],
    ]);
    expect(left.notes.map((n) => [n.midi, n.durationBeats])).toEqual([[48, 4]]);
    expect(notesToScore(heard, { bpm: 120, title: "One", split: false }).voices).toHaveLength(1);
  });
});

import { expect, it } from "vitest";
import type { NoteEvent } from "@repo/music-core";
import { pairNotes, takeStats } from "./takes";

const ev = (
  kind: "noteon" | "noteoff",
  midi: number,
  at: number,
  source: NoteEvent["source"] = "midi",
): NoteEvent => ({
  kind,
  midi,
  at,
  source,
  velocity: kind === "noteon" ? 0.5 : 0,
  confidence: 1,
});

it("pairs note-offs so durations are real, and closes held notes at the end", () => {
  const events = [
    ev("noteon", 60, 1000),
    ev("noteon", 64, 1100),
    ev("noteoff", 60, 1400),
    ev("noteon", 60, 1500),
    ev("noteoff", 60, 1600),
  ];
  expect(pairNotes(events, 1000, 2000)).toEqual([
    { midi: 60, startMs: 0, durationMs: 400, velocity: 0.5 },
    { midi: 64, startMs: 100, durationMs: 900, velocity: 0.5 },
    { midi: 60, startMs: 500, durationMs: 100, velocity: 0.5 },
  ]);
});

it("does not let one source's note-off end another's note", () => {
  const events = [
    ev("noteon", 60, 0, "midi"),
    ev("noteoff", 60, 50, "onscreen"),
    ev("noteoff", 60, 300, "midi"),
  ];
  expect(pairNotes(events, 0, 1000)[0].durationMs).toBe(300);
});

it("counts notes, distinct pitches, range and sources", () => {
  const s = takeStats([
    ev("noteon", 60, 0),
    ev("noteon", 60, 10, "onscreen"),
    ev("noteon", 67, 20),
    ev("noteoff", 67, 30),
  ]);
  expect(s).toEqual({
    count: 3,
    distinct: 2,
    low: 60,
    high: 67,
    perSource: { midi: 2, onscreen: 1 },
  });
});

import { describe, expect, test } from "vitest";

import { monotonicMs, type NoteEvent } from "@repo/music-core/domain";

import { InputRouter } from "./index";

const note = (source: NoteEvent["source"], midiNote: number): NoteEvent => ({
  type: "noteOn",
  midiNote,
  velocity: 1,
  source,
  timestamp: monotonicMs(0),
  clock: "performance",
});

describe("music-core/input-router", () => {
  test("prefers recent MIDI over on-screen input", () => {
    const router = new InputRouter();
    router.push(note("onscreen", 60));
    expect(router.activeSource).toBe("onscreen");

    router.push(note("midi", 64));
    expect(router.activeSource).toBe("midi");
    expect(router.confidence).toBe(1);
    const latest = router.events.at(-1);
    expect(latest?.type).toBe("noteOn");
    if (latest?.type === "noteOn") expect(latest.midiNote).toBe(64);
  });

  test("falls back to on-screen when MIDI is absent", () => {
    const router = new InputRouter();
    router.push(note("onscreen", 67));
    expect(router.activeSource).toBe("onscreen");
    expect(router.confidence).toBe(0.8);
  });
});

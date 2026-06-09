import { describe, expect, test } from "vitest";

import { monotonicMs, type InstrumentId, type NoteEvent } from "@repo/music-core/domain";

import { InputRouter, type InputRouterState } from "./index";

const note = (
  source: NoteEvent["source"],
  midiNote: number,
  instrument?: InstrumentId,
): NoteEvent => ({
  type: "noteOn",
  midiNote,
  velocity: 1,
  source,
  timestamp: monotonicMs(0),
  clock: "performance",
  ...(instrument ? { instrument } : {}),
});

describe("music-core/input-router", () => {
  test("filters MIDI to the active channel", () => {
    const router = new InputRouter();
    router.setActiveChannel(10);
    expect(router.activeChannel).toBe(10);

    expect(router.push({ ...note("midi", 36), channel: 10 } as NoteEvent)).toBe(true);
    expect(router.push({ ...note("midi", 38), channel: 1 } as NoteEvent)).toBe(false);
    // Events without a channel are still accepted.
    expect(router.push(note("midi", 40))).toBe(true);

    router.setActiveChannel(undefined);
    expect(router.push({ ...note("midi", 38), channel: 1 } as NoteEvent)).toBe(true);
  });

  test("prefers recent MIDI and suppresses competing on-screen input", () => {
    let now = 0;
    const router = new InputRouter({ now: () => now, midiActivityWindowMs: 1_000 });
    const streamed: NoteEvent[] = [];
    router.subscribe((event) => streamed.push(event));

    expect(router.push(note("onscreen", 60, "piano"))).toBe(true);
    now = 100;
    expect(router.push(note("midi", 64, "piano"))).toBe(true);
    now = 200;
    expect(router.push(note("onscreen", 67, "piano"))).toBe(false);

    expect(router.activeSource).toBe("midi");
    expect(router.confidence).toBe(1);
    expect(streamed).toHaveLength(2);
    expect(router.events.at(-1)).toMatchObject({ source: "midi", midiNote: 64 });
  });

  test("falls back to on-screen when MIDI activity expires", () => {
    let now = 0;
    const router = new InputRouter({ now: () => now, midiActivityWindowMs: 500 });
    router.push(note("midi", 64, "piano"));

    now = 501;
    expect(router.push(note("onscreen", 67, "piano"))).toBe(true);
    expect(router.activeSource).toBe("onscreen");
    expect(router.confidence).toBe(0.8);
  });

  test("routes MIDI only for the active instrument", () => {
    const router = new InputRouter();
    router.setActiveInstrument("piano");

    expect(router.push(note("midi", 36, "mpc"))).toBe(false);
    expect(router.push(note("onscreen", 60, "piano"))).toBe(true);
    expect(router.activeSource).toBe("onscreen");

    expect(router.push(note("midi", 64, "piano"))).toBe(true);
    expect(router.activeSource).toBe("midi");
  });

  test("emits active-source state and always forwards click answers", () => {
    const router = new InputRouter();
    const states: InputRouterState[] = [];
    const events: NoteEvent[] = [];
    router.subscribeState((state) => states.push({ ...state }));
    router.subscribe((event) => events.push(event));

    router.push(note("midi", 64, "piano"));
    router.push(note("click", 0));

    expect(states.at(-1)).toMatchObject({ activeSource: "midi", confidence: 1 });
    expect(events.map((event) => event.source)).toEqual(["midi", "click"]);
  });
});

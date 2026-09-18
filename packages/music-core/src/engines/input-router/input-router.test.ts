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

const release = (
  source: NoteEvent["source"],
  midiNote: number,
  instrument?: InstrumentId,
): NoteEvent => ({
  type: "noteOff",
  midiNote,
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

  test("a stale MIDI release neither reactivates MIDI nor refreshes its window", () => {
    let now = 0;
    const router = new InputRouter({ now: () => now, midiActivityWindowMs: 500 });
    const states: InputRouterState[] = [];
    const streamed: NoteEvent[] = [];
    router.subscribeState((state) => states.push({ ...state }));
    router.subscribe((event) => streamed.push(event));

    expect(router.push(note("midi", 64, "piano"))).toBe(true);

    now = 501;
    expect(router.push(note("onscreen", 67, "piano"))).toBe(true);

    // The key that was pressed before the window expired is finally released.
    expect(router.push(release("midi", 64, "piano"))).toBe(true);
    expect(router.activeSource).toBe("onscreen");
    expect(router.confidence).toBe(0.8);

    // ...and it did not re-arm the recent-MIDI window against the next attack.
    expect(router.push(note("onscreen", 69, "piano"))).toBe(true);
    expect(router.activeSource).toBe("onscreen");
    expect(states.at(-1)).toMatchObject({ activeSource: "onscreen", confidence: 0.8 });
    expect(streamed.map((event) => [event.source, event.type])).toEqual([
      ["midi", "noteOn"],
      ["onscreen", "noteOn"],
      ["midi", "noteOff"],
      ["onscreen", "noteOn"],
    ]);
  });

  test("delivers non-MIDI releases during recent MIDI activity", () => {
    let now = 0;
    const router = new InputRouter({ now: () => now, midiActivityWindowMs: 1_000 });

    expect(router.push(note("onscreen", 60, "piano"))).toBe(true);
    now = 100;
    expect(router.push(note("midi", 64, "piano"))).toBe(true);

    now = 200;
    expect(router.push(note("onscreen", 67, "piano"))).toBe(false);
    // The owning source can always let go of what it is holding.
    expect(router.push(release("onscreen", 60, "piano"))).toBe(true);
    expect(router.activeSource).toBe("midi");
    expect(router.confidence).toBe(1);
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

describe("music-core/input-router saved offsets", () => {
  const stamped = (source: NoteEvent["source"], atMs: number, deviceId?: string): NoteEvent => ({
    ...note(source, 60),
    timestamp: monotonicMs(atMs),
    ...(deviceId ? { deviceId } : {}),
  });

  test("subtracts each source's own offset and leaves the others alone", () => {
    // One router per source: MIDI activity would otherwise take arbitration.
    const stampOf = (source: NoteEvent["source"]) => {
      const router = new InputRouter();
      router.setInputOffsets({ midiMs: 12, audioMs: 40 });
      router.push(stamped(source, 1_000));
      return router.events[0]!.timestamp;
    };

    expect(stampOf("midi")).toBe(988);
    expect(stampOf("audio")).toBe(960);
    expect(stampOf("onscreen")).toBe(1_000);
  });

  test("a per-device offset overrides the global MIDI offset for that device only", () => {
    const router = new InputRouter();
    router.setInputOffsets({ midiMs: 12, midiByDeviceId: { "mpc-1": 30 } });

    router.push(stamped("midi", 1_000, "mpc-1"));
    router.push(stamped("midi", 1_000, "keys-2"));

    expect(router.events.map((event) => event.timestamp)).toEqual([970, 988]);
  });

  test("delivers the corrected timestamp to subscribers", () => {
    const router = new InputRouter();
    const seen: number[] = [];
    router.subscribe((event) => seen.push(event.timestamp));
    router.setInputOffsets({ audioMs: 43 });

    router.push(stamped("audio", 5_000));

    expect(seen).toEqual([4_957]);
  });

  test("leaves timestamps untouched until offsets are set", () => {
    const router = new InputRouter();

    router.push(stamped("midi", 1_000));

    expect(router.events[0]!.timestamp).toBe(1_000);
  });
});

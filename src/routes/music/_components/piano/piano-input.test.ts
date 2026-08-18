import { describe, expect, test } from "vite-plus/test";

import { monotonicMs, type NoteEvent } from "@repo/music-core/domain";
import { InputRouter } from "@repo/music-core/engines/input-router";

import { PianoInput, isTypingTarget, qwertyBaseMidi } from "./piano-input";

function setup(options: { midiActivityWindowMs?: number } = {}) {
  let now = 0;
  const router = new InputRouter({ now: () => now, ...options });
  const routed: NoteEvent[] = [];
  const accepted: NoteEvent[] = [];
  router.subscribe((event) => routed.push(event));
  const input = new PianoInput({
    router: () => router,
    instrument: () => "piano",
    onAccepted: (event) => accepted.push(event),
    now: () => now,
  });
  return { router, routed, accepted, input, advance: (ms: number) => (now += ms) };
}

function pairs(events: NoteEvent[]): string[] {
  return events.map((event) => `${event.type}:${"midiNote" in event ? event.midiNote : ""}`);
}

describe("piano input holder registry", () => {
  test("a pointer press and release routes exactly one paired note", () => {
    const { input, routed, accepted } = setup();

    expect(input.press(60, "pointer", 1)).toBe(true);
    expect(pairs(routed)).toEqual(["noteOn:60"]);
    expect(routed[0]).toMatchObject({ source: "onscreen", instrument: "piano", velocity: 1 });

    input.release("pointer", 1);
    expect(pairs(routed)).toEqual(["noteOn:60", "noteOff:60"]);
    expect(pairs(accepted)).toEqual(pairs(routed));
    expect(input.heldNotes.size).toBe(0);
  });

  test("a QWERTY keydown/keyup pair routes one note and ignores repeats", () => {
    const { input, routed } = setup();

    input.press(60, "qwerty", "KeyA");
    input.press(60, "qwerty", "KeyA"); // auto-repeat / duplicate keydown
    expect(pairs(routed)).toEqual(["noteOn:60"]);

    input.release("qwerty", "KeyA");
    input.release("qwerty", "KeyA");
    expect(pairs(routed)).toEqual(["noteOn:60", "noteOff:60"]);
  });

  test("overlapping pointer, QWERTY and latch holders coalesce into one 0->1/1->0", () => {
    const { input, routed } = setup();

    input.press(60, "pointer", 1);
    input.press(60, "pointer", 2); // second finger, same key
    input.press(60, "qwerty", "KeyA");
    input.toggleLatch(60);
    expect(pairs(routed)).toEqual(["noteOn:60"]);

    input.release("pointer", 1);
    input.release("pointer", 2);
    input.release("qwerty", "KeyA");
    expect(pairs(routed)).toEqual(["noteOn:60"]);
    expect(input.isHeld(60)).toBe(true);

    input.toggleLatch(60); // the last holder leaves
    expect(pairs(routed)).toEqual(["noteOn:60", "noteOff:60"]);
  });

  test("multi-touch chord entry holds every key independently", () => {
    const { input, routed } = setup();

    input.press(60, "pointer", 1);
    input.press(64, "pointer", 2);
    input.press(67, "pointer", 3);
    expect([...input.heldNotes]).toEqual([60, 64, 67]);

    input.release("pointer", 2);
    expect(pairs(routed)).toEqual(["noteOn:60", "noteOn:64", "noteOn:67", "noteOff:64"]);
    expect([...input.heldNotes]).toEqual([60, 67]);
  });

  test("latching holds notes and Clear held notes releases all of them", () => {
    const { input, routed } = setup();

    input.toggleLatch(60);
    input.toggleLatch(64);
    expect([...input.latchedNotes]).toEqual([60, 64]);

    input.clearLatches();
    expect(pairs(routed)).toEqual(["noteOn:60", "noteOn:64", "noteOff:60", "noteOff:64"]);
    expect(input.latchedNotes.size).toBe(0);
  });

  test("Clear held notes leaves pointer and QWERTY holds alone", () => {
    const { input, routed } = setup();

    input.press(60, "pointer", 1);
    input.toggleLatch(64);
    input.clearLatches();

    expect(pairs(routed)).toEqual(["noteOn:60", "noteOn:64", "noteOff:64"]);
    expect(input.isHeld(60)).toBe(true);
  });

  test("a rejected first attack rolls the holder back so a later press retries", () => {
    const { router, input, routed, accepted, advance } = setup({ midiActivityWindowMs: 1_000 });

    router.noteOn(60, "midi", "piano"); // recent MIDI suppresses on-screen attacks
    expect(input.press(60, "pointer", 1)).toBe(false);
    expect(pairs(routed)).toEqual(["noteOn:60"]);
    expect(accepted).toHaveLength(0);
    expect(input.heldNotes.size).toBe(0);

    input.release("pointer", 1); // nothing was held, so nothing is released
    expect(pairs(routed)).toEqual(["noteOn:60"]);

    advance(2_000);
    expect(input.press(60, "pointer", 1)).toBe(true);
    expect(pairs(routed)).toEqual(["noteOn:60", "noteOn:60"]);
    expect(pairs(accepted)).toEqual(["noteOn:60"]);
  });

  test("a tap is one momentary press, so repeating a note re-attacks it", () => {
    const { input, routed } = setup();

    input.tap(60);
    input.tap(60);

    expect(pairs(routed)).toEqual(["noteOn:60", "noteOff:60", "noteOn:60", "noteOff:60"]);
    expect(input.heldNotes.size).toBe(0);
  });
});

describe("piano input click-to-latch opt-in", () => {
  function latchSetup() {
    let now = 0;
    const router = new InputRouter({ now: () => now });
    const routed: NoteEvent[] = [];
    router.subscribe((event) => routed.push(event));
    const input = new PianoInput({
      router: () => router,
      pointerMode: () => "latch",
      now: () => now,
    });
    return { input, routed };
  }

  test("pointer activation toggles the latch instead of pressing", () => {
    const { input, routed } = latchSetup();

    input.press(60, "pointer", 1);
    input.release("pointer", 1); // the pointer up is not a release here
    input.press(64, "pointer", 2);
    input.release("pointer", 2);
    expect(pairs(routed)).toEqual(["noteOn:60", "noteOn:64"]);
    expect([...input.latchedNotes]).toEqual([60, 64]);

    input.press(60, "pointer", 3); // clicking a held key releases it
    expect(pairs(routed)).toEqual(["noteOn:60", "noteOn:64", "noteOff:60"]);

    input.clearLatches();
    expect(input.heldNotes.size).toBe(0);
  });

  test("a bare click latches too, so a synthesised click can build a chord", () => {
    const { input, routed } = latchSetup();

    input.tap(60);
    input.tap(64);

    expect(pairs(routed)).toEqual(["noteOn:60", "noteOn:64"]);
    expect([...input.heldNotes]).toEqual([60, 64]);
  });

  test("QWERTY keeps press-and-hold semantics on a latch surface", () => {
    const { input, routed } = latchSetup();

    input.press(60, "qwerty", "KeyA");
    input.release("qwerty", "KeyA");

    expect(pairs(routed)).toEqual(["noteOn:60", "noteOff:60"]);
  });
});

describe("piano input wait-mode opt-in", () => {
  test("a wait group change clears local holders without routing synthetic offs", () => {
    const { input, routed } = setup();

    input.setWaitGroupKey("group-1:0");
    input.toggleLatch(60);
    input.press(64, "pointer", 1);

    input.setWaitGroupKey("group-2:1");

    expect(pairs(routed)).toEqual(["noteOn:60", "noteOn:64"]);
    expect(input.heldNotes.size).toBe(0);
  });

  test("an identical repeated group still resets, because the key carries a generation", () => {
    const { input, routed } = setup();

    input.setWaitGroupKey("60,64:0");
    input.toggleLatch(60);
    input.setWaitGroupKey("60,64:1");

    expect(input.heldNotes.size).toBe(0);
    expect(pairs(routed)).toEqual(["noteOn:60"]);
  });

  test("an accepted foreign attack takes over and clears local holders silently", () => {
    const { router, input, routed } = setup();

    input.setWaitGroupKey("group-1:0");
    input.toggleLatch(60);
    input.observe(router.noteOn(64, "midi", "piano"));

    expect(input.heldNotes.size).toBe(0);
    expect(pairs(routed)).toEqual(["noteOn:60", "noteOn:64"]);
  });

  test("a foreign release changes nothing, and neither does our own attack", () => {
    const { input, routed } = setup();

    input.setWaitGroupKey("group-1:0");
    input.toggleLatch(60);

    input.observe({
      type: "noteOff",
      midiNote: 64,
      source: "midi",
      timestamp: monotonicMs(0),
      clock: "performance",
    });
    input.observe({
      type: "noteOn",
      midiNote: 67,
      velocity: 1,
      source: "onscreen",
      timestamp: monotonicMs(0),
      clock: "performance",
    });

    expect(input.isLatched(60)).toBe(true);
    expect(pairs(routed)).toEqual(["noteOn:60"]);
  });

  test("without a wait group key, a foreign attack leaves on-screen holders alone", () => {
    const { router, input } = setup();

    input.toggleLatch(60);
    input.observe(router.noteOn(64, "midi", "piano"));

    expect(input.isLatched(60)).toBe(true);
  });
});

describe("piano input helpers", () => {
  test("the QWERTY base C follows the lowest relevant note's octave", () => {
    expect(qwertyBaseMidi([60, 64, 67])).toBe(60);
    expect(qwertyBaseMidi([55])).toBe(48);
    expect(qwertyBaseMidi([])).toBe(60);
  });

  test("typing targets are recognized so drills never eat keystrokes", () => {
    const input = document.createElement("input");
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    document.body.append(input, editable);

    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(document.createElement("textarea"))).toBe(true);
    expect(isTypingTarget(document.createElement("select"))).toBe(true);
    expect(isTypingTarget(editable)).toBe(true);
    expect(isTypingTarget(document.createElement("button"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);

    input.remove();
    editable.remove();
  });
});

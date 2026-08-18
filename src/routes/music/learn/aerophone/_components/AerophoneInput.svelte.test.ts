import { tick } from "svelte";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import type { NoteEvent } from "@repo/music-core/domain";
import { monotonicMs } from "@repo/music-core/domain";
import { InputRouter } from "@repo/music-core/engines/input-router";

import AerophoneInput from "./AerophoneInput.svelte";

afterEach(() => {
  document.body.replaceChildren();
});

function setup() {
  const router = new InputRouter();
  const routed: NoteEvent[] = [];
  router.subscribe((event) => routed.push(event));
  return { router, routed };
}

function pairs(events: NoteEvent[]): string[] {
  return events.map((event) => `${event.type}:${"midiNote" in event ? event.midiNote : ""}`);
}

function target(): HTMLButtonElement {
  const element = document.querySelector<HTMLButtonElement>(
    '[role="group"][aria-label="Aerophone fingering input"] button[data-note]',
  );
  if (!element) throw new Error("No rendered target fingering button");
  return element;
}

function windowKey(type: "keydown" | "keyup", init: KeyboardEventInit): void {
  window.dispatchEvent(new KeyboardEvent(type, { bubbles: true, ...init }));
}

describe("AerophoneInput surface", () => {
  test("the target fingering is one named button carrying its note", async () => {
    const { router } = setup();
    render(AerophoneInput, { router, targetMidi: 67 });
    await tick();

    expect(target().dataset.note).toBe("G4");
    expect(target().getAttribute("aria-label")).toBe("Play G4, target fingering");
    expect(document.querySelector('svg[aria-label="G4 Aerophone fingering"]')).not.toBeNull();
    expect(target().className).toContain("focus-visible:ring-2");
    // The only tab stop is the note itself: nothing else here is focusable.
    const group = target().closest('[role="group"]');
    expect(group?.querySelectorAll("button, [tabindex], [href]")).toHaveLength(1);
  });

  test("the last played fingering appears beside the target only once one lands", async () => {
    const { router } = setup();
    const view = render(AerophoneInput, { router, targetMidi: 67 });
    await tick();

    expect(document.querySelector('[data-testid="aerophone-last-played"]')).toBeNull();

    await view.rerender({ router, targetMidi: 67, currentMidi: 60 });

    const played = document.querySelector('[data-testid="aerophone-last-played"]');
    expect(played?.textContent).toContain("Last played");
    expect(played?.querySelector('svg[aria-label="C4 Aerophone fingering"]')).not.toBeNull();
    // ...and it does not become a second tab stop.
    expect(document.querySelectorAll("button")).toHaveLength(1);
  });

  test("a tap routes one aerophone attack and reports it back", async () => {
    const { router, routed } = setup();
    const onAccepted = vi.fn();
    render(AerophoneInput, { router, targetMidi: 67, onAccepted });
    await tick();

    target().click();

    expect(pairs(routed)).toEqual(["noteOn:67"]);
    expect(routed[0]).toMatchObject({
      type: "noteOn",
      midiNote: 67,
      velocity: 1,
      source: "onscreen",
      clock: "performance",
      instrument: "aerophone",
    });
    expect(onAccepted).toHaveBeenCalledTimes(1);
    expect(onAccepted).toHaveBeenCalledWith(routed[0]);
  });

  test("a rejected attack is not reported as accepted", async () => {
    const { router, routed } = setup();
    const onAccepted = vi.fn();
    render(AerophoneInput, { router, targetMidi: 67, onAccepted });
    await tick();

    // A live wind controller owns the input; the on-screen attack loses.
    router.push({
      type: "noteOn",
      source: "midi",
      instrument: "aerophone",
      midiNote: 67,
      velocity: 1,
      channel: 1,
      timestamp: monotonicMs(0),
      clock: "midi",
    });
    target().click();

    expect(pairs(routed)).toEqual(["noteOn:67"]);
    expect(routed[0]?.source).toBe("midi");
    expect(onAccepted).not.toHaveBeenCalled();
  });

  /**
   * The Finding 1 guarantee. `aerophone-articulation` measures sounding time
   * from noteOn/noteOff pairs, so an on-screen release would start grading
   * mouse/key hold time. No release may ever leave this surface.
   */
  test("no interaction routes a noteOff", async () => {
    const { router, routed } = setup();
    render(AerophoneInput, { router, targetMidi: 67 });
    await tick();

    const button = target();
    button.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1, bubbles: true }));
    button.click();
    button.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, bubbles: true }));
    button.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1, bubbles: true }));
    windowKey("keydown", { key: "a", code: "KeyA" });
    windowKey("keyup", { key: "a", code: "KeyA" });
    button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    button.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));

    expect(routed.every((event) => event.type === "noteOn")).toBe(true);
    expect(pairs(routed)).toEqual(["noteOn:67", "noteOn:60"]);
  });

  test("QWERTY plays from the target's octave, once per press", async () => {
    const { router, routed } = setup();
    render(AerophoneInput, { router, targetMidi: 67 });
    await tick();

    expect(document.body.textContent).toContain("steps up from C4");

    windowKey("keydown", { key: "a", code: "KeyA" });
    windowKey("keydown", { key: "a", code: "KeyA", repeat: true });
    windowKey("keyup", { key: "a", code: "KeyA" });
    expect(pairs(routed)).toEqual(["noteOn:60"]);

    windowKey("keydown", { key: "w", code: "KeyW" });
    windowKey("keydown", { key: "l", code: "KeyL" });
    expect(pairs(routed)).toEqual(["noteOn:60", "noteOn:61", "noteOn:74"]);
  });

  test("QWERTY re-anchors when the target moves to another octave", async () => {
    const { router, routed } = setup();
    const view = render(AerophoneInput, { router, targetMidi: 67 });
    await tick();

    await view.rerender({ router, targetMidi: 74 });
    windowKey("keydown", { key: "a", code: "KeyA" });

    expect(pairs(routed)).toEqual(["noteOn:72"]);
  });

  test("QWERTY ignores modifiers, unmapped keys and typing fields", async () => {
    const { router, routed } = setup();
    render(AerophoneInput, { router, targetMidi: 67 });
    await tick();
    const field = document.createElement("input");
    document.body.append(field);

    windowKey("keydown", { key: "a", code: "KeyA", metaKey: true });
    windowKey("keydown", { key: "a", code: "KeyA", ctrlKey: true });
    windowKey("keydown", { key: "a", code: "KeyA", altKey: true });
    windowKey("keydown", { key: "z", code: "KeyZ" });
    field.focus();
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "a", code: "KeyA", bubbles: true }));

    expect(routed).toHaveLength(0);
    field.remove();
  });

  test("keyboard focus survives a target change, so the next attack stays one press away", async () => {
    const { router, routed } = setup();
    const view = render(AerophoneInput, { router, targetMidi: 67 });
    await tick();

    const button = target();
    button.focus();
    expect(document.activeElement).toBe(button);

    await view.rerender({ router, targetMidi: 69 });

    expect(document.activeElement).toBe(button);
    expect(target()).toBe(button);
    expect(button.dataset.note).toBe("A4");
    expect(button.getAttribute("aria-label")).toBe("Play A4, target fingering");

    button.click();
    expect(pairs(routed)).toEqual(["noteOn:69"]);
  });
});

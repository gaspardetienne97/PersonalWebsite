import { tick } from "svelte";
import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { monotonicMs, type NoteEvent } from "@repo/music-core/domain";
import { InputRouter } from "@repo/music-core/engines/input-router";

import MpcPadGrid from "./MpcPadGrid.svelte";

function setup() {
  document.body.replaceChildren();
  const router = new InputRouter();
  const events: NoteEvent[] = [];
  router.subscribe((event) => events.push(event));
  return { router, events };
}

function pad(midi: number): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(`[aria-label="Pad ${midi}"]`);
}

function keydown(key: string, repeat = false): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, repeat }));
}

function keyup(key: string): void {
  window.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
}

describe("MpcPadGrid", () => {
  test("clicking a pad emits an mpc note event through the router", () => {
    const { router, events } = setup();
    render(MpcPadGrid, { router });

    expect(document.querySelector('[aria-label="Assign key for pad 36"]')).toBeNull();
    pad(36)?.click();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "noteOn",
      midiNote: 36,
      source: "onscreen",
      instrument: "mpc",
    });
  });

  test("the default QWERTY key triggers its pad", () => {
    const { router, events } = setup();
    render(MpcPadGrid, { router });

    keydown("z"); // default key for pad 36
    expect(events.at(-1)).toMatchObject({ midiNote: 36, instrument: "mpc" });
  });

  test("a reassigned key triggers the pad and the old key no longer does", () => {
    const { router, events } = setup();
    render(MpcPadGrid, { router, editable: true });

    // Enter assign mode for pad 36, then press "p" to bind it.
    document.querySelector<HTMLButtonElement>('[aria-label="Assign key for pad 36"]')?.click();
    keydown("p");
    expect(events).toHaveLength(0); // the assignment keypress itself does not trigger

    keydown("p"); // now bound to pad 36
    expect(events.at(-1)).toMatchObject({ midiNote: 36 });

    const before = events.length;
    keydown("z"); // old default key, now unbound
    expect(events).toHaveLength(before);
  });

  test("two keydowns light two pads", async () => {
    const { router } = setup();
    render(MpcPadGrid, { router });

    keydown("z"); // pad 36
    keydown("x"); // pad 37
    await tick();
    expect(pad(36)?.getAttribute("aria-pressed")).toBe("true");
    expect(pad(37)?.getAttribute("aria-pressed")).toBe("true");
  });

  test("one keyup clears just that pad", async () => {
    const { router } = setup();
    render(MpcPadGrid, { router });

    keydown("z");
    keydown("x");
    keyup("z");
    await tick();
    expect(pad(36)?.getAttribute("aria-pressed")).toBe("false");
    expect(pad(37)?.getAttribute("aria-pressed")).toBe("true");
  });

  test("a repeated keydown emits no additional router event", () => {
    const { router, events } = setup();
    render(MpcPadGrid, { router });

    keydown("z");
    expect(events).toHaveLength(1);

    keydown("z", true); // OS auto-repeat while the key is still held
    expect(events).toHaveLength(1);
  });

  test("a router noteOn from midi lights the pad and noteOff clears it", async () => {
    const { router } = setup();
    render(MpcPadGrid, { router });

    router.noteOn(38, "midi");
    await tick();
    expect(pad(38)?.getAttribute("aria-pressed")).toBe("true");

    router.push({
      type: "noteOff",
      midiNote: 38,
      source: "midi",
      timestamp: monotonicMs(0),
      clock: "performance",
    });
    await tick();
    expect(pad(38)?.getAttribute("aria-pressed")).toBe("false");
  });

  test("window blur clears every held pad", async () => {
    const { router } = setup();
    render(MpcPadGrid, { router });

    keydown("z");
    keydown("x");
    await tick();
    expect(pad(36)?.getAttribute("aria-pressed")).toBe("true");
    expect(pad(37)?.getAttribute("aria-pressed")).toBe("true");

    window.dispatchEvent(new Event("blur"));
    await tick();
    expect(pad(36)?.getAttribute("aria-pressed")).toBe("false");
    expect(pad(37)?.getAttribute("aria-pressed")).toBe("false");
  });
});

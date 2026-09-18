import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import type { NoteEvent } from "@repo/music-core/domain";
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

function keydown(key: string): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
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
});

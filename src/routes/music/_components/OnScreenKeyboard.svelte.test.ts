import { afterEach, describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { InputRouter } from "@repo/music-core/engines/input-router";

import OnScreenKeyboard from "./OnScreenKeyboard.svelte";

afterEach(() => {
  document.body.replaceChildren();
});

function pressed(router: InputRouter): number[] {
  const notes: number[] = [];
  router.subscribe((event) => {
    if (event.type === "noteOn") notes.push(event.midiNote);
  });
  return notes;
}

function key(keyName: string, init: KeyboardEventInit = {}): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: keyName, bubbles: true, ...init }));
}

describe("OnScreenKeyboard QWERTY input", () => {
  test("home-row keys play the drill's octave (A=C, W=C#, K=C+1)", () => {
    const router = new InputRouter();
    const notes = pressed(router);
    render(OnScreenKeyboard, { router, notes: ["C4", "E4", "G4"] });

    key("a");
    key("w");
    key("k");

    // Anchored at the lowest highlighted octave: C4 = 60.
    expect(notes).toEqual([60, 61, 72]);
  });

  test("ignores repeats, shortcuts, and typing into form fields", () => {
    const router = new InputRouter();
    const notes = pressed(router);
    render(OnScreenKeyboard, { router });
    const input = document.createElement("input");
    document.body.append(input);

    key("a", { repeat: true });
    key("a", { metaKey: true });
    key("a", { ctrlKey: true });
    input.focus();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    key("z"); // unmapped

    expect(notes).toEqual([]);
    input.remove();
  });

  test("shows the type-to-play hint", () => {
    const router = new InputRouter();
    render(OnScreenKeyboard, { router });
    expect(document.body.textContent).toContain("Type to play");
  });
});

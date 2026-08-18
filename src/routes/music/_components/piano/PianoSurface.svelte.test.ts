import { tick } from "svelte";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import type { NoteEvent } from "@repo/music-core/domain";
import { InputRouter } from "@repo/music-core/engines/input-router";

import PianoSurface from "./PianoSurface.svelte";

afterEach(() => {
  document.body.replaceChildren();
});

function setup() {
  const router = new InputRouter();
  const routed: NoteEvent[] = [];
  router.subscribe((event) => routed.push(event));
  return { router, routed };
}

function key(note: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-note="${note}"]`);
  if (!element) throw new Error(`No rendered key for ${note}`);
  return element;
}

function pairs(events: NoteEvent[]): string[] {
  return events.map((event) => `${event.type}:${"midiNote" in event ? event.midiNote : ""}`);
}

function pointer(type: "pointerdown" | "pointerup", target: Element, pointerId: number): void {
  target.dispatchEvent(new PointerEvent(type, { pointerId, bubbles: true }));
}

function windowKey(type: "keydown" | "keyup", init: KeyboardEventInit): void {
  window.dispatchEvent(new KeyboardEvent(type, { bubbles: true, ...init }));
}

function activate(note: string, keyName: "Enter" | " "): void {
  key(note).dispatchEvent(new KeyboardEvent("keydown", { key: keyName, bubbles: true }));
}

describe("PianoSurface keys", () => {
  test("interactive keys are named buttons carrying note, state and fingering", async () => {
    const { router } = setup();
    render(PianoSurface, {
      router,
      notes: ["C4", "E4", "G4"],
      highlights: { 60: "target", 64: { role: "target", hand: "left" }, 67: "wrong" },
      fingerings: { 60: 1 },
    });
    await tick();

    expect(
      document.querySelector('[role="group"][aria-label="On-screen keyboard"]'),
    ).not.toBeNull();
    expect(key("C4").tagName).toBe("BUTTON");
    expect(key("C4").getAttribute("aria-label")).toBe("C4, target, finger 1");
    expect(key("E4").getAttribute("aria-label")).toBe("E4, target, left hand");
    expect(key("G4").getAttribute("aria-label")).toBe("G4, wrong");
    expect(key("D4").getAttribute("aria-label")).toBe("D4");
    expect(key("C4").getAttribute("aria-pressed")).toBe("false");
    expect(document.querySelector('[data-testid="finger-60"]')?.textContent?.trim()).toBe("1");
    // Consumers find keys by their note label, so it stays the only key text.
    expect(key("C4").textContent?.trim()).toBe("C4");
    expect(key("C#4").textContent?.trim()).toBe("C#4");
  });

  test("keys show visible focus for keyboard users", async () => {
    const { router } = setup();
    render(PianoSurface, { router, notes: ["C4"] });
    await tick();

    expect(key("C4").className).toContain("focus-visible:ring-2");
  });

  test("correctness outranks holds, holds outrank targets, targets outrank tone roles", async () => {
    const { router } = setup();
    render(PianoSurface, {
      router,
      notes: [60, 67],
      highlights: { 60: "correct", 62: "target", 65: "upcoming" },
      toneRoles: { 60: "chord", 62: "chord", 64: "chord", 65: "chord" },
    });
    await tick();

    expect(key("C4").dataset.state).toBe("correct");
    expect(key("D4").dataset.state).toBe("target");
    expect(key("E4").dataset.state).toBe("chord");
    expect(key("F4").dataset.state).toBe("upcoming");
    expect(key("G4").dataset.state).toBe("neutral");

    pointer("pointerdown", key("D4"), 1);
    await tick();
    expect(key("D4").dataset.state).toBe("active");
    expect(key("D4").getAttribute("aria-pressed")).toBe("true");
  });

  test("a non-interactive surface contributes no key tab stops", async () => {
    render(PianoSurface, { notes: ["C4"], interactive: false });
    await tick();

    expect(document.querySelectorAll("button")).toHaveLength(0);
    expect(key("C4").tagName).toBe("DIV");
    expect(key("C4").getAttribute("aria-hidden")).toBe("true");
  });
});

describe("PianoSurface input", () => {
  test("touch down and up route one paired note per key, chords included", async () => {
    const { router, routed } = setup();
    render(PianoSurface, { router, notes: ["C4", "E4"] });
    await tick();

    pointer("pointerdown", key("C4"), 1);
    pointer("pointerdown", key("E4"), 2);
    expect(pairs(routed)).toEqual(["noteOn:60", "noteOn:64"]);

    pointer("pointerup", key("C4"), 1);
    pointer("pointerup", key("E4"), 2);
    expect(pairs(routed)).toEqual(["noteOn:60", "noteOn:64", "noteOff:60", "noteOff:64"]);

    await tick();
    expect(key("C4").getAttribute("aria-pressed")).toBe("false");
  });

  test("a plain activation plays one momentary note, so a repeated note re-attacks", async () => {
    const { router, routed } = setup();
    render(PianoSurface, { router, notes: ["C4"] });
    await tick();

    key("C4").click();
    key("C4").click();

    expect(pairs(routed)).toEqual(["noteOn:60", "noteOff:60", "noteOn:60", "noteOff:60"]);
  });

  test("keyboard activation latches, and Clear held notes releases it", async () => {
    const { router, routed } = setup();
    render(PianoSurface, { router, notes: ["C4"] });
    await tick();

    activate("C4", "Enter");
    expect(pairs(routed)).toEqual(["noteOn:60"]);
    await tick();
    expect(key("C4").getAttribute("aria-pressed")).toBe("true");

    const clear = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "Clear held notes",
    );
    expect(clear).toBeDefined();
    clear?.click();

    expect(pairs(routed)).toEqual(["noteOn:60", "noteOff:60"]);
  });

  test("one QWERTY press produces exactly one router event", async () => {
    const { router, routed } = setup();
    render(PianoSurface, { router, notes: ["C4", "E4", "G4"] });
    await tick();

    windowKey("keydown", { key: "a", code: "KeyA" });
    windowKey("keydown", { key: "a", code: "KeyA", repeat: true });
    expect(pairs(routed)).toEqual(["noteOn:60"]);

    windowKey("keyup", { key: "a", code: "KeyA" });
    expect(pairs(routed)).toEqual(["noteOn:60", "noteOff:60"]);

    windowKey("keydown", { key: "w", code: "KeyW" });
    expect(pairs(routed)).toEqual(["noteOn:60", "noteOff:60", "noteOn:61"]);
  });

  test("QWERTY ignores modifiers and typing fields", async () => {
    const { router, routed } = setup();
    render(PianoSurface, { router, notes: ["C4"] });
    await tick();
    const field = document.createElement("input");
    document.body.append(field);

    windowKey("keydown", { key: "a", code: "KeyA", metaKey: true });
    windowKey("keydown", { key: "a", code: "KeyA", ctrlKey: true });
    windowKey("keydown", { key: "z", code: "KeyZ" });
    field.focus();
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "a", code: "KeyA", bubbles: true }));

    expect(routed).toHaveLength(0);
    field.remove();
  });

  test("a wait-mode surface drops its latch when a foreign attack is accepted", async () => {
    const { router, routed } = setup();
    render(PianoSurface, { router, notes: ["C4"], waitGroupKey: "group-1:0" });
    await tick();

    activate("C4", "Enter");
    expect(pairs(routed)).toEqual(["noteOn:60"]);

    router.noteOn(64, "midi", "piano");

    // No synthetic off is routed; the local hold simply goes away.
    expect(pairs(routed)).toEqual(["noteOn:60", "noteOn:64"]);
    await tick();
    expect(key("C4").getAttribute("aria-pressed")).toBe("false");
  });

  test("a surface without a wait group key keeps its latch through a foreign attack", async () => {
    const { router, routed } = setup();
    render(PianoSurface, { router, notes: ["C4"] });
    await tick();

    activate("C4", "Enter");
    router.noteOn(64, "midi", "piano");

    expect(pairs(routed)).toEqual(["noteOn:60", "noteOn:64"]);
    await tick();
    expect(key("C4").getAttribute("aria-pressed")).toBe("true");
  });
});

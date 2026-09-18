import { tick } from "svelte";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { monotonicMs, type NoteEvent } from "@repo/music-core/domain";
import { InputRouter } from "@repo/music-core/engines/input-router";

import "../../../../app.css";

import PianoSurface from "./PianoSurface.svelte";
import { keyPercent, noteLane, pianoGeometry } from "./piano-geometry";

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

/** A full mouse click: the pointer pair the browser sends, then the click. */
function mouseClick(note: string, pointerId: number): void {
  pointer("pointerdown", key(note), pointerId);
  pointer("pointerup", key(note), pointerId);
  key(note).click();
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
    expect(key("C4").getAttribute("aria-description")).toBe("Middle C");
    expect(key("D4").getAttribute("aria-description")).toBeNull();
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

  test("a static diagram says its highlights, hands and tone roles once, in text", async () => {
    render(PianoSurface, {
      lowMidi: 60,
      highMidi: 71,
      interactive: false,
      label: "Piano voicing",
      highlights: {
        60: { role: "target", hand: "left" },
        64: { role: "target", hand: "right" },
      },
      fingerings: { 60: 5 },
      toneRoles: { 62: "scale", 61: "avoid" },
    });
    await tick();

    const summaries = document.querySelectorAll('[data-testid="piano-summary"]');
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.textContent).toBe(
      "C4, target, left hand, finger 5; C#4, avoid; D4, scale tone; E4, target, right hand",
    );
    // Meaning survives without colour: the roles are attributes and text too.
    expect(key("C4").dataset.state).toBe("target-left");
    expect(key("E4").dataset.state).toBe("target-right");
    expect(key("D4").getAttribute("data-tone-role")).toBe("scale");
    // ...and no key, marker, or summary is focusable.
    expect(document.querySelectorAll("button, [tabindex], [disabled]")).toHaveLength(0);
  });
});

describe("PianoSurface hands", () => {
  test("hand targets carry a form marker and a legend, not hue alone", async () => {
    render(PianoSurface, {
      lowMidi: 60,
      highMidi: 71,
      interactive: false,
      highlights: {
        60: { role: "target", hand: "left" },
        64: { role: "target", hand: "right" },
        67: "target",
      },
    });
    await tick();

    // Left = outlined ring, right = solid fill, both from the hand tokens.
    expect(key("C4").className).toContain("ring-hand-left");
    expect(key("E4").className).toContain("bg-hand-right");
    expect(key("G4").className).not.toMatch(/hand-/);
    // An L / R glyph sits on every hand-tagged key; a plain target has none.
    expect(document.querySelector('[data-testid="hand-marker-60"]')?.textContent).toBe("L");
    expect(document.querySelector('[data-testid="hand-marker-64"]')?.textContent).toBe("R");
    expect(document.querySelector('[data-testid="hand-marker-67"]')).toBeNull();
    // The surface owns the legend, so no route needs to draw its own.
    const legend = document.querySelector('[data-testid="piano-hand-legend"]');
    expect(legend?.textContent).toContain("Left hand");
    expect(legend?.textContent).toContain("Right hand");
    // Markers and legend add no tab stops to a static diagram.
    expect(document.querySelectorAll("button, [tabindex], [disabled]")).toHaveLength(0);
  });

  test("a surface without hand data shows no legend or markers", async () => {
    render(PianoSurface, { notes: ["C4"], highlights: { 60: "target" }, interactive: false });
    await tick();

    expect(document.querySelector('[data-testid="piano-hand-legend"]')).toBeNull();
    expect(document.querySelector('[data-testid^="hand-marker-"]')).toBeNull();
  });

  test("the surface never colours hands from the chart palette", () => {
    // Chart tokens swap hue between light and dark; hands must not.
    const sources = import.meta.glob("./PianoSurface.svelte", {
      query: "?raw",
      eager: true,
    }) as Record<string, { default: string }>;
    const source = Object.values(sources)[0]?.default ?? "";
    expect(source.length).toBeGreaterThan(0);
    expect(source).not.toMatch(/chart-\d/);
  });
});

describe("PianoSurface waterfall", () => {
  const timelineNotes = [
    { midiNote: 60, startBeat: 0, durationBeats: 1, hand: "left" as const },
    { midiNote: 64, startBeat: 2, durationBeats: 1, hand: "right" as const },
    { midiNote: 67, startBeat: 8, durationBeats: 1, hand: "right" as const },
  ];

  function fallen(): Array<{ note: string; bottom: string; height: string; hand?: string }> {
    return [...document.querySelectorAll<HTMLElement>('[data-testid="waterfall-note"]')].map(
      (element) => ({
        note: element.dataset.note ?? "",
        bottom: element.style.bottom,
        height: element.style.height,
        hand: element.dataset.hand,
      }),
    );
  }

  test("positions falling notes from startBeat minus positionBeat", async () => {
    render(PianoSurface, { notes: [60, 67], timelineNotes, positionBeat: 0 });
    await tick();

    // A 4-beat lane: beat 2 sits halfway up, beat 8 is out of view entirely.
    expect(fallen()).toEqual([
      { note: "60", bottom: "0%", height: "25%", hand: "left" },
      { note: "64", bottom: "50%", height: "25%", hand: "right" },
    ]);
    // A note lands exactly on its own key: the lane *is* the key's box.
    const geometry = pianoGeometry({ notes: [60, 67] });
    const box = keyPercent(geometry, noteLane(geometry, 60)!);
    const lane = document.querySelector<HTMLElement>('[data-testid="waterfall-note"]');
    expect(lane?.style.left).toBe(`${box.left}%`);
    expect(lane?.style.width).toBe(`${box.width}%`);
  });

  test("advancing the position moves notes down and lights the keys they reach", async () => {
    const surface = render(PianoSurface, { notes: [60, 67], timelineNotes, positionBeat: 0 });
    await tick();
    expect(key("C4").dataset.state).toBe("sounding-left");
    expect(key("E4").dataset.state).toBe("upcoming");
    expect(key("G4").dataset.state).toBe("neutral");

    surface.rerender({ notes: [60, 67], timelineNotes, positionBeat: 2 });
    await tick();

    expect(fallen()).toEqual([{ note: "64", bottom: "0%", height: "25%", hand: "right" }]);
    expect(key("C4").dataset.state).toBe("neutral");
    expect(key("E4").dataset.state).toBe("sounding-right");
    // Hand and playback state are said in text, not only in colour.
    expect(document.querySelector('[data-testid="piano-summary"]')?.textContent).toBe(
      "E4, sounding, right hand",
    );
  });

  test("input and target state outrank playback highlights", async () => {
    const { router } = setup();
    render(PianoSurface, {
      router,
      notes: [60, 67],
      timelineNotes,
      positionBeat: 0,
      highlights: { 60: "wrong" },
    });
    await tick();

    expect(key("C4").dataset.state).toBe("wrong");
  });

  test("reduced motion drops the lane and keeps the static note highlights", async () => {
    const listeners: Array<() => void> = [];
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("reduced-motion"),
      addEventListener: (_: string, listener: () => void) => listeners.push(listener),
      removeEventListener: () => undefined,
    }));

    render(PianoSurface, { notes: [60, 67], timelineNotes, positionBeat: 0 });
    await tick();

    expect(document.querySelector('[data-testid="piano-waterfall"]')).toBeNull();
    expect(fallen()).toEqual([]);
    expect(key("C4").dataset.state).toBe("sounding-left");
    expect(key("E4").dataset.state).toBe("upcoming");
    expect(document.querySelector('[data-testid="piano-summary"]')?.textContent).toBe(
      "C4, sounding, left hand; E4, upcoming",
    );
    vi.unstubAllGlobals();
  });

  test("hand mute asks the route and renders the authoritative answer", async () => {
    const requested: string[][] = [];
    const surface = render(PianoSurface, {
      notes: [60, 67],
      timelineNotes,
      positionBeat: 0,
      mutedHands: [],
      onMutedHandsChange: (hands) => requested.push(hands),
    });
    await tick();

    const left = document.querySelector<HTMLButtonElement>('[data-testid="mute-left"]');
    expect(left?.getAttribute("aria-pressed")).toBe("false");
    left?.click();

    // The surface only requests: nothing changes until the route says so.
    expect(requested).toEqual([["left"]]);
    await tick();
    expect(left?.getAttribute("aria-pressed")).toBe("false");

    surface.rerender({
      notes: [60, 67],
      timelineNotes,
      positionBeat: 0,
      mutedHands: ["left"],
      onMutedHandsChange: (hands: string[]) => requested.push(hands),
    });
    await tick();

    expect(
      document
        .querySelector<HTMLButtonElement>('[data-testid="mute-left"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      document.querySelector<HTMLElement>('[data-testid="waterfall-note"]')?.dataset.muted,
    ).toBe("true");
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

  test("a wait-mode chord target latches pointer clicks by default and says what is held", async () => {
    const { router, routed } = setup();
    render(PianoSurface, {
      router,
      notes: ["C4", "E4", "G4"],
      waitGroupKey: "group-3:1",
      highlights: { 60: "target", 64: "target" },
    });
    await tick();

    // Two target notes, one mouse: the click latches instead of releasing.
    mouseClick("C4", 1);
    expect(pairs(routed)).toEqual(["noteOn:60"]);
    await tick();
    expect(key("C4").getAttribute("aria-pressed")).toBe("true");
    const chip = () => document.querySelector('[data-testid="piano-holding"]');
    expect(chip()?.textContent).toContain("Holding");
    expect(chip()?.textContent).toContain("C4");

    mouseClick("E4", 2);
    await tick();
    expect(pairs(routed)).toEqual(["noteOn:60", "noteOn:64"]);
    expect(chip()?.textContent).toContain("E4");

    const clear = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "Clear held notes",
    );
    clear?.click();
    await tick();
    expect(pairs(routed)).toEqual(["noteOn:60", "noteOn:64", "noteOff:60", "noteOff:64"]);
    expect(chip()).toBeNull();
  });

  test("a single-note wait group and a sequence drill keep press-and-hold", async () => {
    const { router, routed } = setup();
    const single = render(PianoSurface, {
      router,
      notes: ["C4", "E4"],
      waitGroupKey: "group-0:1",
      highlights: { 60: "target" },
    });
    await tick();

    pointer("pointerdown", key("C4"), 1);
    pointer("pointerup", key("C4"), 1);
    expect(pairs(routed)).toEqual(["noteOn:60", "noteOff:60"]);
    await tick();
    expect(document.querySelector('[data-testid="piano-holding"]')).toBeNull();
    single.unmount();

    // Many lit targets without a wait group is a sequence, not a chord.
    routed.length = 0;
    render(PianoSurface, {
      router,
      notes: ["C4", "E4", "G4"],
      highlights: { 60: "target", 64: "target", 67: "target" },
    });
    await tick();
    pointer("pointerdown", key("E4"), 2);
    pointer("pointerup", key("E4"), 2);
    expect(pairs(routed)).toEqual(["noteOn:64", "noteOff:64"]);
  });

  test("pointerMode=latch builds a chord from sequential clicks, cleared on demand", async () => {
    const { router, routed } = setup();
    render(PianoSurface, { router, notes: ["C4", "E4", "G4"], pointerMode: "latch" });
    await tick();

    // One mouse can hold only one key, so each click latches instead.
    mouseClick("C4", 1);
    mouseClick("E4", 2);
    mouseClick("G4", 3);
    expect(pairs(routed)).toEqual(["noteOn:60", "noteOn:64", "noteOn:67"]);

    await tick();
    expect(key("C4").getAttribute("aria-pressed")).toBe("true");

    // Clicking a latched key again releases just that one.
    mouseClick("E4", 4);
    expect(pairs(routed)).toEqual(["noteOn:60", "noteOn:64", "noteOn:67", "noteOff:64"]);

    await tick();
    const clear = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "Clear held notes",
    );
    clear?.click();
    expect(pairs(routed).slice(4)).toEqual(["noteOff:60", "noteOff:67"]);
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

  test("router noteOn events from midi mark keys active independently, and noteOff releases just one", async () => {
    const { router } = setup();
    render(PianoSurface, { router, notes: ["C4", "E4"] });
    await tick();

    router.noteOn(60, "midi", "piano");
    router.noteOn(64, "midi", "piano");
    await tick();
    expect(key("C4").dataset.state).toBe("active");
    expect(key("E4").dataset.state).toBe("active");

    router.push({
      type: "noteOff",
      midiNote: 60,
      source: "midi",
      instrument: "piano",
      timestamp: monotonicMs(0),
      clock: "performance",
    });
    await tick();
    expect(key("C4").dataset.state).toBe("neutral");
    expect(key("E4").dataset.state).toBe("active");
  });

  test("a latched, focused white key's inset focus never covers the black key beside it", async () => {
    const { router } = setup();
    render(PianoSurface, { router, notes: ["C4", "D4"] });
    await tick();

    const d4 = key("D4");
    d4.focus();
    activate("D4", "Enter"); // latch it
    await tick();
    expect(d4.getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(d4);

    const sharp = key("C#4");
    const rect = sharp.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    expect(hit?.closest("[data-note]")).toBe(sharp);
  });
});

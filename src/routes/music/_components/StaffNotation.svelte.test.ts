import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import type { NotationView } from "@repo/music-core/engines/notation";
import type { ScoreSelectionMap } from "@repo/music-core/engines/score-practice";

import StaffNotation from "./StaffNotation.svelte";

afterEach(() => vi.restoreAllMocks());

describe("StaffNotation", () => {
  test("renders a notation view as an accessible VexFlow SVG", async () => {
    const onError = vi.fn();
    render(StaffNotation, {
      view: notationFixture(),
      activeEventIds: ["note:right-hand:0:1"],
      onError,
    });

    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Staff notation"] svg')).not.toBeNull(),
    );
    expect(document.querySelector('[data-event-id="note:right-hand:0:1"]')).not.toBeNull();
    const host = document.querySelector<HTMLElement>('[aria-label="Staff notation"]')!;
    host.style.color = "rgb(255, 255, 255)";
    expect(getComputedStyle(host.querySelector("path")!).stroke).toBe("rgb(255, 255, 255)");
    expect(getComputedStyle(host.querySelector("text")!).fill).toBe("rgb(255, 255, 255)");
    expect(onError).not.toHaveBeenCalled();
  });

  test("emits canonical note-group ranges for forward and reverse drags", async () => {
    mockNotationRects();
    const onSelectionChange = vi.fn();
    render(StaffNotation, {
      view: notationFixture(),
      selectionMap: selectionMap(),
      selectionEnabled: true,
      snap: "note-group",
      onSelectionChange,
    });

    const host = await notationHost();
    drag(host, 15, 105);
    drag(host, 105, 15);

    expect(onSelectionChange).toHaveBeenNthCalledWith(1, { startBeat: 0, endBeat: 8 });
    expect(onSelectionChange).toHaveBeenNthCalledWith(2, { startBeat: 0, endBeat: 8 });
  });

  test("supports two-tap measure selection and renders named range overlays", async () => {
    mockNotationRects();
    const onSelectionChange = vi.fn();
    render(StaffNotation, {
      view: notationFixture(),
      selectionMap: selectionMap(),
      selectionEnabled: true,
      snap: "measure",
      highlightedRanges: [
        { id: "a", startBeat: 0, endBeat: 4 },
        { id: "b", startBeat: 4, endBeat: 8, active: true },
      ],
      onSelectionChange,
    });

    const host = await notationHost();
    tap(host, 15);
    tap(host, 105);

    expect(onSelectionChange).toHaveBeenCalledWith({ startBeat: 0, endBeat: 8 });
    expect(document.querySelectorAll("[data-notation-highlight]")).toHaveLength(2);
    expect(
      document.querySelector('[data-notation-highlight="b"]')?.getAttribute("data-active"),
    ).toBe("true");
  });

  test("draws a pending Start handle and a hint after the first tap", async () => {
    mockNotationRects();
    const onSelectionChange = vi.fn();
    render(StaffNotation, {
      view: notationFixture(),
      selectionMap: selectionMap(),
      selectionEnabled: true,
      snap: "measure",
      onSelectionChange,
    });

    const host = await notationHost();
    tap(host, 15);

    expect(onSelectionChange).not.toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(document.querySelector('[data-range-handle="start"]')).not.toBeNull(),
    );
    expect(document.querySelector('[data-range-handle="start"]')?.getAttribute("aria-label")).toBe(
      "Start of the practice range, bar 1",
    );
    expect(document.querySelector('[data-range-handle="end"]')).toBeNull();
    expect(document.body.textContent).toContain("Now tap the end bar");
  });

  test("completes a one-bar range from two taps on the same bar", async () => {
    mockNotationRects();
    const onSelectionChange = vi.fn();
    render(StaffNotation, {
      view: notationFixture(),
      selectionMap: selectionMap(),
      selectionEnabled: true,
      snap: "measure",
      onSelectionChange,
    });

    const host = await notationHost();
    tap(host, 15);
    tap(host, 15);

    expect(onSelectionChange).toHaveBeenCalledWith({ startBeat: 0, endBeat: 4 });
  });

  test("forgets a half-finished tap when selection is handed back and taken again", async () => {
    mockNotationRects();
    const onSelectionChange = vi.fn();
    const props = {
      view: notationFixture(),
      selectionMap: selectionMap(),
      selectionEnabled: true,
      snap: "measure" as const,
      onSelectionChange,
    };
    const view = render(StaffNotation, props);

    const host = await notationHost();
    tap(host, 15);
    await vi.waitFor(() =>
      expect(document.querySelector('[data-range-handle="start"]')).not.toBeNull(),
    );

    // Practice starts, then is cancelled: the pending Start must not survive.
    await view.rerender({ ...props, selectionEnabled: false });
    await view.rerender({ ...props, selectionEnabled: true });
    tap(await notationHost(), 105);

    expect(onSelectionChange).not.toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(
        document.querySelector('[data-range-handle="start"]')?.getAttribute("aria-label"),
      ).toBe("Start of the practice range, bar 2"),
    );
  });

  test("labels both ends of a committed range with Start, End and their bars", async () => {
    mockNotationRects();
    render(StaffNotation, {
      view: notationFixture(),
      selectionMap: selectionMap(),
      customSelection: { startBeat: 0, endBeat: 8 },
      selectionEnabled: true,
      snap: "measure",
    });

    await notationHost();

    const labels = [...document.querySelectorAll("[data-range-handle]")].map((handle) => [
      handle.getAttribute("data-range-handle"),
      handle.getAttribute("aria-label"),
      handle.textContent?.trim(),
    ]);
    expect(labels).toEqual([
      ["start", "Start of the practice range, bar 1", "Start"],
      ["end", "End of the practice range, bar 2", "End"],
    ]);
  });

  test("marks active noteheads and active range cursors for score following", async () => {
    mockNotationRects();
    render(StaffNotation, {
      view: notationFixture(),
      activeEventIds: ["note:right-hand:4:1"],
      highlightedRanges: [{ id: "current-group", startBeat: 4, endBeat: 5, active: true }],
    });

    await notationHost();

    expect(
      document
        .querySelector('[data-event-id="note:right-hand:4:1"]')
        ?.getAttribute("data-active-note"),
    ).toBe("true");
    expect(document.querySelector('[data-notation-cursor="current-group"]')).not.toBeNull();
    expect(document.querySelector('[data-notation-cursor-label="current-group"]')).not.toBeNull();
  });

  test("keeps selection inert when the renderer interaction is disabled", async () => {
    mockNotationRects();
    const onSelectionChange = vi.fn();
    render(StaffNotation, {
      view: notationFixture(),
      selectionMap: selectionMap(),
      selectionEnabled: false,
      snap: "note-group",
      onSelectionChange,
    });

    const host = await notationHost();
    drag(host, 15, 105);

    expect(onSelectionChange).not.toHaveBeenCalled();
    expect(document.querySelector('[data-event-id="note:right-hand:0:1"]')).not.toBeNull();
  });
});

function notationFixture(): NotationView {
  return {
    keySignature: "C major",
    timeSignature: { numerator: 4, denominator: 4 },
    staves: [{ id: "treble", clef: "treble", voiceIds: ["right-hand"] }],
    measures: [
      {
        index: 0,
        startBeat: 0,
        durationBeats: 4,
        ties: [],
        tuplets: [],
        events: [
          {
            id: "note:right-hand:0:1",
            kind: "note",
            voiceId: "right-hand",
            staff: "treble",
            startBeat: 0,
            durationBeats: 1,
            duration: "q",
            dots: 0,
            pitches: [{ step: "C", octave: 4 }],
          },
        ],
      },
      {
        index: 1,
        startBeat: 4,
        durationBeats: 4,
        ties: [],
        tuplets: [],
        events: [
          {
            id: "note:right-hand:4:1",
            kind: "note",
            voiceId: "right-hand",
            staff: "treble",
            startBeat: 4,
            durationBeats: 1,
            duration: "q",
            dots: 0,
            pitches: [{ step: "D", octave: 4 }],
          },
        ],
      },
    ],
  };
}

function selectionMap(): ScoreSelectionMap {
  return {
    measureBoundaries: [
      { id: "measure:0", beat: 0, kind: "score-start", measureIndex: 0 },
      { id: "measure:1", beat: 4, kind: "measure", measureIndex: 1 },
      { id: "measure:2", beat: 8, kind: "score-end", measureIndex: 1 },
    ],
    noteGroupBoundaries: [
      { id: "note:0", beat: 0, kind: "score-start", measureIndex: 0 },
      { id: "note:1", beat: 4, kind: "note-group", measureIndex: 1 },
      { id: "note:2", beat: 8, kind: "score-end", measureIndex: 1 },
    ],
  };
}

async function notationHost(): Promise<HTMLElement> {
  await vi.waitFor(() =>
    expect(document.querySelector('[aria-label="Staff notation"] svg')).not.toBeNull(),
  );
  return document.querySelector<HTMLElement>('[aria-label="Staff notation"]')!;
}

function drag(host: HTMLElement, startX: number, endX: number): void {
  host.dispatchEvent(pointer("pointerdown", startX));
  host.dispatchEvent(pointer("pointermove", endX));
  host.dispatchEvent(pointer("pointerup", endX));
}

function tap(host: HTMLElement, x: number): void {
  host.dispatchEvent(pointer("pointerdown", x, "touch"));
  host.dispatchEvent(pointer("pointerup", x, "touch"));
}

function pointer(type: string, clientX: number, pointerType = "mouse"): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    clientX,
    clientY: 5,
    pointerId: 1,
    pointerType,
  });
}

function mockNotationRects(): void {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const element = this as HTMLElement;
    const kind = element.dataset.selectionKind;
    const start = Number(element.dataset.startBeat ?? 0);
    if (kind === "measure" || kind === "note-group") {
      const left = start === 0 ? 10 : 100;
      return domRect(left, 0, left + 20, 10);
    }
    return domRect(0, 0, 200, 300);
  });
}

function domRect(left: number, top: number, right: number, bottom: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    toJSON: () => ({}),
  };
}

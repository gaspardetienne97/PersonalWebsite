import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";
import { userEvent } from "vitest/browser";

import type { NoteEvent } from "@repo/music-core/domain";
import { InputRouter } from "@repo/music-core/engines/input-router";
import { curatedTunings } from "@repo/music-core/engines/tunings";

import FretboardInput from "./FretboardInput.svelte";
import "../../../../../app.css";

afterEach(() => {
  document.body.replaceChildren();
});

describe("FretboardInput", () => {
  test("renders conventional string numbers and emits selected fret pitches", () => {
    const router = new InputRouter({ now: () => 12 });
    const tuning = curatedTunings("guitar")[0]!;
    let accepted: NoteEvent | undefined;
    router.subscribe((event) => {
      accepted = event;
    });
    render(FretboardInput, {
      tuning,
      targetMidiNotes: [64],
      activeMidiNotes: [],
      wrongMidiNotes: [],
      router,
      visibleFrets: 5,
    });

    expect(document.querySelector('[aria-label="String 1 fret 0, E4, target"]')).not.toBeNull();
    document
      .querySelector<HTMLButtonElement>('[aria-label="String 1 fret 0, E4, target"]')
      ?.click();

    expect(accepted).toMatchObject({
      type: "noteOn",
      midiNote: 64,
      source: "onscreen",
      instrument: "guitar",
      inputProfileId: "guitar.standard",
      fretPosition: { stringNumber: 1, fretNumber: 0 },
    });
  });

  test("interval recall hides answer names in the keyboard, focus mirror and visual dots", async () => {
    const router = new InputRouter();
    render(FretboardInput, {
      tuning: curatedTunings("guitar")[0]!,
      router,
      visibleFrets: 4,
      hideNoteNames: true,
      anchorPosition: { stringNumber: 1, fretNumber: 0 },
    });
    const anchor = document.querySelector<HTMLButtonElement>(
      '[aria-label="String 1 fret 0, anchor"]',
    );
    expect(anchor).not.toBeNull();
    anchor!.focus();
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="fretboard-focus"]')?.textContent).toContain(
        "String 1, fret 0",
      ),
    );
    expect(document.querySelector('[data-testid="fretboard-focus"]')?.textContent).not.toContain(
      "E4",
    );
    expect(document.querySelector('[aria-label*="fret 3, G4"]')).toBeNull();
    await vi.waitFor(() => expect(document.querySelector("svg")?.textContent).toContain("A"));
  });

  test.each([
    { theme: "light", stage: "#ffffff", ink: "#111111" },
    { theme: "dark", stage: "#111111", ink: "#ffffff" },
  ])("uses the contrasting stage token pair for the anchor in $theme", async ({ stage, ink }) => {
    const tokens = document.createElement("style");
    tokens.textContent = `:root { --stage: ${stage}; --stage-foreground: ${ink}; --foreground: ${ink}; }`;
    document.head.append(tokens);
    try {
      render(FretboardInput, {
        tuning: curatedTunings("guitar")[0]!,
        router: new InputRouter(),
        visibleFrets: 4,
        hideNoteNames: true,
        anchorPosition: { stringNumber: 1, fretNumber: 0 },
      });
      await vi.waitFor(() => expect(document.querySelector(".dot-text")?.textContent).toBe("A"));
      expect(document.querySelector(".dot-circle")).toHaveAttribute("fill", ink);
      expect(document.querySelector(".dot-text")).toHaveAttribute("fill", stage);
    } finally {
      tokens.remove();
    }
  });

  test("labels and colors highlighted visual fretboard notes", async () => {
    render(FretboardInput, {
      tuning: curatedTunings("guitar")[0]!,
      router: new InputRouter(),
      targetMidiNotes: [64],
      correctMidiNotes: [65],
      wrongMidiNotes: [66],
      visibleStrings: [1],
      visibleFrets: 2,
    });

    await vi.waitFor(() => expect(document.querySelector(".dot-text")?.textContent).toBe("E"));

    const labels = [...document.querySelectorAll(".dot-text")].map((node) => node.textContent);
    expect(labels).toEqual(["E", "F", "F#"]);

    const fills = [...document.querySelectorAll(".dot-circle")].map((node) =>
      node.getAttribute("fill"),
    );
    expect(new Set(fills).size).toBe(3);
    expect(fills.every((fill) => fill && fill !== "transparent")).toBe(true);
  });

  test("rebuilds the visual fretboard when switching between guitar and ukulele", async () => {
    const router = new InputRouter();
    const guitar = curatedTunings("guitar")[0]!;
    const ukulele = curatedTunings("ukulele")[0]!;
    const result = render(FretboardInput, {
      tuning: guitar,
      router,
      visibleFrets: 4,
    });

    await vi.waitFor(() => expect(visualStringCount()).toBe(6));
    await result.rerender({
      tuning: ukulele,
      router,
      visibleFrets: 4,
    });

    await vi.waitFor(() => expect(visualStringCount()).toBe(4));
    expect(document.querySelectorAll("svg").length).toBe(1);
  });

  test("can render only selected strings for focused drills", () => {
    render(FretboardInput, {
      tuning: curatedTunings("guitar")[0]!,
      router: new InputRouter(),
      visibleStrings: [6],
      visibleFrets: 8,
    });

    expect(document.querySelector('[aria-label^="String 6 fret 5,"]')).not.toBeNull();
    expect(document.querySelector('[aria-label^="String 1 fret 5,"]')).toBeNull();
  });

  test("mirrors keyboard focus on the visual fretboard and preserves activation", async () => {
    const router = new InputRouter();
    const accepted = vi.fn();
    render(FretboardInput, {
      tuning: curatedTunings("guitar")[0]!,
      router,
      targetMidiNotes: [45],
      visibleStrings: [6],
      visibleFrets: 5,
      onAccepted: accepted,
    });
    const focused = document.querySelector<HTMLButtonElement>(
      '[aria-label="String 6 fret 5, A2, target"]',
    )!;

    const buttons = [
      ...document.querySelectorAll<HTMLButtonElement>('button[aria-label^="String 6 fret"]'),
    ];
    buttons[buttons.indexOf(focused) - 1]!.focus();
    await userEvent.keyboard("{Tab}");
    expect(document.activeElement).toBe(focused);
    await vi.waitFor(() => {
      expect(document.querySelector('[data-testid="fretboard-focus"]')?.textContent).toContain(
        "String 6, fret 5, A2",
      );
      expect(document.querySelector('.dot-circle[stroke-width="4"]')).not.toBeNull();
    });

    await userEvent.keyboard("{Enter}");
    expect(accepted).toHaveBeenCalledOnce();
    await userEvent.keyboard(" ");
    expect(accepted).toHaveBeenCalledTimes(2);

    focused.blur();
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="fretboard-focus"]')).toBeNull(),
    );
  });
});

describe("FretboardInput fret window", () => {
  test("keeps a bounded fretboard readable through resize and preserves position input", async () => {
    const accepted = vi.fn();
    const result = render(FretboardInput, {
      tuning: curatedTunings("guitar")[0]!,
      router: new InputRouter(),
      fretWindow: { start: 5, end: 9 },
      hideNoteNames: true,
      anchorPosition: { stringNumber: 1, fretNumber: 5 },
      onAccepted: accepted,
    });
    const button = result.container.querySelector<HTMLButtonElement>(
      '[aria-label="String 1 fret 5, anchor"]',
    )!;
    button.focus();
    for (const width of [280, 900, 280]) {
      result.container.style.width = `${width}px`;
      await vi.waitFor(() => {
        const label = result.container.querySelector(".dot-text")!;
        expect(label?.textContent).toBe("A");
        expect(label.getBoundingClientRect().height).toBeGreaterThanOrEqual(10);
        const strings = result.container.querySelectorAll(".strings line");
        expect(
          strings[1]!.getBoundingClientRect().y - strings[0]!.getBoundingClientRect().y,
        ).toBeGreaterThanOrEqual(26);
        expect(
          result.container.querySelector("svg")!.getBoundingClientRect().width,
        ).toBeGreaterThan(width - 40);
        const svg = result.container.querySelector("svg")!;
        expect(
          Math.abs(svg.viewBox.baseVal.width - svg.getBoundingClientRect().width),
        ).toBeLessThan(1);
        expect(result.container.scrollWidth).toBeLessThanOrEqual(width);
      });
      expect(document.activeElement).toBe(button);
      expect(result.container.querySelector('.dot-circle[stroke-width="4"]')).not.toBeNull();
      const dot = result.container.querySelector(".dot-circle")!.getBoundingClientRect();
      result.container.querySelector(".hoverDiv")!.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          clientX: dot.x + dot.width / 2,
          clientY: dot.y + dot.height / 2,
        }),
      );
      await userEvent.keyboard("{Enter}");
    }
    expect(accepted).toHaveBeenCalledTimes(6);
    for (const [event] of accepted.mock.calls) {
      expect(event).toMatchObject({
        midiNote: 69,
        fretPosition: { stringNumber: 1, fretNumber: 5 },
      });
    }
  });

  test("keeps whole-neck labels separated in a local scroller", async () => {
    const result = render(FretboardInput, {
      tuning: curatedTunings("guitar")[0]!,
      router: new InputRouter(),
      visibleFrets: 22,
      targetMidiNotes: [84, 85, 86],
      visibleStrings: [1],
    });
    result.container.style.width = "280px";
    await vi.waitFor(() => {
      const labels = [...result.container.querySelectorAll(".dot-text")];
      expect(labels).toHaveLength(3);
      expect(labels[0]!.getBoundingClientRect().height).toBeGreaterThanOrEqual(10);
      expect(
        labels[1]!.getBoundingClientRect().left - labels[0]!.getBoundingClientRect().right,
      ).toBeGreaterThanOrEqual(10);
    });
    const scroller = result.container.querySelector<HTMLElement>('[aria-hidden="true"]')!;
    expect(scroller.scrollWidth).toBeGreaterThan(scroller.clientWidth);
    result.container
      .querySelector<HTMLButtonElement>('[aria-label="String 1 fret 22, D6, target"]')!
      .focus();
    await vi.waitFor(() => {
      const focused = result.container
        .querySelector('.dot-circle[stroke-width="4"]')!
        .getBoundingClientRect();
      const bounds = scroller.getBoundingClientRect();
      expect(scroller.scrollLeft).toBeGreaterThan(0);
      expect(focused.left).toBeGreaterThanOrEqual(bounds.left);
      expect(focused.right).toBeLessThanOrEqual(bounds.right);
    });
    expect(result.container.scrollWidth).toBeLessThanOrEqual(280);
  });

  test("shows only the window with absolute fret labels and a neck strip", async () => {
    const tuning = curatedTunings("guitar")[0]!;
    render(FretboardInput, {
      tuning,
      router: new InputRouter(),
      targetMidiNotes: [45, 46, 47, 48],
      visibleStrings: [6],
      fretWindow: { start: 4, end: 9 },
    });

    expect(document.querySelector('[aria-label^="String 6 fret 4,"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="String 6 fret 5, A2, target"]')).not.toBeNull();
    expect(document.querySelector('[aria-label^="String 6 fret 9,"]')).not.toBeNull();
    expect(document.querySelector('[aria-label^="String 6 fret 3,"]')).toBeNull();
    expect(document.querySelector('[aria-label^="String 6 fret 10,"]')).toBeNull();

    const strip = document.querySelector('[data-testid="fret-window-strip"]');
    expect(strip?.querySelector('[role="img"]')?.getAttribute("aria-label")).toBe(
      "Frets 4 to 9 of 22",
    );
    expect(strip?.querySelectorAll("[data-in-window]")).toHaveLength(6);
    expect(strip?.querySelector('[data-fret="4"][data-in-window]')).not.toBeNull();
    expect(strip?.querySelector('[data-fret="3"][data-in-window]')).toBeNull();

    // The drawn board numbers its frets with the real neck numbers.
    await vi.waitFor(() =>
      expect(
        [...document.querySelectorAll(".fret-numbers text")].map((n) => n.textContent),
      ).toEqual(["4", "5", "6", "7", "8", "9"]),
    );
    await vi.waitFor(() => expect(document.querySelectorAll(".dot-circle").length).toBe(4));
  });

  test("labels dots with finger numbers when asked", async () => {
    render(FretboardInput, {
      tuning: curatedTunings("guitar")[0]!,
      router: new InputRouter(),
      targetMidiNotes: [45, 47],
      visibleStrings: [6],
      fretWindow: { start: 4, end: 9 },
      dotLabels: { 45: "1", 47: "3" },
    });
    await vi.waitFor(() =>
      expect([...document.querySelectorAll(".dot-text")].map((n) => n.textContent)).toEqual([
        "1",
        "3",
      ]),
    );
    expect(
      document.querySelector('[aria-label="String 6 fret 5, A2, target"]')?.textContent?.trim(),
    ).toBe("A");
  });

  test("position targets light one dot per authored string and fret, not every octave", async () => {
    // G3's window: B4 is authored at string 2 fret 12 and also playable at
    // string 3 fret 16, which is inside the same window.
    render(FretboardInput, {
      tuning: curatedTunings("guitar")[0]!,
      router: new InputRouter(),
      visibleFrets: 22,
      fretWindow: { start: 11, end: 16 },
      targetPositions: [{ stringNumber: 2, fretNumber: 12, label: "1" }],
    });

    expect(document.querySelector('[aria-label="String 2 fret 12, B4, target"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="String 3 fret 16, B4, target"]')).toBeNull();
    expect(document.querySelectorAll('[aria-label*=", target"]')).toHaveLength(1);
    await vi.waitFor(() =>
      expect([...document.querySelectorAll(".dot-text")].map((node) => node.textContent)).toEqual([
        "1",
      ]),
    );
  });

  test("position targets carry their own active and completed states", async () => {
    render(FretboardInput, {
      tuning: curatedTunings("guitar")[0]!,
      router: new InputRouter(),
      visibleFrets: 22,
      fretWindow: { start: 11, end: 16 },
      targetPositions: [
        { stringNumber: 4, fretNumber: 14, label: "3" },
        { stringNumber: 3, fretNumber: 12, label: "1" },
        { stringNumber: 2, fretNumber: 15, label: "4" },
      ],
      correctPositions: [{ stringNumber: 4, fretNumber: 14 }],
      activePosition: { stringNumber: 3, fretNumber: 12 },
    });

    expect(document.querySelector('[aria-label="String 4 fret 14, E4, correct"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="String 3 fret 12, G4, active"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="String 2 fret 15, D5, target"]')).not.toBeNull();
    // E4 also sits at string 3 fret 16 in this window and stays unlit.
    expect(document.querySelector('[aria-label="String 3 fret 16, B4"]')).not.toBeNull();
    await vi.waitFor(() => expect(document.querySelectorAll(".dot-circle").length).toBe(3));
  });
});

function visualStringCount(): number {
  return document.querySelectorAll(".strings line").length;
}

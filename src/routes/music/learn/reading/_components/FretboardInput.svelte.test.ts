import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import type { NoteEvent } from "@repo/music-core/domain";
import { InputRouter } from "@repo/music-core/engines/input-router";
import { curatedTunings } from "@repo/music-core/engines/tunings";

import FretboardInput from "./FretboardInput.svelte";

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
    });
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
});

function visualStringCount(): number {
  return document.querySelectorAll(".strings line").length;
}

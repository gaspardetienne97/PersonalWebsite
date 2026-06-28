import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { monotonicMs, type NoteOnEvent } from "@repo/music-core/domain";

import Page from "./+page.svelte";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("/music/play/chord-perfect/+page.svelte", () => {
  test("completes a guitar C major chord-perfect check on the fretboard", async () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Chord-Perfect");
    expect(button("Guitar")).toHaveAttribute("aria-pressed", "true");
    await vi.waitFor(() => expect(button("Start drill")?.disabled).toBe(false));

    button("Start drill")?.click();
    await vi.waitFor(() => expect(button("Cancel drill")).not.toBeUndefined());

    // C major [0,1,0,2,3,x]: voiced strings sounded low → high.
    for (const [stringNumber, fret] of [
      [5, 3],
      [4, 2],
      [3, 0],
      [2, 1],
      [1, 0],
    ]) {
      fretButton(stringNumber, fret)?.click();
    }

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Chord-perfect check");
      expect(button("Repeat chord")).not.toBeUndefined();
    });
  });

  test("verifies target chord tones from accumulated fretboard input", async () => {
    render(Page);

    await vi.waitFor(() => expect(button("Start verifier")?.disabled).toBe(false));
    button("Start verifier")?.click();

    for (const [stringNumber, fret] of [
      [5, 3],
      [4, 2],
      [3, 0],
    ]) {
      fretButton(stringNumber, fret)?.click();
    }

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Target complete");
      expect(document.body.textContent).toContain("100%");
    });
  });

  test("verifies target chord tones from microphone pitch events", async () => {
    let audioListener: ((event: NoteOnEvent) => void) | undefined;
    const audioSource = {
      state: { status: "idle" as const },
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      subscribeState: vi.fn(() => vi.fn()),
      subscribeEvents: vi.fn((listener: (event: NoteOnEvent) => void) => {
        audioListener = listener;
        return vi.fn();
      }),
    };
    render(Page, { audioSource, audioSupported: true });

    await vi.waitFor(() => expect(button("Start mic verifier")?.disabled).toBe(false));
    button("Start mic verifier")?.click();

    await vi.waitFor(() => expect(audioSource.start).toHaveBeenCalledOnce());
    for (const midiNote of [60, 64, 67]) {
      audioListener?.(audioNote(midiNote));
    }

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Target complete");
      expect(document.body.textContent).toContain("100%");
    });
  });

  test("identifies a strummed chord and verifies it against the target shape", async () => {
    const analyzeStrum = vi.fn(async () => [60, 64, 67]); // C major
    render(Page, { analyzeStrum, audioSupported: true });

    await vi.waitFor(() => expect(button("Strum & identify")?.disabled).toBe(false));
    button("Strum & identify")?.click();

    await vi.waitFor(() => expect(analyzeStrum).toHaveBeenCalledOnce());
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Detected tones: C, E, G");
      expect(document.body.textContent).toContain("100% match");
      expect(document.body.textContent).toContain("matches the target");
      expect(document.body.textContent).toContain("Open chord ID scored");
      expect(document.body.textContent).toContain("Heard C");
    });
  });
});

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

function fretButton(stringNumber: number, fret: number): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find((candidate) =>
    candidate.getAttribute("aria-label")?.startsWith(`String ${stringNumber} fret ${fret},`),
  );
}

function audioNote(midiNote: number): NoteOnEvent {
  return {
    type: "noteOn",
    midiNote,
    velocity: 1,
    source: "audio",
    confidence: 0.9,
    timestamp: monotonicMs(0),
    clock: "performance",
  };
}

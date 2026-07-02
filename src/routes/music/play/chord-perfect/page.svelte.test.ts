import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { monotonicMs, type NoteOnEvent } from "@repo/music-core/domain";

import Page from "./+page.svelte";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  window.history.replaceState({}, "", "/");
});

describe("/music/play/chord-perfect/+page.svelte", () => {
  test("separates chord-perfect workflows into one primary mode at a time", async () => {
    render(Page);

    await vi.waitFor(() => expect(button("Start drill")?.disabled).toBe(false));

    expect(button("Build shape")).toHaveAttribute("aria-pressed", "true");
    expect(button("Start drill")).not.toBeUndefined();
    expect(button("Start verifier")).toBeUndefined();
    expect(button("Strum & identify")).toBeUndefined();

    button("Pick strings cleanly")?.click();
    await vi.waitFor(() => {
      expect(button("Pick strings cleanly")).toHaveAttribute("aria-pressed", "true");
      expect(button("Start verifier")).not.toBeUndefined();
      expect(button("Start drill")).toBeUndefined();
    });

    button("Strum and identify")?.click();
    await vi.waitFor(() => {
      expect(button("Strum and identify")).toHaveAttribute("aria-pressed", "true");
      expect(button("Strum & identify")).not.toBeUndefined();
      expect(button("Start verifier")).toBeUndefined();
    });
  });

  test("shows suggested fingers plus open and muted strings for the selected shape", async () => {
    render(Page);

    await vi.waitFor(() => expect(button("Start drill")?.disabled).toBe(false));

    expect(document.body.textContent).toContain("Suggested fingering");
    expect(document.body.textContent).toContain("String 5");
    expect(document.body.textContent).toContain("Fret 3");
    expect(document.body.textContent).toContain("Finger 3");
    expect(document.body.textContent).toContain("String 3");
    expect(document.body.textContent).toContain("Open");
    expect(document.body.textContent).toContain("String 6");
    expect(document.body.textContent).toContain("Muted");
  });

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

    await vi.waitFor(() => expect(button("Pick strings cleanly")).not.toBeUndefined());
    button("Pick strings cleanly")?.click();
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

  test("summarizes verifier progress with feedback and a compact tone map", async () => {
    render(Page);

    await vi.waitFor(() => expect(button("Pick strings cleanly")).not.toBeUndefined());
    button("Pick strings cleanly")?.click();
    await vi.waitFor(() => expect(button("Start verifier")?.disabled).toBe(false));
    button("Start verifier")?.click();

    fretButton(5, 3)?.click();

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Target chord tones");
      expect(document.body.textContent).toContain("1/3 tones covered");
      expect(document.body.textContent).toContain("Tone map");
      expect(document.body.textContent).toContain("C matched");
      expect(document.body.textContent).toContain("E missing");
      expect(document.body.textContent).toContain("G missing");
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

    await vi.waitFor(() => expect(button("Pick strings cleanly")).not.toBeUndefined());
    button("Pick strings cleanly")?.click();
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

    await vi.waitFor(() => expect(button("Strum and identify")).not.toBeUndefined());
    button("Strum and identify")?.click();
    await vi.waitFor(() => expect(button("Strum & identify")?.disabled).toBe(false));
    button("Strum & identify")?.click();

    await vi.waitFor(() => expect(analyzeStrum).toHaveBeenCalledOnce());
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Detected tones: C, E, G");
      expect(document.body.textContent).toContain("Tone map");
      expect(document.body.textContent).toContain("C matched");
      expect(document.body.textContent).toContain("E matched");
      expect(document.body.textContent).toContain("G matched");
      expect(document.body.textContent).toContain("100% match");
      expect(document.body.textContent).toContain("matches the target");
      expect(document.body.textContent).toContain("Open chord ID scored");
      expect(document.body.textContent).toContain("Heard C");
    });
  });

  test("restores and syncs the shareable chord-perfect setup URL", async () => {
    window.history.replaceState(
      {},
      "",
      "/music/play/chord-perfect?mode=pick&instrument=ukulele&shape=ukulele.g-major",
    );
    render(Page);

    await vi.waitFor(() => {
      expect(button("Pick strings cleanly")).toHaveAttribute("aria-pressed", "true");
      expect(button("Ukulele")).toHaveAttribute("aria-pressed", "true");
    });
    expect(select("Chord")?.value).toBe("ukulele.g-major");

    button("Strum and identify")?.click();
    await vi.waitFor(() => {
      const params = new URLSearchParams(window.location.search);
      expect(params.get("mode")).toBe("strum");
      expect(params.get("instrument")).toBe("ukulele");
      expect(params.get("shape")).toBe("ukulele.g-major");
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

function select(label: string): HTMLSelectElement | undefined {
  return [...document.querySelectorAll<HTMLSelectElement>("select")].find(
    (candidate) => candidate.getAttribute("aria-label") === label,
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

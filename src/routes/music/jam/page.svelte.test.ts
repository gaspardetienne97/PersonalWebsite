import { afterEach, describe, expect, test } from "vite-plus/test";
import { vi } from "vitest";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";
import type { MusicRuntime } from "../_runtime.svelte";

function createRuntimeStub() {
  const subscribers = new Set<(event: unknown) => void>();
  const runtime = {
    activeSource: "screen",
    audioEnabled: true,
    transportBpm: 96,
    router: {
      subscribe: vi.fn((listener: (event: unknown) => void) => {
        subscribers.add(listener);
        return () => subscribers.delete(listener);
      }),
      noteOn: vi.fn((midiNote: number, source = "midi", instrument = "piano") => {
        const event = {
          type: "noteOn",
          midiNote,
          velocity: 0.8,
          source,
          timestamp: performance.now(),
          clock: "performance",
          instrument,
        };
        for (const listener of subscribers) listener(event);
      }),
    },
    setPlaybackSource: vi.fn(),
    setTransportBpm: vi.fn((value: number) => {
      runtime.transportBpm = value;
    }),
    sound: {
      playChord: vi.fn(),
      playNote: vi.fn(),
      playPattern: vi.fn(),
      startPatternLoop: vi.fn(),
      stopPatternLoop: vi.fn(),
    },
    enableAudio: vi.fn(async () => true),
    writeLocalState: vi.fn(async () => undefined),
  };

  return runtime;
}

describe("/music/jam/+page.svelte", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  test("renders the current chord, progression, and solo keyboard", () => {
    render(Page);

    expect(document.querySelector("h1")?.textContent).toContain("Jam / Improv");
    expect(document.body.textContent).toContain("Now playing");
    // ii–V–I default starts on Dm7
    expect(document.body.textContent).toContain("Dm7");
    expect(document.body.textContent).toContain("Target tones");
    expect(
      document.querySelector('[role="group"][aria-label="On-screen keyboard"]'),
    ).not.toBeNull();
  });

  test("advances to the next chord", async () => {
    render(Page);
    const nextChord = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
      button.textContent?.includes("Next chord"),
    );
    expect(nextChord).not.toBeUndefined();
    nextChord?.click();
    // After advancing from Dm7, the V chord (G7) is now current.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.body.textContent).toContain("G7");
  });

  test("defaults to a bundled drum-track backing and can switch to synth chords", async () => {
    const playbackSources: Array<{
      label: string;
      play: () => Promise<void> | void;
      stop?: () => void;
    }> = [];
    const runtime = createRuntimeStub();
    runtime.setPlaybackSource.mockImplementation((source) => {
      if (source) playbackSources.push(source);
    });

    render(Page, { props: { runtime: runtime as unknown as MusicRuntime } });

    // Default backing is a bundled drum track.
    await vi.waitFor(() => expect(playbackSources.length).toBeGreaterThanOrEqual(1));
    expect(playbackSources.at(-1)!.label).toMatch(/backing/i);
    expect(document.body.textContent).toContain("Drum track");

    // Switch to synth chords → generated progression playback.
    const synth = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "Synth chords",
    );
    synth?.click();

    await vi.waitFor(() => expect(playbackSources.at(-1)!.label).toContain("progression"));
    await playbackSources.at(-1)!.play();

    expect(runtime.sound.startPatternLoop).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Number),
    );
    expect(runtime.sound.playPattern).not.toHaveBeenCalled();
  });

  test("restores shareable jam query config", async () => {
    window.history.replaceState({}, "", "/music/jam?progression=blues&backing=chords&bpm=140");
    const runtime = createRuntimeStub();

    render(Page, { props: { runtime: runtime as unknown as MusicRuntime } });

    await vi.waitFor(() => expect(runtime.setTransportBpm).toHaveBeenCalledWith(140));
    expect(document.body.textContent).toContain("12-bar blues");
    expect(document.body.textContent).toContain("C7");
    expect(document.body.textContent).toContain("Synth chords");
  });

  test("syncs jam setup changes into the URL", async () => {
    window.history.replaceState({}, "", "/music/jam");
    render(Page, { props: { runtime: createRuntimeStub() as unknown as MusicRuntime } });

    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "Modal vamp")
      ?.click();
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "Synth chords")
      ?.click();

    await vi.waitFor(() => {
      const params = new URLSearchParams(window.location.search);
      expect(params.get("progression")).toBe("modal");
      expect(params.get("backing")).toBe("chords");
      expect(params.get("bpm")).toBe("96");
    });
  });

  test("records a chorus take into the shared take review panel", async () => {
    const runtime = createRuntimeStub();
    render(Page, { props: { runtime: runtime as unknown as MusicRuntime } });

    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Record chorus"))
      ?.click();
    runtime.router.noteOn(60);
    runtime.router.noteOn(64);

    await vi.waitFor(() => expect(document.body.textContent).toContain("Recording · 2"));
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Stop chorus"))
      ?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Review chorus takes"));
    expect(document.body.textContent).toContain("ii–V–I chorus 1");
    expect(document.querySelectorAll("[data-density-bucket]")).toHaveLength(16);
  });

  test("sends a recorded chorus take to the Create piano roll", async () => {
    const runtime = createRuntimeStub();
    const navigateToCreate = vi.fn();
    render(Page, { props: { runtime: runtime as unknown as MusicRuntime, navigateToCreate } });

    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Record chorus"))
      ?.click();
    runtime.router.noteOn(60);
    runtime.router.noteOn(64);
    await vi.waitFor(() => expect(document.body.textContent).toContain("Recording · 2"));
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Stop chorus"))
      ?.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Open in Piano Roll"));
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Open in Piano Roll"))
      ?.click();

    await vi.waitFor(() => {
      expect(runtime.writeLocalState).toHaveBeenCalledWith(
        "music.piano-roll.pending-take-import",
        expect.objectContaining({
          bpm: 96,
          take: expect.objectContaining({
            name: "ii–V–I chorus 1",
            notes: [expect.objectContaining({ midi: 60 }), expect.objectContaining({ midi: 64 })],
          }),
        }),
      );
      expect(navigateToCreate).toHaveBeenCalledWith(
        "/music/create?mode=piano-roll&source=jam-chorus-take",
      );
    });
  });
});

import { describe, expect, test } from "vite-plus/test";
import { vi } from "vitest";
import { render } from "vitest-browser-svelte";

import Page from "./+page.svelte";
import type { MusicRuntime } from "../_runtime.svelte";

describe("/music/jam/+page.svelte", () => {
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
    const runtime = {
      activeSource: "screen",
      audioEnabled: true,
      transportBpm: 96,
      router: {
        subscribe: vi.fn(() => vi.fn()),
      },
      setPlaybackSource: vi.fn((source) => {
        if (source) playbackSources.push(source);
      }),
      sound: {
        playChord: vi.fn(),
        playNote: vi.fn(),
        playPattern: vi.fn(),
        startPatternLoop: vi.fn(),
        stopPatternLoop: vi.fn(),
      },
      enableAudio: vi.fn(async () => true),
    };

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
});

import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import type { MusicRuntime } from "../_runtime.svelte";
import Page from "./+page.svelte";

describe("/music/studio/+page.svelte", () => {
  test("renders the sequencer grid and pad bank", () => {
    render(Page);
    expect(document.querySelector("h1")?.textContent).toContain("Studio");
    expect(document.body.textContent).toContain("Sequencer");
    expect(document.body.textContent).toContain("Pad bank");
    // 6 rows x 16 steps of step buttons
    expect(document.querySelectorAll('button[aria-label^="Kick step"]').length).toBe(16);
  });

  test("toggles a step cell", async () => {
    render(Page);
    const cell = document.querySelector<HTMLButtonElement>('button[aria-label="Snare step 1"]');
    expect(cell).not.toBeNull();
    const before = cell?.getAttribute("aria-pressed");
    cell?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cell?.getAttribute("aria-pressed")).not.toBe(before);
  });

  test("registers the sequencer pattern with the shared transport", async () => {
    const playbackSources: Array<{
      label: string;
      play: () => Promise<void> | void;
      stop?: () => void;
    }> = [];
    const runtime = {
      audioEnabled: true,
      playbackPlaying: false,
      transportBpm: 96,
      enableAudio: vi.fn(async () => true),
      readLocalState: vi.fn(async () => undefined),
      writeLocalState: vi.fn(async () => undefined),
      setPlaybackSource: vi.fn((source) => {
        if (source) playbackSources.push(source);
      }),
      sound: {
        playNote: vi.fn(),
        startPatternLoop: vi.fn(),
        stopPatternLoop: vi.fn(),
      },
    };

    render(Page, { runtime: runtime as unknown as MusicRuntime });

    await vi.waitFor(() => expect(playbackSources).toHaveLength(1));
    await playbackSources[0]!.play();

    expect(runtime.enableAudio).toHaveBeenCalled();
    const [steps, durationSec] = runtime.sound.startPatternLoop.mock.calls[0]!;
    expect(steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          midiNotes: expect.arrayContaining([36]),
          offsetSeconds: 0,
        }),
      ]),
    );
    expect(durationSec).toBeGreaterThan(0);

    playbackSources[0]!.stop?.();
    expect(runtime.sound.stopPatternLoop).toHaveBeenCalled();
  });

  test("loads and saves the Studio pattern through runtime local state", async () => {
    const savedPattern = {
      steps: 16,
      rows: [{ id: "snare", steps: [0] }],
    };
    const runtime = {
      audioEnabled: true,
      playbackPlaying: false,
      transportBpm: 96,
      enableAudio: vi.fn(async () => true),
      readLocalState: vi.fn(async () => savedPattern),
      writeLocalState: vi.fn(async () => undefined),
      setPlaybackSource: vi.fn(),
      sound: {
        playNote: vi.fn(),
        startPatternLoop: vi.fn(),
        stopPatternLoop: vi.fn(),
      },
    };

    render(Page, { runtime: runtime as unknown as MusicRuntime });

    const snareStep1 = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Snare step 1"]',
    );
    const snareStep2 = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Snare step 2"]',
    );
    const kickStep1 = document.querySelector<HTMLButtonElement>('button[aria-label="Kick step 1"]');

    await vi.waitFor(() => expect(snareStep1).toHaveAttribute("aria-pressed", "true"));
    expect(kickStep1).toHaveAttribute("aria-pressed", "false");

    snareStep2?.click();

    await vi.waitFor(() =>
      expect(runtime.writeLocalState).toHaveBeenCalledWith(
        "music.studio.boom-bap",
        expect.objectContaining({
          steps: 16,
          rows: expect.arrayContaining([
            expect.objectContaining({
              id: "snare",
              steps: [0, 1],
            }),
          ]),
        }),
      ),
    );
  });
});

import { unixMs } from "@repo/music-core/domain";
import type { MediaUsage } from "@repo/music-core/engines/media-library";
import type { AudioTakeRow } from "@repo/music-core/engines/store";
import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { MusicRuntime } from "../../_runtime.svelte";
import Panel from "./RecorderPanel.svelte";

function button(match: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find((candidate) =>
    candidate.textContent?.includes(match),
  );
}

describe("RecorderPanel", () => {
  test("renders takes, compare, and capture surfaces", () => {
    render(Panel);
    expect(document.body.textContent).toContain("Recording & Self-Review");
    expect(document.body.textContent).toContain("Takes");
    expect(document.body.textContent).toContain("No takes yet");
    expect(
      document.querySelector('[role="group"][aria-label="On-screen keyboard"]'),
    ).not.toBeNull();
  });

  test("records an on-screen take and lists it", async () => {
    render(Panel);
    button("New recording")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());

    const c4 = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (candidate) => candidate.textContent?.trim() === "C4",
    );
    c4?.click();
    await vi.waitFor(() => expect(button("Stop · 1")).not.toBeUndefined());

    button("Stop")?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Take 1"));
    expect(document.body.textContent).toContain("1 notes");
  });

  test("exports a recorded take as a MIDI download", async () => {
    const createSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:take");
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    render(Panel);

    button("New recording")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((candidate) => candidate.textContent?.trim() === "C4")
      ?.click();
    await vi.waitFor(() => expect(button("Stop · 1")).not.toBeUndefined());
    button("Stop")?.click();
    await vi.waitFor(() => expect(button("MIDI")).not.toBeUndefined());

    button("MIDI")?.click();
    expect(createSpy).toHaveBeenCalledTimes(1);
    const blob = createSpy.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe("audio/midi");
    expect(clickSpy).toHaveBeenCalledTimes(1);

    createSpy.mockRestore();
    revokeSpy.mockRestore();
    clickSpy.mockRestore();
  });

  test("restores persisted MIDI takes once storage is attached", async () => {
    const runtime = new MusicRuntime();
    vi.spyOn(runtime, "readLocalState").mockImplementation(async (id) =>
      id === "music.recording.midi-takes"
        ? ([
            {
              id: "take-7",
              name: "Saved riff",
              source: "midi",
              notes: [{ midi: 60, atMs: 0, velocity: 0.8 }],
              durationMs: 500,
            },
          ] as never)
        : (undefined as never),
    );
    // The load effect waits for storage (runtime.media) to be attached.
    runtime.media = {
      listTakes: vi.fn().mockResolvedValue([]),
      usage: vi.fn().mockResolvedValue({
        backingBytes: 0,
        takeBytes: 0,
        totalBytes: 0,
        effectiveBudgetBytes: 256_000,
        remainingBytes: 256_000,
      }),
    } as unknown as MusicRuntime["media"];

    render(Panel, { runtime });
    await vi.waitFor(() => expect(document.body.textContent).toContain("Saved riff"));
  });

  test("persists MIDI takes when a take is recorded", async () => {
    const runtime = new MusicRuntime();
    vi.spyOn(runtime, "readLocalState").mockResolvedValue(undefined as never);
    const writeSpy = vi.spyOn(runtime, "writeLocalState").mockResolvedValue(undefined);

    render(Panel, { runtime });
    button("New recording")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((candidate) => candidate.textContent?.trim() === "C4")
      ?.click();
    await vi.waitFor(() => expect(button("Stop · 1")).not.toBeUndefined());
    button("Stop")?.click();

    await vi.waitFor(() =>
      expect(writeSpy).toHaveBeenCalledWith(
        "music.recording.midi-takes",
        expect.arrayContaining([expect.objectContaining({ notes: expect.any(Array) })]),
      ),
    );
  });

  test("sends a recorded MIDI take to the Piano Roll import flow", async () => {
    const runtime = new MusicRuntime();
    const navigateToCreate = vi.fn();
    vi.spyOn(runtime, "readLocalState").mockResolvedValue(undefined as never);
    const writeSpy = vi.spyOn(runtime, "writeLocalState").mockResolvedValue(undefined);

    render(Panel, { runtime, navigateToCreate });

    button("New recording")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((candidate) => candidate.textContent?.trim() === "C4")
      ?.click();
    await vi.waitFor(() => expect(button("Stop · 1")).not.toBeUndefined());
    button("Stop")?.click();

    await vi.waitFor(() => expect(button("Open in Piano Roll")).not.toBeUndefined());
    button("Open in Piano Roll")?.click();

    await vi.waitFor(() => {
      expect(writeSpy).toHaveBeenCalledWith(
        "music.piano-roll.pending-take-import",
        expect.objectContaining({
          bpm: runtime.transportBpm,
          take: expect.objectContaining({
            name: "Take 1",
            notes: [expect.objectContaining({ midi: 60 })],
          }),
        }),
      );
      expect(navigateToCreate).toHaveBeenCalledWith(
        "/music/create?mode=piano-roll&source=recorder-take",
      );
    });
  });

  test("saves a recorded MIDI take to Song Studio", async () => {
    const runtime = new MusicRuntime();
    vi.spyOn(runtime, "readLocalState").mockResolvedValue(undefined as never);
    const library = {
      saveScore: vi.fn(async (score: unknown) => {
        expect(score).toEqual(
          expect.objectContaining({
            title: "Take 1",
            origin: "midi",
            tempoMap: [{ atBeat: 0, bpm: runtime.transportBpm }],
            notes: [expect.objectContaining({ midiNote: 60, voiceId: "onscreen" })],
          }),
        );
        return { id: "song-recorder-take", title: "Take 1" };
      }),
    };

    render(Panel, { runtime, library });

    button("New recording")?.click();
    await vi.waitFor(() => expect(button("Stop")).not.toBeUndefined());
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((candidate) => candidate.textContent?.trim() === "C4")
      ?.click();
    await vi.waitFor(() => expect(button("Stop · 1")).not.toBeUndefined());
    button("Stop")?.click();

    await vi.waitFor(() => expect(button("Save to Song Studio")).not.toBeUndefined());
    button("Save to Song Studio")?.click();

    await vi.waitFor(() => expect(library.saveScore).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(document.body.textContent).toContain("Saved to Song Studio."));
    expect(document.querySelector('a[href="/music/songs/song-recorder-take"]')).not.toBeNull();
  });

  test("loads saved audio takes from the media library", async () => {
    const runtime = new MusicRuntime();
    const take: AudioTakeRow = {
      id: "audio-take-1",
      name: "Practice Lab take.webm",
      mimeType: "audio/webm",
      size: 16_384,
      durationMs: 32_000,
      createdAt: unixMs(2_000),
      instrument: "piano",
      backingKind: "generated",
      backingOffsetMs: 0,
      generatedBacking: {
        progressionId: "ii-v-i",
        bpm: 96,
        loop: true,
      },
    };
    const usage: MediaUsage = {
      backingBytes: 0,
      takeBytes: take.size,
      totalBytes: take.size,
      effectiveBudgetBytes: 256_000,
      remainingBytes: 256_000 - take.size,
    };
    runtime.media = {
      listTakes: vi.fn().mockResolvedValue([take]),
      usage: vi.fn().mockResolvedValue(usage),
      takeBlob: vi.fn().mockResolvedValue(new Blob(["audio"], { type: "audio/webm" })),
      deleteTake: vi.fn().mockResolvedValue(undefined),
    } as unknown as MusicRuntime["media"];

    render(Panel, { runtime });

    await vi.waitFor(() => expect(document.body.textContent).toContain("Practice Lab take.webm"));
    expect(document.body.textContent).toContain("Audio takes");
    expect(document.querySelector('[aria-label="Play synchronized take"]')).not.toBeNull();
  });
});

import { unixMs } from "@repo/music-core/domain";
import type { MediaUsage } from "@repo/music-core/engines/media-library";
import type { AudioTakeRow } from "@repo/music-core/engines/store";
import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import { MusicRuntime } from "../_runtime.svelte";
import Page from "./+page.svelte";

function button(match: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find((candidate) =>
    candidate.textContent?.includes(match),
  );
}

describe("/music/recording/+page.svelte", () => {
  test("renders takes, compare, and capture surfaces", () => {
    render(Page);
    expect(document.querySelector("h1")?.textContent).toContain("Recording & Self-Review");
    expect(document.body.textContent).toContain("Takes");
    expect(document.body.textContent).toContain("No takes yet");
    expect(
      document.querySelector('[role="group"][aria-label="On-screen keyboard"]'),
    ).not.toBeNull();
  });

  test("records an on-screen take and lists it", async () => {
    render(Page);
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
    render(Page);

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

    render(Page, { runtime });

    await vi.waitFor(() => expect(document.body.textContent).toContain("Practice Lab take.webm"));
    expect(document.body.textContent).toContain("Audio takes");
    expect(document.querySelector('[aria-label="Play synchronized take"]')).not.toBeNull();
  });
});

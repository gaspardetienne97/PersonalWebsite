import { unixMs } from "@repo/music-core/domain";
import { JAM_PROGRESSIONS } from "@repo/music-core/engines/jam";
import type { BackingTrackState } from "@repo/music-core/engines/backing-track";
import type { ImportedBackingTrackRow } from "@repo/music-core/engines/store";
import type { MediaUsage } from "@repo/music-core/engines/media-library";
import { describe, expect, test } from "vite-plus/test";
import { render } from "vitest-browser-svelte";

import BackingTrackPanel from "./BackingTrackPanel.svelte";

const importedTrack: ImportedBackingTrackRow = {
  id: "backing-1",
  name: "Blues loop.wav",
  mimeType: "audio/wav",
  size: 4_096,
  durationMs: 32_000,
  createdAt: unixMs(1_000),
};

const usage: MediaUsage = {
  backingBytes: 4_096,
  takeBytes: 2_048,
  totalBytes: 6_144,
  effectiveBudgetBytes: 100_000,
  remainingBytes: 93_856,
};

function state(overrides: Partial<BackingTrackState> = {}): BackingTrackState {
  return {
    selection: { kind: "generated", progressionId: "ii-v-i", bpm: 112, loop: true },
    status: "idle",
    positionMs: 0,
    durationMs: 24_000,
    volume: 0.8,
    ...overrides,
  };
}

function setInputFiles(input: HTMLInputElement, files: File[]): void {
  Object.defineProperty(input, "files", {
    configurable: true,
    value: files,
  });
}

function buttonNamed(name: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.trim() === name || button.getAttribute("aria-label") === name,
  );
}

describe("BackingTrackPanel", () => {
  test("opens the import controls before a first backing file exists", async () => {
    render(BackingTrackPanel, { state: state({ selection: { kind: "none" } }) });
    buttonNamed("Imported backing")?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.querySelector('[aria-label="Import MP3 or WAV"]')).not.toBeNull();
    expect(document.querySelector<HTMLButtonElement>('[aria-label="Play backing"]')?.disabled).toBe(
      true,
    );
    buttonNamed("No backing")?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.querySelector('[aria-label="Import MP3 or WAV"]')).toBeNull();
  });

  test("renders the required accessible controls", () => {
    render(BackingTrackPanel, {
      state: state({
        selection: { kind: "imported", track: importedTrack, loop: false },
        status: "paused",
      }),
      progressions: JAM_PROGRESSIONS,
      importedTracks: [importedTrack],
      usage,
    });

    expect(buttonNamed("No backing")).not.toBeUndefined();
    expect(buttonNamed("Generated backing")).not.toBeUndefined();
    expect(buttonNamed("Imported backing")).not.toBeUndefined();
    expect(document.querySelector('[aria-label="Import MP3 or WAV"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Play backing"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Loop backing"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Backing volume"]')).not.toBeNull();
  });

  test("renders a pause control while backing playback is active", () => {
    render(BackingTrackPanel, {
      state: state({ status: "playing" }),
      progressions: JAM_PROGRESSIONS,
      importedTracks: [importedTrack],
      usage,
    });

    expect(document.querySelector('[aria-label="Pause backing"]')).not.toBeNull();
  });

  test("emits generated progression id, bpm, and loop state", () => {
    let generated:
      | { kind: "generated"; progressionId: string; bpm: number; loop: boolean }
      | undefined;
    render(BackingTrackPanel, {
      state: state(),
      progressions: JAM_PROGRESSIONS,
      importedTracks: [importedTrack],
      usage,
      onSelectGenerated: (selection) => {
        generated = selection;
      },
    });

    buttonNamed("Generated backing")?.click();

    expect(generated).toEqual({
      kind: "generated",
      progressionId: "ii-v-i",
      bpm: 112,
      loop: true,
    });
  });

  test("rejects non-audio imported files before invoking the callback", async () => {
    let imported: File | undefined;
    render(BackingTrackPanel, {
      state: state({ selection: { kind: "imported", track: importedTrack, loop: false } }),
      progressions: JAM_PROGRESSIONS,
      importedTracks: [importedTrack],
      usage,
      onImport: (file) => {
        imported = file;
      },
    });

    const input = document.querySelector<HTMLInputElement>('[aria-label="Import MP3 or WAV"]');
    expect(input).not.toBeNull();
    setInputFiles(input!, [new File(["notes"], "notes.txt", { type: "text/plain" })]);
    input?.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(imported).toBeUndefined();
    expect(document.body.textContent).toContain("Choose an MP3 or WAV audio file.");
  });

  test("invokes playback, loop, volume, and imported selection callbacks", () => {
    let playCalls = 0;
    let loopValue: boolean | undefined;
    let volumeValue: number | undefined;
    let selectedTrack: ImportedBackingTrackRow | undefined;
    render(BackingTrackPanel, {
      state: state({ selection: { kind: "imported", track: importedTrack, loop: false } }),
      progressions: JAM_PROGRESSIONS,
      importedTracks: [importedTrack],
      usage,
      onPlay: () => {
        playCalls += 1;
      },
      onLoop: (loop) => {
        loopValue = loop;
      },
      onVolume: (volume) => {
        volumeValue = volume;
      },
      onSelectImported: (track) => {
        selectedTrack = track;
      },
    });

    document.querySelector<HTMLButtonElement>('[aria-label="Play backing"]')?.click();
    document.querySelector<HTMLButtonElement>('[aria-label="Loop backing"]')?.click();
    document
      .querySelector<HTMLButtonElement>('[aria-label="Use imported backing Blues loop.wav"]')
      ?.click();

    const volume = document.querySelector<HTMLInputElement>('[aria-label="Backing volume"]');
    expect(volume).not.toBeNull();
    volume!.value = "0.35";
    volume?.dispatchEvent(new Event("input", { bubbles: true }));

    expect(playCalls).toBe(1);
    expect(loopValue).toBe(true);
    expect(selectedTrack?.id).toBe("backing-1");
    expect(volumeValue).toBe(0.35);
  });
});

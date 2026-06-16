import { describe, expect, test, vi } from "vitest";

import { unixMs } from "@repo/music-core/domain";
import type { SoundEngine } from "@repo/music-core/engines/sound";
import type { ImportedBackingTrackRow } from "@repo/music-core/engines/store";

import { BrowserBackingPlayer } from "./browser-player";

class FakeAudio {
  src = "";
  currentTime = 0;
  duration = 12.5;
  volume = 1;
  loop = false;
  readonly play = vi.fn(async () => undefined);
  readonly pause = vi.fn();
  readonly load = vi.fn();
  readonly #listeners = new Map<string, Set<() => void>>();

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.#listeners.get(type) ?? new Set<() => void>();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.#listeners.get(type)?.delete(listener);
  }

  dispatch(type: string): void {
    for (const listener of this.#listeners.get(type) ?? []) listener();
  }

  listenerCount(type: string): number {
    return this.#listeners.get(type)?.size ?? 0;
  }
}

function backing(overrides: Partial<ImportedBackingTrackRow> = {}): ImportedBackingTrackRow {
  return {
    id: "backing-1",
    name: "Practice Track.wav",
    mimeType: "audio/wav",
    size: 1_024,
    durationMs: 60_000,
    createdAt: unixMs(Date.UTC(2026, 5, 16)),
    ...overrides,
  };
}

function createSound(): SoundEngine {
  return {
    startPatternLoop: vi.fn(),
    stopPatternLoop: vi.fn(),
    playPattern: vi.fn(),
  } as unknown as SoundEngine;
}

describe("BrowserBackingPlayer", () => {
  test("plays generated progressions through SoundEngine loops", async () => {
    const sound = createSound();
    const player = new BrowserBackingPlayer({
      sound,
      loadBlob: vi.fn(),
      audio: new FakeAudio() as unknown as HTMLAudioElement,
    });

    await player.playGenerated({ kind: "generated", progressionId: "ii-v-i", bpm: 96, loop: true });
    expect(sound.startPatternLoop).toHaveBeenCalledWith(expect.any(Array), 20);

    await player.playGenerated({
      kind: "generated",
      progressionId: "ii-v-i",
      bpm: 96,
      loop: false,
    });
    expect(sound.stopPatternLoop).toHaveBeenCalled();
    expect(sound.playPattern).toHaveBeenCalledWith(expect.any(Array));
  });

  test("loads imported blobs into one audio element and revokes old object URLs", async () => {
    const audio = new FakeAudio();
    const first = backing({ id: "first" });
    const second = backing({ id: "second", durationMs: 30_000 });
    const loadBlob = vi.fn(async (id: string) => new Blob([id], { type: "audio/wav" }));
    const createObjectURL = vi
      .fn()
      .mockReturnValueOnce("blob:first")
      .mockReturnValueOnce("blob:second");
    const revokeObjectURL = vi.fn();
    const player = new BrowserBackingPlayer({
      sound: createSound(),
      loadBlob,
      audio: audio as unknown as HTMLAudioElement,
      createObjectURL,
      revokeObjectURL,
    });

    await expect(player.loadImported(first)).resolves.toBe(12_500);
    expect(audio.src).toBe("blob:first");
    expect(audio.load).toHaveBeenCalledTimes(1);

    await expect(player.loadImported(first)).resolves.toBe(12_500);
    expect(createObjectURL).toHaveBeenCalledTimes(1);

    audio.duration = Number.NaN;
    await expect(player.loadImported(second)).resolves.toBe(second.durationMs);
    expect(audio.src).toBe("blob:second");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:first");

    player.dispose();
    expect(revokeObjectURL).toHaveBeenLastCalledWith("blob:second");
    expect(audio.src).toBe("");
  });

  test("forwards imported transport controls to the audio element", async () => {
    const audio = new FakeAudio();
    const player = new BrowserBackingPlayer({
      sound: createSound(),
      loadBlob: vi.fn(),
      audio: audio as unknown as HTMLAudioElement,
    });

    await player.playImported();
    player.seekImported(1_250);
    player.setImportedVolume(0.4);
    player.setImportedLoop(true);
    player.pauseImported();
    player.stopImported();

    expect(audio.play).toHaveBeenCalledOnce();
    expect(audio.currentTime).toBe(0);
    expect(audio.volume).toBe(0.4);
    expect(audio.loop).toBe(true);
    expect(audio.pause).toHaveBeenCalledTimes(2);
  });

  test("reports audio events through callbacks and removes listeners on dispose", () => {
    const audio = new FakeAudio();
    const onImportedPositionChange = vi.fn();
    const onImportedEnded = vi.fn();
    const onImportedError = vi.fn();
    const player = new BrowserBackingPlayer({
      sound: createSound(),
      loadBlob: vi.fn(),
      audio: audio as unknown as HTMLAudioElement,
      onImportedPositionChange,
      onImportedEnded,
      onImportedError,
    });

    audio.currentTime = 1.25;
    audio.dispatch("timeupdate");
    audio.dispatch("ended");
    audio.dispatch("error");

    expect(onImportedPositionChange).toHaveBeenCalledWith(1_250);
    expect(onImportedEnded).toHaveBeenCalledOnce();
    expect(onImportedError).toHaveBeenCalledWith("Imported backing track playback failed.");

    player.dispose();
    expect(audio.listenerCount("timeupdate")).toBe(0);
    expect(audio.listenerCount("ended")).toBe(0);
    expect(audio.listenerCount("error")).toBe(0);
  });

  test("throws when imported backing audio is missing", async () => {
    const player = new BrowserBackingPlayer({
      sound: createSound(),
      loadBlob: vi.fn(async () => undefined),
      audio: new FakeAudio() as unknown as HTMLAudioElement,
    });

    await expect(player.loadImported(backing())).rejects.toThrow(/missing/i);
  });
});

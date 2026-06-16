import type { SoundEngine } from "@repo/music-core/engines/sound";

import { projectGenerated, type BackingSelection, type BackingTrackPlaybackAdapter } from "./index";

export interface BrowserBackingPlayerOptions {
  sound: SoundEngine;
  loadBlob(id: string): Promise<Blob | undefined>;
  audio?: HTMLAudioElement;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  onImportedPositionChange?: (positionMs: number) => void;
  onImportedEnded?: () => void;
  onImportedError?: (message: string) => void;
}

export class BrowserBackingPlayer implements BackingTrackPlaybackAdapter {
  readonly #sound: SoundEngine;
  readonly #loadBlob: BrowserBackingPlayerOptions["loadBlob"];
  readonly #audio: HTMLAudioElement;
  readonly #createObjectURL: (blob: Blob) => string;
  readonly #revokeObjectURL: (url: string) => void;
  readonly #onImportedPositionChange: ((positionMs: number) => void) | undefined;
  readonly #onImportedEnded: (() => void) | undefined;
  readonly #onImportedError: ((message: string) => void) | undefined;
  #objectUrl: string | undefined;
  #loadedTrackId: string | undefined;

  constructor(options: BrowserBackingPlayerOptions) {
    this.#sound = options.sound;
    this.#loadBlob = options.loadBlob;
    this.#audio = options.audio ?? new Audio();
    this.#createObjectURL = options.createObjectURL ?? URL.createObjectURL.bind(URL);
    this.#revokeObjectURL = options.revokeObjectURL ?? URL.revokeObjectURL.bind(URL);
    this.#onImportedPositionChange = options.onImportedPositionChange;
    this.#onImportedEnded = options.onImportedEnded;
    this.#onImportedError = options.onImportedError;

    this.#audio.addEventListener("timeupdate", this.#handleTimeUpdate);
    this.#audio.addEventListener("ended", this.#handleEnded);
    this.#audio.addEventListener("error", this.#handleError);
  }

  async playGenerated(selection: Extract<BackingSelection, { kind: "generated" }>): Promise<void> {
    const pattern = projectGenerated(selection);
    if (selection.loop) {
      this.#sound.startPatternLoop(pattern.steps, pattern.durationSec);
      return;
    }
    this.#sound.stopPatternLoop();
    this.#sound.playPattern(pattern.steps);
  }

  stopGenerated(): void {
    this.#sound.stopPatternLoop();
  }

  async loadImported(
    track: Extract<BackingSelection, { kind: "imported" }>["track"],
  ): Promise<number> {
    if (this.#loadedTrackId !== track.id) {
      const blob = await this.#loadBlob(track.id);
      if (!blob) throw new Error(`Backing track audio is missing: ${track.id}`);
      this.#replaceObjectUrl(this.#createObjectURL(blob));
      this.#loadedTrackId = track.id;
    }

    return Number.isFinite(this.#audio.duration) && this.#audio.duration >= 0
      ? Math.round(this.#audio.duration * 1_000)
      : track.durationMs;
  }

  playImported(): Promise<void> {
    return this.#audio.play();
  }

  pauseImported(): void {
    this.#audio.pause();
  }

  stopImported(): void {
    this.#audio.pause();
    this.#audio.currentTime = 0;
  }

  seekImported(positionMs: number): void {
    this.#audio.currentTime = Math.max(0, positionMs) / 1_000;
  }

  setImportedLoop(loop: boolean): void {
    this.#audio.loop = loop;
  }

  setImportedVolume(volume: number): void {
    this.#audio.volume = Math.min(1, Math.max(0, volume));
  }

  dispose(): void {
    this.stopGenerated();
    this.stopImported();
    this.#audio.removeEventListener("timeupdate", this.#handleTimeUpdate);
    this.#audio.removeEventListener("ended", this.#handleEnded);
    this.#audio.removeEventListener("error", this.#handleError);
    this.#replaceObjectUrl(undefined);
    this.#loadedTrackId = undefined;
  }

  #replaceObjectUrl(url: string | undefined): void {
    if (this.#objectUrl) this.#revokeObjectURL(this.#objectUrl);
    this.#objectUrl = url;
    this.#audio.src = url ?? "";
    this.#audio.load?.();
  }

  readonly #handleTimeUpdate = (): void => {
    this.#onImportedPositionChange?.(Math.round(this.#audio.currentTime * 1_000));
  };

  readonly #handleEnded = (): void => {
    this.#onImportedEnded?.();
  };

  readonly #handleError = (): void => {
    this.#onImportedError?.("Imported backing track playback failed.");
  };
}

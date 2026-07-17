import type { SoundEngine } from "@repo/music-core/engines/sound";

import { projectGenerated, type BackingSelection, type BackingTrackPlaybackAdapter } from "./index";

export interface BrowserBackingPlayerOptions {
  sound: SoundEngine;
  loadBlob(id: string): Promise<Blob | undefined>;
  audio?: HTMLAudioElement;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  mediaVolume?: () => number;
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
  readonly #mediaVolume: () => number;
  readonly #onImportedPositionChange: ((positionMs: number) => void) | undefined;
  readonly #onImportedEnded: (() => void) | undefined;
  readonly #onImportedError: ((message: string) => void) | undefined;
  #objectUrl: string | undefined;
  #loadedTrackId: string | undefined;
  #importedVolume = 1;
  #disposed = false;
  #loadGeneration = 0;
  #activeImportedGeneration: number | undefined;
  #removeImportedEventListeners: (() => void) | undefined;

  constructor(options: BrowserBackingPlayerOptions) {
    this.#sound = options.sound;
    this.#loadBlob = options.loadBlob;
    this.#audio = options.audio ?? new Audio();
    this.#createObjectURL = options.createObjectURL ?? URL.createObjectURL.bind(URL);
    this.#revokeObjectURL = options.revokeObjectURL ?? URL.revokeObjectURL.bind(URL);
    this.#mediaVolume = options.mediaVolume ?? (() => 1);
    this.#onImportedPositionChange = options.onImportedPositionChange;
    this.#onImportedEnded = options.onImportedEnded;
    this.#onImportedError = options.onImportedError;

    this.#applyVolume();
  }

  async playGenerated(selection: Extract<BackingSelection, { kind: "generated" }>): Promise<void> {
    this.#invalidateImportedEvents();
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
    this.#sound.stopPattern();
  }

  async loadImported(
    track: Extract<BackingSelection, { kind: "imported" }>["track"],
  ): Promise<number> {
    const generation = ++this.#loadGeneration;
    this.#activeImportedGeneration = undefined;
    this.#detachImportedEventListeners();
    if (this.#loadedTrackId !== track.id) {
      const blob = await this.#loadBlob(track.id);
      if (this.#disposed || generation !== this.#loadGeneration) return track.durationMs;
      if (!blob) throw new Error(`Backing track audio is missing: ${track.id}`);
      this.#replaceObjectUrl(this.#createObjectURL(blob));
      this.#loadedTrackId = track.id;
    }

    return Number.isFinite(this.#audio.duration) && this.#audio.duration >= 0
      ? Math.round(this.#audio.duration * 1_000)
      : track.durationMs;
  }

  async loadBuiltin(
    track: Extract<BackingSelection, { kind: "builtin" }>["track"],
  ): Promise<number> {
    this.#loadGeneration += 1;
    this.#activeImportedGeneration = undefined;
    this.#detachImportedEventListeners();
    if (this.#loadedTrackId !== track.id) {
      // Static URL — stream it directly; no blob/object URL needed.
      if (this.#objectUrl) this.#replaceObjectUrl(undefined);
      this.#audio.src = track.url;
      this.#audio.load?.();
      this.#applyVolume();
      this.#loadedTrackId = track.id;
    }
    return Number.isFinite(this.#audio.duration) && this.#audio.duration >= 0
      ? Math.round(this.#audio.duration * 1_000)
      : 0;
  }

  playImported(): Promise<void> {
    const generation = this.#loadGeneration;
    this.#activeImportedGeneration = generation;
    this.#attachImportedEventListeners(generation, this.#currentSource());
    return this.#audio.play();
  }

  pauseImported(): void {
    this.#invalidateImportedEvents();
    this.#audio.pause();
  }

  stopImported(): void {
    this.#invalidateImportedEvents();
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
    this.#importedVolume = Math.min(1, Math.max(0, volume));
    this.#applyVolume();
  }

  syncMediaVolume(): void {
    this.#applyVolume();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.stopGenerated();
    this.stopImported();
    this.#detachImportedEventListeners();
    this.#replaceObjectUrl(undefined);
    this.#loadedTrackId = undefined;
  }

  #replaceObjectUrl(url: string | undefined): void {
    if (this.#objectUrl) this.#revokeObjectURL(this.#objectUrl);
    this.#objectUrl = url;
    this.#audio.src = url ?? "";
    this.#audio.load?.();
    this.#applyVolume();
  }

  #applyVolume(): void {
    const configured = this.#mediaVolume();
    const mediaVolume = Number.isFinite(configured) ? Math.min(1, Math.max(0, configured)) : 1;
    this.#audio.volume = this.#importedVolume * mediaVolume;
  }

  #invalidateImportedEvents(): void {
    this.#loadGeneration += 1;
    this.#activeImportedGeneration = undefined;
    this.#detachImportedEventListeners();
  }

  #attachImportedEventListeners(generation: number, source: string): void {
    this.#detachImportedEventListeners();
    const accepts = () =>
      !this.#disposed &&
      this.#activeImportedGeneration === generation &&
      this.#loadGeneration === generation &&
      this.#currentSource() === source;
    const handleTimeUpdate = () => {
      if (!accepts()) return;
      this.#onImportedPositionChange?.(Math.round(this.#audio.currentTime * 1_000));
    };
    const handleEnded = () => {
      if (!accepts()) return;
      this.#onImportedEnded?.();
    };
    const handleError = () => {
      if (!accepts()) return;
      this.#onImportedError?.("Imported backing track playback failed.");
    };

    this.#audio.addEventListener("timeupdate", handleTimeUpdate);
    this.#audio.addEventListener("ended", handleEnded);
    this.#audio.addEventListener("error", handleError);
    this.#removeImportedEventListeners = () => {
      this.#audio.removeEventListener("timeupdate", handleTimeUpdate);
      this.#audio.removeEventListener("ended", handleEnded);
      this.#audio.removeEventListener("error", handleError);
    };
  }

  #detachImportedEventListeners(): void {
    this.#removeImportedEventListeners?.();
    this.#removeImportedEventListeners = undefined;
  }

  #currentSource(): string {
    return this.#audio.currentSrc || this.#audio.src;
  }
}

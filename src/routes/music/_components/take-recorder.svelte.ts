import { browser } from "$app/environment";

import {
  applyPlaybackGain,
  AudioTakeRecorder,
  closePlaybackContext,
  releasePlaybackGain,
  createTakeEnvelopeCache,
  type AudioTakeRecorderState,
  type AudioTakeRecording,
} from "@repo/music-core/engines/audio-recording";
import type { MediaUsage } from "@repo/music-core/engines/media-library";
import {
  RecordingSession,
  takeToScore,
  type Take as MidiTake,
  type TakeComparison,
} from "@repo/music-core/engines/recording";
import { scoreToPattern } from "@repo/music-core/engines/sound";
import type { AudioTakeRow } from "@repo/music-core/engines/store";

import { useMusicRuntime, type MusicRuntime } from "../_runtime.svelte";

/** MIDI takes are tiny structured JSON, so they persist via the runtime's
 *  Dexie-backed local state (OPFS is for binaries; audio takes use it). */
export const MIDI_TAKES_ID = "music.recording.midi-takes";

/**
 * How many MIDI takes the shared list keeps. Practice Lab takes persist now
 * that the list is shared, so without a ceiling one Dexie row would grow for
 * the life of the install and ride along in every data backup.
 * ponytail: a flat newest-first cap; give it per-source quotas or an archive
 * if players start losing takes they wanted.
 */
export const MAX_PERSISTED_MIDI_TAKES = 100;

/**
 * The take recorder shared by `/music/record` and `/music/play` (Create only
 * redirects to Record). One instance per runtime holds the MIDI take list, the
 * audio take library and the microphone, so a take captured on one destination
 * is already there when another mounts — no reload, no second copy of the list.
 */
export class TakeRecorder {
  readonly #runtime: MusicRuntime;
  readonly #session = new RecordingSession();
  /** Raw microphone recorder. Pages arm it through `arm()`/`disarm()`. */
  readonly audio = new AudioTakeRecorder();
  readonly takeEnvelope = createTakeEnvelopeCache((id) => this.loadTakeBlob(id));

  midiTakes = $state<MidiTake[]>([]);
  selectedMidiTake = $state<MidiTake | undefined>();
  playingMidiTakeId = $state<string | undefined>();

  audioTakes = $state<AudioTakeRow[]>([]);
  selectedAudioTake = $state<AudioTakeRow | undefined>();
  playingAudioTakeId = $state<string | undefined>();
  unsavedTake = $state<AudioTakeRecording | undefined>();
  usage = $state<MediaUsage | undefined>();

  recorderState = $state<AudioTakeRecorderState>({ status: "idle", elapsedMs: 0 });
  devices = $state<MediaDeviceInfo[]>([]);
  micRequested = $state(false);
  micArmed = $state(false);
  /** Last error or status line. Routes own their own live region. */
  message = $state("");
  /** Review-level trim applied on top of the runtime media volume. */
  playbackVolume = $state(1);

  #loading: Promise<void> | undefined;
  #loadingMidi: Promise<void> | undefined;
  #micPreparation: Promise<boolean> | undefined;
  #micGeneration = 0;
  #reviewAudio: HTMLAudioElement | undefined;
  #reviewUrl: string | undefined;
  #reviewGeneration = 0;
  #midiPlaybackGeneration = 0;
  #midiPlaybackTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(runtime: MusicRuntime) {
    this.#runtime = runtime;
    this.recorderState = this.audio.state;
    this.audio.subscribe((state) => {
      this.recorderState = state;
    });
  }

  /** Load everything this recorder owns, once storage is attached by the layout.
   *  Concurrent callers share the one in-flight load. */
  load(): Promise<void> {
    if (!this.#runtime.media) return Promise.resolve();
    this.#loading ??= Promise.all([
      this.loadMidi(),
      this.loadAudioTakes(),
      this.loadDevices(),
    ]).then(() => undefined);
    return this.#loading;
  }

  /** Just the MIDI take list, for a page that owns its own audio take list. */
  loadMidi(): Promise<void> {
    this.#loadingMidi ??= this.#readMidiTakes();
    return this.#loadingMidi;
  }

  async #readMidiTakes(): Promise<void> {
    const saved = await this.#runtime.readLocalState<MidiTake[]>(MIDI_TAKES_ID);
    if (!Array.isArray(saved) || saved.length === 0) return;
    this.#session.restore(saved.slice(0, MAX_PERSISTED_MIDI_TAKES));
    this.midiTakes = this.#session.takes();
  }

  #syncMidiTakes(): void {
    const takes = this.#session.takes();
    // Newest first, so the tail is the oldest.
    if (takes.length > MAX_PERSISTED_MIDI_TAKES) {
      for (const take of takes.slice(MAX_PERSISTED_MIDI_TAKES)) this.#session.remove(take.id);
      this.midiTakes = this.#session.takes();
    } else {
      this.midiTakes = takes;
    }
    this.selectedMidiTake = this.selectedMidiTake
      ? this.midiTakes.find((take) => take.id === this.selectedMidiTake?.id)
      : undefined;
    void this.#runtime.writeLocalState(MIDI_TAKES_ID, this.midiTakes);
  }

  // --- MIDI capture -------------------------------------------------------

  capture(event: Parameters<RecordingSession["capture"]>[0]): void {
    this.#session.capture(event);
  }

  startMidi(atMs: number): void {
    this.#session.start(atMs);
  }

  /** Close the running take. `discardEmpty` drops a take with no notes, which
   *  is what a free-practice run wants when nothing was played. */
  stopMidi(
    atMs: number,
    options: { name?: string; discardEmpty?: boolean } = {},
  ): MidiTake | undefined {
    const take = this.#session.stop(atMs, options.name);
    if (options.discardEmpty && take.notes.length === 0) {
      this.#session.remove(take.id);
      this.#syncMidiTakes();
      return undefined;
    }
    this.selectedMidiTake = take;
    this.#syncMidiTakes();
    return take;
  }

  selectMidiTake(take: MidiTake): void {
    if (this.playingMidiTakeId !== take.id) this.stopMidiPlayback();
    this.selectedMidiTake = take;
  }

  renameMidiTake(take: MidiTake, name: string): void {
    this.#session.renameTake(take.id, name);
    this.#syncMidiTakes();
  }

  noteMidiTake(take: MidiTake, note: string): void {
    this.#session.setTakeNote(take.id, note);
    this.#syncMidiTakes();
  }

  removeMidiTake(id: string): void {
    if (this.playingMidiTakeId === id) this.stopMidiPlayback();
    if (this.selectedMidiTake?.id === id) this.selectedMidiTake = undefined;
    this.#session.remove(id);
    this.#syncMidiTakes();
    this.selectedMidiTake ??= this.midiTakes[0];
  }

  /** Line the take up for another pass: stop playback and select it. */
  practiceMidiTake(take: MidiTake): void {
    this.stopMidiPlayback();
    this.selectedMidiTake = take;
  }

  compare(aId: string, bId: string): TakeComparison | undefined {
    return aId && bId && aId !== bId ? this.#session.compare(aId, bId) : undefined;
  }

  // --- MIDI playback ------------------------------------------------------

  async toggleMidiTake(take: MidiTake): Promise<void> {
    this.message = "";
    if (this.playingMidiTakeId === take.id) {
      this.stopMidiPlayback();
      return;
    }
    this.stopAudioPlayback();
    this.stopMidiPlayback();
    const generation = this.#midiPlaybackGeneration;
    if (!(await this.#runtime.ensurePlaybackVoice())) {
      if (generation === this.#midiPlaybackGeneration) {
        this.message = this.#runtime.audioMessage || "MIDI take playback could not be enabled.";
      }
      return;
    }
    if (generation !== this.#midiPlaybackGeneration) return;

    const bpm = this.#runtime.transportBpm;
    const pattern = scoreToPattern(takeToScore(take, bpm), { bpm });
    this.#runtime.sound.playPattern(pattern.steps);
    this.playingMidiTakeId = take.id;
    this.#midiPlaybackTimer = setTimeout(
      () => this.#finishMidiPlayback(generation),
      Math.max(0, pattern.durationSec * 1_000),
    );
  }

  stopMidiPlayback(): void {
    this.#midiPlaybackGeneration += 1;
    if (this.#midiPlaybackTimer) clearTimeout(this.#midiPlaybackTimer);
    this.#midiPlaybackTimer = undefined;
    this.#runtime.sound.stopPattern();
    this.playingMidiTakeId = undefined;
  }

  #finishMidiPlayback(generation: number): void {
    if (generation !== this.#midiPlaybackGeneration) return;
    this.#midiPlaybackTimer = undefined;
    this.playingMidiTakeId = undefined;
  }

  // --- Audio take library -------------------------------------------------

  loadTakeBlob(id: string): Promise<Blob | undefined> {
    return Promise.resolve(this.#runtime.media?.takeBlob(id));
  }

  async loadAudioTakes(): Promise<void> {
    const media = this.#runtime.media;
    if (!media) return;
    this.audioTakes = await media.listTakes();
    this.selectedAudioTake = this.selectedAudioTake
      ? (this.audioTakes.find((take) => take.id === this.selectedAudioTake?.id) ??
        this.audioTakes[0])
      : this.audioTakes[0];
    this.usage = await media.usage();
  }

  async saveAudioTake(row: AudioTakeRow, blob: Blob): Promise<void> {
    if (!this.#runtime.media) {
      this.unsavedTake = {
        id: row.id,
        blob,
        mimeType: row.mimeType,
        size: row.size,
        durationMs: row.durationMs,
      };
      return;
    }
    try {
      await this.#runtime.media.saveTake(row, blob);
      this.unsavedTake = undefined;
      await this.loadAudioTakes();
      this.selectedAudioTake = this.audioTakes.find((take) => take.id === row.id) ?? row;
    } catch (error) {
      this.unsavedTake = {
        id: row.id,
        blob,
        mimeType: row.mimeType,
        size: row.size,
        durationMs: row.durationMs,
      };
      this.message = error instanceof Error ? error.message : "Audio take could not be saved.";
    }
  }

  async updateAudioTake(
    take: AudioTakeRow,
    patch: { name?: string; note?: string; gainDb?: number },
  ): Promise<void> {
    if (!this.#runtime.media) return;
    try {
      // The library returns the stored row, so one card refreshes without reloading the list.
      const updated = await this.#runtime.media.updateTake(take.id, patch);
      this.audioTakes = this.audioTakes.map((row) => (row.id === updated.id ? updated : row));
      if (this.selectedAudioTake?.id === updated.id) this.selectedAudioTake = updated;
    } catch (error) {
      this.message = error instanceof Error ? error.message : "Audio take could not be updated.";
    }
  }

  async deleteAudioTake(take: AudioTakeRow): Promise<void> {
    if (this.playingAudioTakeId === take.id) this.stopAudioPlayback();
    await this.#runtime.media?.deleteTake(take.id);
    if (this.selectedAudioTake?.id === take.id) this.selectedAudioTake = undefined;
    await this.loadAudioTakes();
  }

  downloadAudioTake(take: AudioTakeRow): void {
    void this.loadTakeBlob(take.id).then((blob) => {
      if (!blob || !browser) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = take.name;
      link.click();
      URL.revokeObjectURL(url);
    });
  }

  async playAudioTake(take: AudioTakeRow): Promise<void> {
    if (!this.#runtime.media || !browser) return;
    this.stopMidiPlayback();
    this.stopAudioPlayback();
    const generation = this.#reviewGeneration;
    try {
      if (!this.#runtime.audioEnabled && !(await this.#runtime.enableAudio())) {
        this.message = this.#runtime.audioMessage || "Audio could not be enabled.";
        return;
      }
      const blob = await this.loadTakeBlob(take.id);
      if (generation !== this.#reviewGeneration) return;
      if (!blob) throw new Error("Recorded take audio is unavailable.");
      this.#reviewUrl = URL.createObjectURL(blob);
      const audio = new Audio(this.#reviewUrl);
      applyPlaybackGain(audio, take.gainDb ?? 0);
      this.#reviewAudio = audio;
      this.playingAudioTakeId = take.id;
      audio.volume = this.playbackVolume * this.#runtime.mediaVolume;
      audio.onended = () => this.#finishAudioPlayback(generation);
      audio.onerror = () => this.#failAudioPlayback(generation, "Recorded take playback failed.");
      await audio.play();
    } catch (error) {
      if (generation !== this.#reviewGeneration) return;
      this.#failAudioPlayback(
        generation,
        error instanceof Error ? error.message : "Recorded take playback failed.",
      );
    }
  }

  stopAudioPlayback(): void {
    this.#reviewGeneration += 1;
    this.#reviewAudio?.pause();
    releasePlaybackGain(this.#reviewAudio);
    this.#reviewAudio = undefined;
    this.playingAudioTakeId = undefined;
    this.#revokeReviewUrl();
  }

  /** Keep a playing review in step with the runtime's media volume. */
  syncPlaybackVolume(mediaVolume: number): void {
    if (this.#reviewAudio) this.#reviewAudio.volume = this.playbackVolume * mediaVolume;
  }

  #finishAudioPlayback(generation: number): void {
    if (generation !== this.#reviewGeneration) return;
    releasePlaybackGain(this.#reviewAudio);
    this.#reviewAudio = undefined;
    this.playingAudioTakeId = undefined;
    this.#revokeReviewUrl();
  }

  #failAudioPlayback(generation: number, message: string): void {
    if (generation !== this.#reviewGeneration) return;
    this.stopAudioPlayback();
    this.message = message;
  }

  #revokeReviewUrl(): void {
    if (this.#reviewUrl && browser) URL.revokeObjectURL(this.#reviewUrl);
    this.#reviewUrl = undefined;
  }

  // --- Microphone ---------------------------------------------------------

  async loadDevices(generation = this.#micGeneration): Promise<void> {
    try {
      const devices = await this.audio.devices();
      if (generation === this.#micGeneration) this.devices = devices;
    } catch {
      if (generation === this.#micGeneration) this.devices = [];
    }
  }

  async arm(deviceId?: string): Promise<void> {
    const generation = ++this.#micGeneration;
    this.micRequested = true;
    this.micArmed = false;
    const preparation = (async () => {
      try {
        await this.audio.prepare(deviceId);
        if (generation !== this.#micGeneration || !this.micRequested) return false;
        this.micArmed = true;
        this.message = "";
        void this.loadDevices(generation);
        return true;
      } catch (error) {
        if (generation === this.#micGeneration) {
          this.micRequested = false;
          this.message = error instanceof Error ? error.message : "Microphone could not be armed.";
        }
        return false;
      }
    })();
    this.#micPreparation = preparation;
    await preparation;
    if (this.#micPreparation === preparation) this.#micPreparation = undefined;
  }

  async disarm(): Promise<void> {
    this.#micGeneration += 1;
    this.micRequested = false;
    this.micArmed = false;
    if (this.recorderState.status === "recording") return;
    await this.audio.cancel();
  }

  /** Resolve once a requested microphone is armed (or was never requested). */
  async micReady(): Promise<boolean> {
    while (this.micRequested && !this.micArmed) {
      const preparation = this.#micPreparation;
      if (!preparation) {
        this.message = "Microphone preparation did not complete.";
        return false;
      }
      const ready = await preparation;
      if (preparation !== this.#micPreparation && this.micRequested) continue;
      return ready && this.micRequested && this.micArmed;
    }
    return !this.micRequested || this.micArmed;
  }

  /** Stop anything this page started and let the microphone go. The take lists
   *  stay loaded, so the next destination sees them without a reload.
   *
   *  The page is gone, so an in-flight audio take is cancelled rather than
   *  saved: `cancel()` ends the `MediaRecorder` and the `getUserMedia` stream.
   *  Leaving them running would keep the browser's recording indicator on for
   *  the rest of the session and buffer chunks nobody can reach. */
  release(): void {
    this.stopMidiPlayback();
    this.stopAudioPlayback();
    void closePlaybackContext();
    // Shared across routes: a failure here must not greet the next destination.
    this.message = "";
    this.#micGeneration += 1;
    this.micRequested = false;
    this.micArmed = false;
    void this.audio.cancel();
  }
}

const recorders = new WeakMap<MusicRuntime, TakeRecorder>();

/** The take recorder for this runtime. Every consumer gets the same instance. */
export function useTakeRecorder(runtime: MusicRuntime = useMusicRuntime()): TakeRecorder {
  let recorder = recorders.get(runtime);
  if (!recorder) {
    recorder = new TakeRecorder(runtime);
    recorders.set(runtime, recorder);
  }
  return recorder;
}

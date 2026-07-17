import type { ImportedBackingTrackRow } from "@repo/music-core/engines/store";
import {
  JAM_PROGRESSIONS,
  transposeProgression,
  type JamProgression,
} from "@repo/music-core/engines/jam";
import { chordNotes, pitchClass } from "@repo/music-core/engines/theory";
import type { SoundPatternStep } from "@repo/music-core/engines/sound";

/** A backing track served from a static URL (e.g. the bundled jazz drum tracks). */
export interface BuiltinBackingTrack {
  id: string;
  label: string;
  url: string;
  bpm?: number;
}

export type BackingSelection =
  | { kind: "none" }
  | { kind: "generated"; progressionId: string; bpm: number; loop: boolean; transpose?: number }
  | { kind: "imported"; track: ImportedBackingTrackRow; loop: boolean }
  | { kind: "builtin"; track: BuiltinBackingTrack; loop: boolean };

/** True for selections backed by the shared `<audio>` element (imported + builtin). */
function isAudioSelection(
  selection: BackingSelection,
): selection is Extract<BackingSelection, { kind: "imported" | "builtin" }> {
  return selection.kind === "imported" || selection.kind === "builtin";
}

export interface BackingTrackState {
  selection: BackingSelection;
  status: "idle" | "loading" | "playing" | "paused" | "stopped" | "error";
  positionMs: number;
  durationMs: number;
  volume: number;
  message?: string;
}

export interface BackingProgressionPattern {
  progressionId: string;
  steps: SoundPatternStep[];
  durationSec: number;
}

export interface BackingTrackPlaybackAdapter {
  playGenerated(selection: Extract<BackingSelection, { kind: "generated" }>): Promise<void>;
  stopGenerated(): void;
  loadImported(track: ImportedBackingTrackRow): Promise<number>;
  loadBuiltin(track: BuiltinBackingTrack): Promise<number>;
  playImported(): Promise<void>;
  pauseImported(): void;
  stopImported(): void;
  seekImported(positionMs: number): void;
  setImportedLoop(loop: boolean): void;
  setImportedVolume(volume: number): void;
  dispose(): void;
}

export type BackingTrackSubscriber = (state: BackingTrackState) => void;

const DEFAULT_STATE: BackingTrackState = {
  selection: { kind: "none" },
  status: "idle",
  positionMs: 0,
  durationMs: 0,
  volume: 1,
};

export class BackingTrackEngine {
  readonly #adapter: BackingTrackPlaybackAdapter;
  readonly #subscribers = new Set<BackingTrackSubscriber>();
  #state: BackingTrackState = DEFAULT_STATE;
  #playGeneration = 0;
  #completionTimer: ReturnType<typeof setTimeout> | undefined;
  #disposed = false;

  constructor(adapter: BackingTrackPlaybackAdapter) {
    this.#adapter = adapter;
  }

  get state(): BackingTrackState {
    return cloneState(this.#state);
  }

  subscribe(subscriber: BackingTrackSubscriber): () => void {
    this.#subscribers.add(subscriber);
    subscriber(this.state);
    return () => this.#subscribers.delete(subscriber);
  }

  selectNone(): void {
    if (this.#disposed) return;
    this.stop();
    this.#setState({
      selection: { kind: "none" },
      status: "idle",
      positionMs: 0,
      durationMs: 0,
      message: undefined,
    });
  }

  selectGenerated(selection: Extract<BackingSelection, { kind: "generated" }>): void {
    if (this.#disposed) return;
    this.stop();
    this.#setState({
      selection: { ...selection },
      status: "idle",
      positionMs: 0,
      durationMs: Math.round(projectGenerated(selection).durationSec * 1_000),
      message: undefined,
    });
  }

  selectImported(track: ImportedBackingTrackRow, options: { loop?: boolean } = {}): void {
    if (this.#disposed) return;
    this.stop();
    this.#setState({
      selection: { kind: "imported", track: structuredClone(track), loop: options.loop === true },
      status: "idle",
      positionMs: 0,
      durationMs: track.durationMs,
      message: undefined,
    });
  }

  selectBuiltin(track: BuiltinBackingTrack, options: { loop?: boolean } = {}): void {
    if (this.#disposed) return;
    this.stop();
    this.#setState({
      selection: { kind: "builtin", track: { ...track }, loop: options.loop !== false },
      status: "idle",
      positionMs: 0,
      durationMs: 0,
      message: undefined,
    });
  }

  async play(): Promise<void> {
    if (this.#disposed) return;
    this.#clearCompletion();
    const generation = ++this.#playGeneration;
    const selection = this.#state.selection;
    if (selection.kind === "none") return;

    this.#setState({ status: "loading", message: undefined });
    try {
      if (selection.kind === "generated") {
        await this.#adapter.playGenerated(selection);
        if (!this.#isCurrentPlay(generation)) return;
        this.#setState({
          status: "playing",
          durationMs: Math.round(projectGenerated(selection).durationSec * 1_000),
        });
        if (!selection.loop) this.#scheduleCompletion(generation, this.#state.durationMs);
        return;
      }

      const durationMs =
        selection.kind === "builtin"
          ? await this.#adapter.loadBuiltin(selection.track)
          : await this.#adapter.loadImported(selection.track);
      if (!this.#isCurrentPlay(generation)) return;
      this.#adapter.setImportedLoop(selection.loop);
      this.#adapter.setImportedVolume(this.#state.volume);
      await this.#adapter.playImported();
      if (!this.#isCurrentPlay(generation)) return;
      this.#setState({
        status: "playing",
        durationMs: normalizeDuration(
          durationMs,
          selection.kind === "imported" ? selection.track.durationMs : this.#state.durationMs,
        ),
      });
    } catch (error) {
      if (!this.#isCurrentPlay(generation)) return;
      this.#setState({
        status: "error",
        message: error instanceof Error ? error.message : "Backing track playback failed.",
      });
      throw error;
    }
  }

  pause(): void {
    this.#playGeneration += 1;
    this.#clearCompletion();
    const selection = this.#state.selection;
    if (selection.kind === "generated") {
      this.#adapter.stopGenerated();
      this.#setState({ status: "paused" });
      return;
    }
    if (isAudioSelection(selection)) {
      this.#adapter.pauseImported();
      this.#setState({ status: "paused" });
    }
  }

  stop(): void {
    this.#playGeneration += 1;
    this.#clearCompletion();
    if (this.#disposed) return;
    const selection = this.#state.selection;
    if (selection.kind === "generated") this.#adapter.stopGenerated();
    if (isAudioSelection(selection)) this.#adapter.stopImported();
    if (selection.kind !== "none") this.#setState({ status: "stopped", positionMs: 0 });
  }

  seek(positionMs: number): void {
    const nextPosition = clampPosition(positionMs, this.#state.durationMs);
    if (isAudioSelection(this.#state.selection)) {
      this.#adapter.seekImported(nextPosition);
    }
    this.#setState({ positionMs: nextPosition });
  }

  setLoop(loop: boolean): void {
    const selection = this.#state.selection;
    if (selection.kind === "none") return;
    if (isAudioSelection(selection)) {
      this.#adapter.setImportedLoop(loop);
    }
    this.#setState({ selection: { ...selection, loop } });
  }

  setVolume(volume: number): void {
    const nextVolume = clamp01(volume);
    if (isAudioSelection(this.#state.selection)) {
      this.#adapter.setImportedVolume(nextVolume);
    }
    this.#setState({ volume: nextVolume });
  }

  updateImportedPosition(positionMs: number): void {
    this.#setState({ positionMs: clampPosition(positionMs, this.#state.durationMs) });
  }

  markEnded(): void {
    this.#clearCompletion();
    this.#setState({ status: "stopped", positionMs: this.#state.durationMs });
  }

  dispose(): void {
    if (this.#disposed) return;
    this.stop();
    this.#disposed = true;
    this.#adapter.dispose();
    this.#subscribers.clear();
  }

  #isCurrentPlay(generation: number): boolean {
    return !this.#disposed && generation === this.#playGeneration;
  }

  #scheduleCompletion(generation: number, durationMs: number): void {
    this.#completionTimer = setTimeout(() => {
      this.#completionTimer = undefined;
      if (!this.#isCurrentPlay(generation)) return;
      this.#adapter.stopGenerated();
      this.#setState({ status: "stopped", positionMs: durationMs });
    }, durationMs);
  }

  #clearCompletion(): void {
    if (this.#completionTimer === undefined) return;
    clearTimeout(this.#completionTimer);
    this.#completionTimer = undefined;
  }

  #setState(patch: Partial<BackingTrackState>): void {
    this.#state = cloneState({ ...this.#state, ...patch });
    for (const subscriber of this.#subscribers) subscriber(this.state);
  }
}

export function projectGenerated(
  selection: Extract<BackingSelection, { kind: "generated" }>,
): BackingProgressionPattern {
  const baseProgression = JAM_PROGRESSIONS.find((entry) => entry.id === selection.progressionId);
  const progression = baseProgression
    ? transposeProgression(baseProgression, selection.transpose ?? 0)
    : undefined;
  if (!progression) throw new Error(`Unknown generated progression: ${selection.progressionId}`);
  return projectProgression(progression, selection.bpm);
}

export function projectProgression(
  progression: JamProgression,
  bpm: number,
): BackingProgressionPattern {
  if (!Number.isFinite(bpm) || bpm <= 0) {
    throw new Error("Progression bpm must be finite and greater than zero.");
  }

  const secondsPerBeat = 60 / bpm;
  let offsetSeconds = 0;
  const steps: SoundPatternStep[] = progression.chords.map((chord) => {
    const durationSeconds = chord.bars * 4 * secondsPerBeat;
    const midiNotes = chordMidiNotes(chord.symbol);
    const step = { midiNotes, offsetSeconds, durationSeconds };
    offsetSeconds += durationSeconds;
    return step;
  });

  return {
    progressionId: progression.id,
    steps,
    durationSec: offsetSeconds,
  };
}

function chordMidiNotes(symbol: string): number[] {
  const notes = chordNotes(symbol);
  const root = pitchClass(notes[0]!);
  const rootMidi = 48 + root;
  return notes.map((note) => {
    const midi = 48 + pitchClass(note);
    return midi < rootMidi ? midi + 12 : midi;
  });
}

function cloneState(state: BackingTrackState): BackingTrackState {
  return {
    ...state,
    selection: cloneSelection(state.selection),
  };
}

function cloneSelection(selection: BackingSelection): BackingSelection {
  if (selection.kind === "imported") {
    return { ...selection, track: structuredClone(selection.track) };
  }
  if (selection.kind === "builtin") {
    return { ...selection, track: structuredClone(selection.track) };
  }
  return { ...selection };
}

function normalizeDuration(durationMs: number, fallbackMs: number): number {
  return Number.isFinite(durationMs) && durationMs >= 0 ? Math.round(durationMs) : fallbackMs;
}

function clampPosition(positionMs: number, durationMs: number): number {
  const position = Number.isFinite(positionMs) ? positionMs : 0;
  const upper = durationMs > 0 ? durationMs : Number.POSITIVE_INFINITY;
  return Math.min(upper, Math.max(0, Math.round(position)));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

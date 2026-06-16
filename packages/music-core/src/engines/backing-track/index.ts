import type { ImportedBackingTrackRow } from "@repo/music-core/engines/store";
import { JAM_PROGRESSIONS, type JamProgression } from "@repo/music-core/engines/jam";
import { chordNotes, pitchClass } from "@repo/music-core/engines/theory";
import type { SoundPatternStep } from "@repo/music-core/engines/sound";

export type BackingSelection =
  | { kind: "none" }
  | { kind: "generated"; progressionId: string; bpm: number; loop: boolean }
  | { kind: "imported"; track: ImportedBackingTrackRow; loop: boolean };

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
    this.stop();
    this.#setState({
      selection: { kind: "imported", track: structuredClone(track), loop: options.loop === true },
      status: "idle",
      positionMs: 0,
      durationMs: track.durationMs,
      message: undefined,
    });
  }

  async play(): Promise<void> {
    const selection = this.#state.selection;
    if (selection.kind === "none") return;

    this.#setState({ status: "loading", message: undefined });
    try {
      if (selection.kind === "generated") {
        await this.#adapter.playGenerated(selection);
        this.#setState({
          status: "playing",
          durationMs: Math.round(projectGenerated(selection).durationSec * 1_000),
        });
        return;
      }

      const durationMs = await this.#adapter.loadImported(selection.track);
      this.#adapter.setImportedLoop(selection.loop);
      this.#adapter.setImportedVolume(this.#state.volume);
      await this.#adapter.playImported();
      this.#setState({
        status: "playing",
        durationMs: normalizeDuration(durationMs, selection.track.durationMs),
      });
    } catch (error) {
      this.#setState({
        status: "error",
        message: error instanceof Error ? error.message : "Backing track playback failed.",
      });
      throw error;
    }
  }

  pause(): void {
    const selection = this.#state.selection;
    if (selection.kind === "generated") {
      this.#adapter.stopGenerated();
      this.#setState({ status: "paused" });
      return;
    }
    if (selection.kind === "imported") {
      this.#adapter.pauseImported();
      this.#setState({ status: "paused" });
    }
  }

  stop(): void {
    const selection = this.#state.selection;
    if (selection.kind === "generated") this.#adapter.stopGenerated();
    if (selection.kind === "imported") this.#adapter.stopImported();
    if (selection.kind !== "none") this.#setState({ status: "stopped", positionMs: 0 });
  }

  seek(positionMs: number): void {
    const nextPosition = clampPosition(positionMs, this.#state.durationMs);
    if (this.#state.selection.kind === "imported") {
      this.#adapter.seekImported(nextPosition);
    }
    this.#setState({ positionMs: nextPosition });
  }

  setLoop(loop: boolean): void {
    const selection = this.#state.selection;
    if (selection.kind === "none") return;
    if (selection.kind === "imported") {
      this.#adapter.setImportedLoop(loop);
    }
    this.#setState({ selection: { ...selection, loop } });
  }

  setVolume(volume: number): void {
    const nextVolume = clamp01(volume);
    if (this.#state.selection.kind === "imported") {
      this.#adapter.setImportedVolume(nextVolume);
    }
    this.#setState({ volume: nextVolume });
  }

  updateImportedPosition(positionMs: number): void {
    this.#setState({ positionMs: clampPosition(positionMs, this.#state.durationMs) });
  }

  markEnded(): void {
    this.#setState({ status: "stopped", positionMs: this.#state.durationMs });
  }

  dispose(): void {
    this.stop();
    this.#adapter.dispose();
    this.#subscribers.clear();
  }

  #setState(patch: Partial<BackingTrackState>): void {
    this.#state = cloneState({ ...this.#state, ...patch });
    for (const subscriber of this.#subscribers) subscriber(this.state);
  }
}

export function projectGenerated(
  selection: Extract<BackingSelection, { kind: "generated" }>,
): BackingProgressionPattern {
  const progression = JAM_PROGRESSIONS.find((entry) => entry.id === selection.progressionId);
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
    return {
      ...selection,
      track: structuredClone(selection.track),
    };
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

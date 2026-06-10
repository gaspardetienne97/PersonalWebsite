import { getContext, setContext } from "svelte";

import {
  INSTRUMENT_LABELS,
  unixMs,
  type ExerciseRunRecord,
  type InputSource,
  type InstrumentId,
  type ScoringEvent,
  type SessionSource,
} from "@repo/music-core/domain";
import {
  DeviceProfileStore,
  type DeviceProfileRepository,
} from "@repo/music-core/engines/device-profiles";
import { InputRouter } from "@repo/music-core/engines/input-router";
import { MidiEngine } from "@repo/music-core/engines/midi";
import { PracticeSessionStore } from "@repo/music-core/engines/sessions";
import { SOUND_PRESET_NAMES, SoundEngine } from "@repo/music-core/engines/sound";
import type { PracticeStore } from "@repo/music-core/engines/store";
import {
  createToneTransportEngine,
  type TransportEngine,
} from "@repo/music-core/engines/transport";

const MUSIC_RUNTIME = Symbol("music-runtime");

/**
 * A screen's "now playing" content. Routes register one so the transport bar's
 * Play button plays whatever is on screen (a take, a melody, a MIDI file, a
 * progression). `play` is a one-shot preview; `durationSec` resets the button.
 */
export interface PlaybackSource {
  label: string;
  durationSec: number;
  play: () => void | Promise<void>;
  stop?: () => void;
}

/** A MIDI-preferred instrument (from Connect) the transport bar can listen to. */
export interface MidiInstrumentOption {
  instrument: InstrumentId;
  channel?: number;
  label: string;
}

/**
 * A completed practice activity to drop into the journal. Routes call
 * `recordPractice` when an exercise/session finishes so it shows up under
 * `/music/track` automatically (and is editable there).
 */
export interface PracticeCaptureEntry {
  source: SessionSource;
  instrument?: InstrumentId;
  tags?: string[];
  scoringEvents?: ScoringEvent[];
  runs?: ExerciseRunRecord[];
  xpEarned: number;
  note?: string;
}

export class MusicRuntime {
  readonly router = new InputRouter();
  readonly midi = new MidiEngine();
  readonly sound = new SoundEngine();

  audioEnabled = $state(false);
  audioPending = $state(false);
  audioMessage = $state("Audio is waiting for a user gesture.");

  /** Shared UI state so chrome and routes read one source via useMusicRuntime(). */
  activeInstrument = $state<InstrumentId>("piano");
  activeSource = $state<InputSource>(this.router.activeSource);
  inputConfidence = $state<number>(this.router.confidence);

  /** Shared metronome state driving the persistent transport bar. */
  transportBpm = $state(96);
  metronomeRunning = $state(false);
  activeBeat = $state(-1);
  countInBars = $state(1);
  masterMuted = $state(false);
  metronomeLevel = $state(0.7);
  instrument = $state(SOUND_PRESET_NAMES[0]!);
  readonly instruments = SOUND_PRESET_NAMES;

  /** The current screen's playback source (drives the transport Play button). */
  playbackSource = $state<PlaybackSource | undefined>();
  playbackPlaying = $state(false);
  #playbackResetTimer: ReturnType<typeof setTimeout> | undefined;

  /** MIDI-preferred instruments from Connect + the active channel filter. */
  midiInstruments = $state<MidiInstrumentOption[]>([]);
  activeChannel = $state<number | undefined>();
  #deviceProfiles: DeviceProfileStore | undefined;

  /** Journal sink: completed activities are appended via recordPractice. */
  #journal: PracticeSessionStore | undefined;
  #captureSeq = 0;

  #transport?: TransportEngine;
  #unsubscribeTransport?: () => void;
  #enablePromise?: Promise<boolean>;
  #unsubscribeMidi = this.midi.subscribe((event) => {
    this.router.push(event);
  });
  #unsubscribeRouterState = this.router.subscribeState((state) => {
    this.activeSource = state.activeSource;
    this.inputConfidence = state.confidence;
  });

  enableAudio(): Promise<boolean> {
    this.#enablePromise ??= this.#enableAudio().finally(() => {
      this.#enablePromise = undefined;
    });
    return this.#enablePromise;
  }

  setActiveInstrument(instrument: InstrumentId): void {
    this.activeInstrument = instrument;
    this.router.setActiveInstrument(instrument);
  }

  setActiveChannel(channel?: number): void {
    this.activeChannel = channel;
    this.router.setActiveChannel(channel);
  }

  /** Listen to a specific MIDI instrument + its channel (from a Connect profile). */
  setActiveMidiInstrument(instrument: InstrumentId, channel?: number): void {
    this.setActiveInstrument(instrument);
    this.setActiveChannel(channel);
  }

  /** Connect persists device profiles; the bar reads MIDI-preferred instruments. */
  async attachStorage(settings: DeviceProfileRepository): Promise<void> {
    this.#deviceProfiles = new DeviceProfileStore(settings);
    await this.reloadMidiInstruments();
  }

  /** Point the journal sink at the local PracticeStore so activities persist. */
  attachJournal(store: PracticeStore): void {
    this.#journal = new PracticeSessionStore(store);
  }

  /** Append a completed practice activity to the journal (no-op without storage). */
  async recordPractice(entry: PracticeCaptureEntry): Promise<void> {
    if (!this.#journal) return;
    const startedAt = unixMs(Date.now());
    const id = `${entry.source}-${startedAt}-${this.#captureSeq++}`;
    this.#journal.start({
      id,
      source: entry.source,
      startedAt,
      ...(entry.instrument !== undefined ? { instrument: entry.instrument } : {}),
      ...(entry.tags !== undefined ? { tags: entry.tags } : {}),
    });
    for (const run of entry.runs ?? []) this.#journal.recordRun(id, run);
    for (const event of entry.scoringEvents ?? []) this.#journal.recordScoringEvent(id, event);
    this.#journal.finish(id, unixMs(Date.now()), entry.xpEarned, entry.note);
    await this.#journal.flush();
  }

  async reloadMidiInstruments(): Promise<void> {
    if (!this.#deviceProfiles) return;
    const state = await this.#deviceProfiles.load();
    const options: MidiInstrumentOption[] = [];
    for (const [instrument, source] of Object.entries(state.preferences)) {
      if (source !== "midi") continue;
      const id = instrument as InstrumentId;
      const profile = state.profiles.find((entry) => entry.instrument === id);
      options.push({ instrument: id, channel: profile?.channel, label: INSTRUMENT_LABELS[id] });
    }
    this.midiInstruments = options;
  }

  setTransportBpm(value: number): void {
    this.transportBpm = value;
    // Forward to the live clock so tempo changes apply while the metronome runs.
    if (this.#transport && Number.isFinite(value) && value > 0) this.#transport.setBpm(value);
  }

  setCountIn(bars: number): void {
    this.countInBars = Math.max(0, Math.round(bars));
    this.#transport?.setCountInBars(this.countInBars);
  }

  toggleMute(): void {
    this.masterMuted = !this.masterMuted;
    this.sound.setMasterMuted(this.masterMuted);
  }

  setMetronomeLevel(level: number): void {
    this.metronomeLevel = Math.min(1, Math.max(0, level));
    this.sound.setMetronomeLevel(this.metronomeLevel);
  }

  setInstrument(name: string): void {
    this.instrument = name;
    this.sound.setInstrument(name);
  }

  /** Routes register their on-screen content; call with undefined to clear. */
  setPlaybackSource(source?: PlaybackSource): void {
    this.#clearPlaybackTimer();
    if (this.playbackPlaying) {
      this.playbackSource?.stop?.();
      this.playbackPlaying = false;
    }
    this.playbackSource = source;
  }

  /** Transport Play: play the screen's content, or fall back to the metronome. */
  async togglePlayback(): Promise<void> {
    const source = this.playbackSource;
    if (!source) {
      await this.toggleMetronome();
      return;
    }
    if (this.playbackPlaying) {
      source.stop?.();
      this.playbackPlaying = false;
      this.#clearPlaybackTimer();
      return;
    }
    if (!this.audioEnabled && !(await this.enableAudio())) return;
    await source.play();
    this.playbackPlaying = true;
    this.#playbackResetTimer = setTimeout(
      () => {
        this.playbackPlaying = false;
      },
      Math.max(300, Math.round(source.durationSec * 1000)),
    );
  }

  #clearPlaybackTimer(): void {
    if (this.#playbackResetTimer !== undefined) {
      clearTimeout(this.#playbackResetTimer);
      this.#playbackResetTimer = undefined;
    }
  }

  async toggleMetronome(): Promise<void> {
    const enabled = await this.enableAudio();
    if (!enabled) return;

    if (!this.#transport) {
      this.#transport = await createToneTransportEngine({
        bpm: this.transportBpm,
        onMetronomeClick: (atSeconds, accented) =>
          this.sound.playMetronomeClick(atSeconds, accented),
      });
      this.#unsubscribeTransport = this.#transport.subscribe((event) => {
        if (event.kind === "beat") this.activeBeat = event.beat;
      });
    }

    if (this.#transport.state.running) {
      this.#transport.stop();
      this.metronomeRunning = false;
      this.activeBeat = -1;
      return;
    }

    this.#transport.setBpm(this.transportBpm);
    this.#transport.start();
    this.metronomeRunning = true;
  }

  dispose(): void {
    this.#clearPlaybackTimer();
    this.#unsubscribeMidi();
    this.#unsubscribeRouterState();
    this.#unsubscribeTransport?.();
    if (this.#transport?.state.running) this.#transport.stop();
    void this.midi.disable();
    this.sound.dispose();
  }

  async #enableAudio(): Promise<boolean> {
    this.audioPending = true;

    try {
      const state = await this.sound.enable();
      this.audioEnabled = state.enabled;
      this.audioMessage = state.message;
      return state.enabled;
    } catch (error) {
      this.audioEnabled = false;
      this.audioMessage = error instanceof Error ? error.message : "Audio could not be enabled.";
      return false;
    } finally {
      this.audioPending = false;
    }
  }
}

export function createMusicRuntime(): MusicRuntime {
  const runtime = new MusicRuntime();
  setContext(MUSIC_RUNTIME, runtime);
  return runtime;
}

export function useMusicRuntime(): MusicRuntime {
  const runtime = getContext<MusicRuntime | undefined>(MUSIC_RUNTIME);
  if (runtime) return runtime;

  const localRuntime = new MusicRuntime();
  setContext(MUSIC_RUNTIME, localRuntime);
  return localRuntime;
}

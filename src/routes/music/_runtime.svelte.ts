import { getContext, setContext } from "svelte";

import {
  INSTRUMENT_LABELS,
  monotonicMs,
  unixMs,
  type ExerciseRunRecord,
  type InputSource,
  type InstrumentId,
  type MonotonicMs,
  type ScoringEvent,
  type SessionSource,
  type UnixMs,
} from "@repo/music-core/domain";
import {
  DeviceProfileStore,
  defaultSurfaceForInstrument,
  type DeviceProfileRepository,
  type InputSurfaceId,
  type InstrumentSurfacePreferences,
} from "@repo/music-core/engines/device-profiles";
import {
  DailyRoutineSession,
  type DailyRoutineState,
  type DailyRoutineStep,
} from "@repo/music-core/engines/daily-routine";
import { InputRouter } from "@repo/music-core/engines/input-router";
import { createMediaLibrary, type MediaLibrary } from "@repo/music-core/engines/media-library";
import { MidiEngine } from "@repo/music-core/engines/midi";
import { SampleKitStore } from "@repo/music-core/engines/sample-kit";
import { PracticeSessionStore } from "@repo/music-core/engines/sessions";
import { SOUND_PRESET_NAMES, SoundEngine } from "@repo/music-core/engines/sound";
import { deleteBinary, getBinary, putBinary } from "@repo/music-core/engines/store";
import type { PracticeStore } from "@repo/music-core/engines/store";
import {
  createToneTransportEngine,
  type TransportEngine,
  type TransportEngineOptions,
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

export interface MusicRuntimeOptions {
  createTransport?: (options: TransportEngineOptions) => Promise<TransportEngine>;
  monotonicNowMs?: () => MonotonicMs;
}

/**
 * A completed practice activity to drop into the journal. Routes call
 * `recordPractice` when an exercise/session finishes so it shows up under
 * `/music/track` automatically (and is editable there).
 */
export interface PracticeCaptureEntry {
  id?: string;
  startedAt?: UnixMs;
  endedAt?: UnixMs;
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
  readonly #createTransport: (options: TransportEngineOptions) => Promise<TransportEngine>;
  readonly #monotonicNowMs: () => MonotonicMs;

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
  /** Per-instrument on-screen surface chosen in Connect (in-session fallback). */
  inputSurfaces = $state<InstrumentSurfacePreferences>({});
  #deviceProfiles: DeviceProfileStore | undefined;

  /** Journal sink: completed activities are appended via recordPractice. */
  media = $state<MediaLibrary | undefined>();
  sampleKits = $state.raw<SampleKitStore | undefined>(undefined);
  dailyRoutine = $state<DailyRoutineState | undefined>();
  #settings: DeviceProfileRepository | undefined;
  #journal: PracticeSessionStore | undefined;
  #dailyRoutineSession: DailyRoutineSession | undefined;
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

  constructor(options: MusicRuntimeOptions = {}) {
    this.#createTransport = options.createTransport ?? createToneTransportEngine;
    this.#monotonicNowMs = options.monotonicNowMs ?? (() => monotonicMs(performance.now()));
  }

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
    this.#settings = settings;
    this.#deviceProfiles = new DeviceProfileStore(settings);
    this.sampleKits = new SampleKitStore({
      repository: settings,
      binaries: { put: putBinary, get: getBinary, delete: deleteBinary },
    });
    await this.reloadMidiInstruments();
  }

  /** Small route-owned local state, persisted through PracticeStore.settings. */
  async readLocalState<T>(id: string): Promise<T | undefined> {
    const record = await this.#settings?.get(id);
    return record?.value as T | undefined;
  }

  async writeLocalState<T>(id: string, value: T): Promise<void> {
    await this.#settings?.put({ id, value });
  }

  /** Point the journal sink at the local PracticeStore so activities persist. */
  attachJournal(store: PracticeStore): void {
    this.#journal = new PracticeSessionStore(store);
  }

  /** Point imported tracks and recorded takes at the shared local PracticeStore. */
  attachMedia(store: PracticeStore): void {
    this.media = createMediaLibrary(store);
  }

  /** Append a completed practice activity to the journal (no-op without storage). */
  async recordPractice(entry: PracticeCaptureEntry): Promise<void> {
    const startedAt = entry.startedAt ?? unixMs(Date.now());
    const endedAt = entry.endedAt ?? unixMs(Date.now());
    if (endedAt < startedAt) {
      throw new Error("Practice capture endedAt must not be before startedAt");
    }
    const routineState = this.#dailyRoutineSession?.state;
    const isCurrentRoutineDrill =
      routineState?.status === "active" &&
      routineState.currentStep !== undefined &&
      (entry.tags ?? []).includes(routineState.currentStep.id);
    if (entry.source === "drill" && isCurrentRoutineDrill && this.#dailyRoutineSession) {
      this.#dailyRoutineSession.completeCurrent(
        {
          scoringEvents: entry.scoringEvents ?? [],
          runs: entry.runs ?? [],
          tags: entry.tags ?? [],
          xpEarned: entry.xpEarned,
          note: entry.note,
        },
        endedAt,
      );
      const nextState = this.#dailyRoutineSession.state;
      this.dailyRoutine = nextState;
      const summary = nextState.summary;
      if (!summary || !nextState.id || nextState.startedAt === undefined) return;
      await this.#persistPractice({
        id: nextState.id,
        source: "daily-routine",
        startedAt: nextState.startedAt,
        endedAt,
        tags: ["daily-routine", ...summary.tags],
        scoringEvents: summary.scoringEvents,
        runs: summary.runs,
        xpEarned: summary.totalXp,
        note: `Daily routine · ${summary.completedSteps}/${summary.totalSteps} drills · ${Math.round(
          summary.accuracy * 100,
        )}% accuracy`,
      });
      return;
    }

    await this.#persistPractice({ ...entry, startedAt, endedAt });
  }

  startDailyRoutine(
    steps: DailyRoutineStep[],
    startedAt: UnixMs = unixMs(Date.now()),
  ): DailyRoutineState {
    const session = new DailyRoutineSession(steps);
    session.start(`daily-routine-${startedAt}-${this.#captureSeq++}`, startedAt);
    this.#dailyRoutineSession = session;
    this.dailyRoutine = session.state;
    return this.dailyRoutine;
  }

  resetDailyRoutine(): void {
    this.#dailyRoutineSession = undefined;
    this.dailyRoutine = undefined;
  }

  async #persistPractice(entry: PracticeCaptureEntry): Promise<void> {
    if (!this.#journal) return;
    const startedAt = entry.startedAt ?? unixMs(Date.now());
    const endedAt = entry.endedAt ?? unixMs(Date.now());
    const id = entry.id ?? `${entry.source}-${startedAt}-${this.#captureSeq++}`;
    this.#journal.start({
      id,
      source: entry.source,
      startedAt,
      ...(entry.instrument !== undefined ? { instrument: entry.instrument } : {}),
      ...(entry.tags !== undefined ? { tags: entry.tags } : {}),
    });
    for (const run of entry.runs ?? []) this.#journal.recordRun(id, run);
    for (const event of entry.scoringEvents ?? []) this.#journal.recordScoringEvent(id, event);
    this.#journal.finish(id, endedAt, entry.xpEarned, entry.note);
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
    this.inputSurfaces = state.surfaces;
    this.midi.setIgnoredInputs(
      state.profiles.filter((profile) => profile.ignored).map((profile) => profile.id),
    );
  }

  /** The on-screen surface to show for an instrument (chosen in Connect, or default). */
  surfaceFor(instrument: InstrumentId): InputSurfaceId {
    return this.inputSurfaces[instrument] ?? defaultSurfaceForInstrument(instrument);
  }

  /** Persist the on-screen surface for an instrument and refresh reactive state. */
  async setInputSurface(instrument: InstrumentId, surface: InputSurfaceId): Promise<void> {
    if (!this.#deviceProfiles) return;
    const state = await this.#deviceProfiles.setSurface(instrument, surface);
    this.inputSurfaces = state.surfaces;
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
    const transport = await this.#ensureTransport();

    if (transport.state.running) {
      transport.stop();
      this.metronomeRunning = false;
      this.activeBeat = -1;
      return;
    }

    transport.setBpm(this.transportBpm);
    transport.setCountInBars(this.countInBars);
    transport.start();
    this.metronomeRunning = true;
  }

  async runCountIn(): Promise<MonotonicMs> {
    if (!(await this.enableAudio())) throw new Error(this.audioMessage);
    const transport = await this.#ensureTransport();
    transport.setBpm(this.transportBpm);
    transport.setCountInBars(this.countInBars);
    if (this.countInBars === 0) {
      transport.start();
      this.metronomeRunning = true;
      return this.#monotonicNowMs();
    }

    return new Promise<MonotonicMs>((resolve) => {
      const unsubscribe = transport.subscribe((event) => {
        if (event.kind === "beat" && !event.countingIn) {
          unsubscribe();
          resolve(event.atMonotonicMs);
        }
      });
      transport.start();
      this.metronomeRunning = true;
    });
  }

  stopPracticeClock(): void {
    if (this.#transport?.state.running) this.#transport.stop();
    this.metronomeRunning = false;
    this.activeBeat = -1;
  }

  async #ensureTransport(): Promise<TransportEngine> {
    if (this.#transport) return this.#transport;
    this.#transport = await this.#createTransport({
      bpm: this.transportBpm,
      countInBars: this.countInBars,
      onMetronomeClick: (atSeconds, accented) => this.sound.playMetronomeClick(atSeconds, accented),
    });
    this.#unsubscribeTransport = this.#transport.subscribe((event) => {
      if (event.kind === "beat") this.activeBeat = event.beat;
    });
    return this.#transport;
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

import { getContext, setContext } from "svelte";

import {
  INSTRUMENT_LABELS,
  monotonicMs,
  unixMs,
  type ExerciseRunRecord,
  type InputSource,
  type InstrumentId,
  type MonotonicMs,
  type NoteEvent,
  type ScoringEvent,
  type SessionSource,
  type UnixMs,
} from "@repo/music-core/domain";
import {
  DeviceProfileStore,
  applyDeviceProfile,
  defaultSurfaceForInstrument,
  type DeviceProfile,
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
import { MidiEngine, type MidiDeviceSummary } from "@repo/music-core/engines/midi";
import { mpcControllerInitSysex, mpcHeartbeatSysex } from "@repo/music-core/engines/pad-color";
import { SampleKitStore } from "@repo/music-core/engines/sample-kit";
import {
  PracticeSessionStore,
  runComparisonTags,
  type RunComparisonSetup,
} from "@repo/music-core/engines/sessions";
import {
  MusicSettingsStore,
  PLAYBACK_SOUND_IDS,
  PLAYBACK_SOUND_LABELS,
  updateTempoByVariant,
  lookupTempoByVariant,
  type MusicSettings,
  type PlaybackSoundId,
} from "@repo/music-core/engines/settings";
import { SoundEngine } from "@repo/music-core/engines/sound";
import { deleteBinary, getBinary, putBinary } from "@repo/music-core/engines/store";
import type { PracticeStore } from "@repo/music-core/engines/store";
import {
  createToneTransportEngine,
  type QuantizationGrid,
  type TransportEngine,
  type TransportEvent,
  type TransportEngineOptions,
} from "@repo/music-core/engines/transport";

export const MUSIC_RUNTIME = Symbol("music-runtime");

const SALAMANDER_PIANO_SAMPLES = {
  C1: "/audio/music/piano/C1v8.mp3",
  C2: "/audio/music/piano/C2v8.mp3",
  C3: "/audio/music/piano/C3v8.mp3",
  C4: "/audio/music/piano/C4v8.mp3",
  C5: "/audio/music/piano/C5v8.mp3",
  C6: "/audio/music/piano/C6v8.mp3",
  C7: "/audio/music/piano/C7v8.mp3",
  C8: "/audio/music/piano/C8v8.mp3",
};

/** A MIDI-preferred instrument (from Connect) the shared input router can listen to. */
export interface MidiInstrumentOption {
  instrument: InstrumentId;
  channel?: number;
  label: string;
}

export interface PracticeMeter {
  numerator: number;
  denominator: 2 | 4 | 8 | 16;
}

/**
 * Context registered by the active route so shared controls stay synchronized.
 * Only the current owner may update or clear.
 */
export interface PracticeContext {
  owner: string;
  variantKey: string;
  defaultBpm: number;
  initialUrlBpm?: number;
  meter?: PracticeMeter;
  allowedInstruments?: InstrumentId[];
  pinnedInstrument?: InstrumentId;
  onBpmChange?: (bpm: number) => void;
  onInstrumentChange?: (instrument: InstrumentId) => void;
  shouldPlayMetronome?: (event: TransportEvent) => boolean;
}

export interface MusicRuntimeOptions {
  createTransport?: (options: TransportEngineOptions) => Promise<TransportEngine>;
  monotonicNowMs?: () => MonotonicMs;
}

/** Local-state id: the user enabled MIDI in this browser at least once. */
export const MIDI_WANTED_KEY = "music.midi.wanted";

/** The last hardware note-on and what became of it, for the drills' status line. */
export interface MidiTrace {
  deviceName: string;
  /** The note the device sent. */
  note: number;
  /** The note the drill saw after the pad map. */
  canonical: number;
  instrument?: InstrumentId;
  accepted: boolean;
  reason?: string;
}

/**
 * The browser's MIDI permission, or "unknown" where the Permissions API has no
 * "midi" entry (Safari, Firefox). "prompt" is treated like unknown by the
 * caller: an enable then shows the browser's own dialog, never a silent grant.
 */
export async function midiPermissionState(
  permissions: Pick<Permissions, "query"> | undefined = globalThis.navigator?.permissions,
): Promise<"granted" | "denied" | "prompt" | "unknown"> {
  try {
    const status = await permissions?.query({ name: "midi" as PermissionName });
    return status?.state ?? "unknown";
  } catch {
    return "unknown";
  }
}

export type PracticePhase = "idle" | "count-in" | "running";

export type BeginPerformanceResult =
  | { status: "started"; downbeat: MonotonicMs }
  | { status: "cancelled" }
  | { status: "failed"; message: string };

export interface BeginPerformanceOptions {
  countInBars?: number;
  leadIn?: { bars: number; onStart: (event: TransportEvent) => void };
}

interface PendingPerformance {
  options: BeginPerformanceOptions;
  generation: number;
  owner: string | undefined;
  promise: Promise<BeginPerformanceResult>;
  resolve: (result: BeginPerformanceResult) => void;
  unsubscribe?: () => void;
  settled: boolean;
}

/**
 * A completed practice activity to drop into the journal. Routes call
 * `recordPractice` when an exercise/session finishes so it shows up under
 * `/music/track` automatically (and is editable there).
 */
export interface PracticeCaptureEntry {
  comparison?: RunComparisonSetup;
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
  /** The captured run supplies summary comparisons, including routine steps. */
  lastPracticeCapture = $state<PracticeCaptureEntry | undefined>();
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
  /**
   * Focus mode: true while a drill run is active (set via DrillFocusScope).
   * The music layout hides the nav/topbar and site chrome so the stage owns
   * the screen; the transport stays (drills use it mid-run).
   */
  drillFocus = $state(false);

  /** Shared metronome state driving the floating practice controls. */
  transportBpm = $state(96);
  metronomeRunning = $state(false);
  activeBeat = $state(-1);
  masterMuted = $state(false);
  masterLevel = $state(1);
  playbackLevel = $state(0.8);
  metronomeLevel = $state(0.7);
  preferredPlaybackSound = $state<PlaybackSoundId>("salamander-piano");
  effectivePlaybackSound = $state<PlaybackSoundId>("warm-synth");
  playbackFallback = $state<string | undefined>();
  playbackVoicePending = $state(false);
  instrument = $state(PLAYBACK_SOUND_LABELS["salamander-piano"]);
  readonly instruments = PLAYBACK_SOUND_IDS.map((sound) => PLAYBACK_SOUND_LABELS[sound]);

  /** Practice-context state owned by the active route. */
  countInBars = $state(1);
  practiceBpm = $state(96);
  metronomeEnabled = $state(true);
  practicePhase = $state<PracticePhase>("idle");
  performancePending = $state(false);
  settingsReady = $state(false);
  #practiceContext: PracticeContext | undefined;
  #settingsStore: MusicSettingsStore | undefined;
  #contextGen = 0;
  #contextRequestGen = 0;
  #contextOwner: string | undefined;
  settingsError = $state<string | undefined>();

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
  routineBudgetMinutes = $state(20);
  #settings: DeviceProfileRepository | undefined;
  #journal: PracticeSessionStore | undefined;
  #dailyRoutineSession: DailyRoutineSession | undefined;
  #captureSeq = 0;

  #transport?: TransportEngine;
  #transportFlight?: Promise<TransportEngine | undefined>;
  #transportGeneration = 0;
  #disposed = false;
  #unsubscribeTransport?: () => void;
  #enablePromise?: Promise<boolean>;
  #playbackVoiceFlight?: { sound: PlaybackSoundId; promise: Promise<boolean> };
  #performanceGeneration = 0;
  #performanceFlight?: Promise<BeginPerformanceResult>;
  #pendingPerformance?: PendingPerformance;
  #leadInBeats = 0;
  #practiceNavigationActivation = 0;
  #pendingPracticeNavigation?: { bpm: number | undefined };
  /** Connect's saved profile per MIDI device id: instrument, alias, pad map. */
  #profilesByDevice = new Map<string, DeviceProfile>();
  /** What the last hardware MIDI note became, for the drills' status line. */
  lastMidi = $state<MidiTrace | undefined>();
  /** Mirror of the engine's enabled flag plus the devices actually listened to. */
  midiEnabled = $state(false);
  midiListening = $state<{ devices: string[]; removed: number }>({ devices: [], removed: 0 });
  /** MIDI was enabled in this browser before (so a fresh load re-opens it). */
  midiEverEnabled = $state(false);
  #midiInputs: MidiDeviceSummary[] = [];
  /**
   * The MPC output the app keeps in Controller Mode. The MPC One+ sends pad
   * notes only while a host talks to it (MPC 3 does: init once, heartbeat every
   * second), so the link lives here, for the whole app, not on one page.
   */
  mpcLink = $state<{ outputName: string } | undefined>();
  #controllerHeartbeats = new Map<string, ReturnType<typeof setInterval>>();

  #syncControllerLinks(): void {
    const { enabled, sysexEnabled, outputs } = this.midi.state;
    const wanted = new Map<string, MidiDeviceSummary>();
    if (enabled && sysexEnabled && !this.#disposed) {
      for (const output of outputs) {
        if (this.#profilesByDevice.get(output.id)?.controllerLink) wanted.set(output.id, output);
      }
    }
    for (const [id, timer] of this.#controllerHeartbeats) {
      if (wanted.has(id)) continue;
      clearInterval(timer);
      this.#controllerHeartbeats.delete(id);
    }
    for (const [id] of wanted) {
      if (this.#controllerHeartbeats.has(id)) continue;
      for (const frame of mpcControllerInitSysex()) this.midi.send(id, frame);
      this.#controllerHeartbeats.set(
        id,
        setInterval(() => this.midi.send(id, mpcHeartbeatSysex()), 1_000),
      );
    }
    const first = wanted.values().next().value;
    this.mpcLink = first
      ? { outputName: this.#profilesByDevice.get(first.id)?.alias || first.name }
      : undefined;
  }
  #unsubscribeMidi = this.midi.subscribe((incoming) => {
    // Connect's choices are applied once, here, so every exercise, grid and
    // diagnostic downstream sees the same event: the port's assigned instrument
    // wins over name detection, and hardware pads become canonical bank-A notes.
    const profile = incoming.deviceId ? this.#profilesByDevice.get(incoming.deviceId) : undefined;
    const event = applyDeviceProfile(incoming, profile);
    const accepted = this.router.push(event);
    if (event.type === "noteOn") {
      const device = this.#midiInputs.find((input) => input.id === event.deviceId);
      this.lastMidi = {
        deviceName: profile?.alias || device?.name || event.deviceId || "MIDI",
        note: incoming.type === "noteOn" ? incoming.midiNote : event.midiNote,
        canonical: event.midiNote,
        instrument: event.instrument,
        accepted,
        reason: accepted ? undefined : this.#midiRejectReason(event),
      };
    }
  });

  #midiRejectReason(event: NoteEvent): string {
    if (
      event.instrument !== undefined &&
      this.activeInstrument !== undefined &&
      event.instrument !== this.activeInstrument
    ) {
      return `port is assigned to ${INSTRUMENT_LABELS[event.instrument]}, this drill listens to ${INSTRUMENT_LABELS[this.activeInstrument]}`;
    }
    if (
      this.activeChannel !== undefined &&
      "channel" in event &&
      event.channel !== undefined &&
      event.channel !== this.activeChannel
    ) {
      return `channel ${event.channel}, the drill listens to channel ${this.activeChannel}`;
    }
    return "not accepted by the input router";
  }

  #refreshMidiListening(): void {
    const devices = this.#midiInputs
      .filter((input) => !this.midi.isInputIgnored(input.id))
      .map((input) => this.#profilesByDevice.get(input.id)?.alias || input.name);
    const removed = this.#midiInputs.length - devices.length;
    this.midiListening = { devices, removed };
  }
  #unsubscribeRouterState = this.router.subscribeState((state) => {
    this.activeSource = state.activeSource;
    this.inputConfidence = state.confidence;
  });
  /**
   * Once MIDI has been enabled in this browser, remember it so a fresh page
   * load (a reload, a bookmarked drill, the dev server recovering) brings the
   * devices back without a trip to Connect. The browser's own permission
   * still decides: we only re-enable when it is already granted.
   */
  #midiWantedRemembered = false;
  #unsubscribeMidiState = this.midi.subscribeState((state) => {
    this.midiEnabled = state.enabled;
    this.#midiInputs = state.inputs;
    this.#refreshMidiListening();
    this.#syncControllerLinks();
    if (!state.enabled || this.#midiWantedRemembered) return;
    this.#midiWantedRemembered = true;
    this.midiEverEnabled = true;
    void this.writeLocalState(MIDI_WANTED_KEY, true).catch(() => undefined);
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
    const ctx = this.#practiceContext;
    if (ctx?.pinnedInstrument) {
      this.activeInstrument = ctx.pinnedInstrument;
      this.router.setActiveInstrument(ctx.pinnedInstrument);
      return;
    }
    if (ctx?.allowedInstruments && !ctx.allowedInstruments.includes(instrument)) {
      instrument = ctx.allowedInstruments[0] ?? instrument;
    }
    this.activeInstrument = instrument;
    this.router.setActiveInstrument(instrument);
    ctx?.onInstrumentChange?.(instrument);
    this.#persistSettings({ activeInstrument: instrument });
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
    this.#settingsStore = new MusicSettingsStore(settings);
    let loaded: MusicSettings;
    try {
      loaded = await this.#settingsStore.load();
    } catch (error) {
      if (!this.#settingsStore.loaded) throw error;
      loaded = this.#settingsStore.get();
      this.settingsError = error instanceof Error ? error.message : "Settings persist failed";
    }
    this.#applyAudioSettings(loaded);
    this.metronomeEnabled = loaded.metronomeEnabled;
    this.countInBars = loaded.countInBars;
    this.activeInstrument = loaded.activeInstrument;
    // A route can register before storage finishes loading. Apply its constraint
    // without persisting a fixed drill's instrument over the user's preference.
    if (this.#practiceContext) {
      this.activeInstrument = this.#reconcileInstrument(this.#practiceContext);
    }
    this.router.setActiveInstrument(this.activeInstrument);
    this.settingsReady = true;
    await this.reloadMidiInstruments();
    void this.#autoEnableMidi();
  }

  /** Re-open MIDI on startup when the user enabled it before and the browser still allows it. */
  async #autoEnableMidi(): Promise<void> {
    if (this.midi.state.enabled || !this.midi.state.supported) return;
    if ((await this.readLocalState<boolean>(MIDI_WANTED_KEY)) !== true) return;
    this.midiEverEnabled = true;
    if ((await midiPermissionState()) === "denied") return;
    if (this.#disposed || this.midi.state.enabled) return;
    await this.midi.enable();
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
    entry = {
      ...entry,
      startedAt,
      endedAt,
      tags: [
        ...(entry.tags ?? []),
        ...(entry.comparison ? runComparisonTags(entry.comparison, entry.scoringEvents ?? []) : []),
      ],
    };
    this.lastPracticeCapture = entry;
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
      options.push({
        instrument: id,
        channel: profile?.channel,
        label: INSTRUMENT_LABELS[id],
      });
    }
    this.midiInstruments = options;
    this.inputSurfaces = state.surfaces;
    this.midi.setIgnoredInputs(
      state.profiles.filter((profile) => profile.ignored).map((profile) => profile.id),
    );
    this.#profilesByDevice = new Map(state.profiles.map((profile) => [profile.id, profile]));
    this.#refreshMidiListening();
    this.#syncControllerLinks();
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
    this.countInBars = bars >= 2 ? 2 : bars >= 1 ? 1 : 0;
    this.#transport?.setCountInBars(this.countInBars);
    this.#persistSettings({ countInBars: this.countInBars as 0 | 1 | 2 });
  }

  toggleMute(): void {
    this.masterMuted = !this.masterMuted;
    this.sound.setMasterMuted(this.masterMuted);
    this.#persistSettings({ muted: this.masterMuted });
  }

  setMetronomeLevel(level: number): void {
    this.metronomeLevel = Math.min(1, Math.max(0, level));
    this.sound.setMetronomeLevel(this.metronomeLevel);
    this.#persistSettings({ metronomeLevel: this.metronomeLevel });
  }

  setInstrument(name: string): void {
    const sound = PLAYBACK_SOUND_IDS.find((id) => PLAYBACK_SOUND_LABELS[id] === name);
    if (!sound) return;
    this.instrument = name;
    if (this.#settingsStore) {
      void this.updateMusicSettings({ preferredPlaybackSound: sound }).catch((error: unknown) => {
        this.settingsError = error instanceof Error ? error.message : "Settings persist failed";
      });
      return;
    }
    this.preferredPlaybackSound = sound;
    if (sound !== "salamander-piano") {
      this.sound.setPlaybackSound(sound);
      this.effectivePlaybackSound = sound;
      this.playbackFallback = undefined;
    } else if (this.audioEnabled) {
      void this.ensurePlaybackVoice();
    }
  }

  get mediaVolume(): number {
    return this.masterMuted ? 0 : this.playbackLevel * this.masterLevel;
  }

  /** Unlock audio and activate the persisted playback voice, falling back safely. */
  ensurePlaybackVoice(): Promise<boolean> {
    const preferred = this.preferredPlaybackSound;
    if (this.#playbackVoiceFlight?.sound === preferred) return this.#playbackVoiceFlight.promise;
    this.playbackVoicePending = true;
    const promise = this.#ensurePlaybackVoice(preferred).finally(() => {
      if (this.#playbackVoiceFlight?.promise === promise) {
        this.#playbackVoiceFlight = undefined;
        this.playbackVoicePending = false;
      }
    });
    this.#playbackVoiceFlight = { sound: preferred, promise };
    return promise;
  }

  async testAudio(): Promise<boolean> {
    if (!(await this.ensurePlaybackVoice())) return false;
    this.sound.playChord([60, 64, 67], 0.5);
    return true;
  }

  async toggleMetronome(): Promise<void> {
    if (this.practicePhase === "idle") {
      if (this.metronomeRunning) {
        this.metronomeEnabled = false;
        this.#persistSettings({ metronomeEnabled: false });
        this.#stopTransport();
        return;
      }
      if (!this.metronomeEnabled) {
        this.metronomeEnabled = true;
        this.#persistSettings({ metronomeEnabled: true });
      }
    } else {
      this.metronomeEnabled = !this.metronomeEnabled;
      this.#persistSettings({ metronomeEnabled: this.metronomeEnabled });
    }

    if (this.practicePhase === "count-in") return;
    if (this.practicePhase === "running" && !this.metronomeEnabled) return;

    if (!this.metronomeEnabled) {
      this.#stopTransport();
      return;
    }

    if (!(await this.enableAudio())) return;
    const transport = await this.#ensureTransport();
    if (!transport) return;
    if (!this.metronomeEnabled || this.practicePhase === "count-in") return;
    if (transport.state.running) return;
    this.#configureTransport(transport, 0);
    transport.start();
    this.metronomeRunning = true;
  }

  beginPerformance(options: BeginPerformanceOptions = {}): Promise<BeginPerformanceResult> {
    if (
      [options.countInBars ?? this.countInBars, options.leadIn?.bars ?? 0].some(
        (bars) => !Number.isInteger(bars) || bars < 0,
      )
    ) {
      return Promise.resolve({
        status: "failed",
        message: "Preparation bars must be nonnegative integers.",
      });
    }
    if (this.#performanceFlight) return this.#performanceFlight;
    if (this.practicePhase !== "idle") return Promise.resolve({ status: "cancelled" });

    let resolve!: (result: BeginPerformanceResult) => void;
    const promise = new Promise<BeginPerformanceResult>((settle) => {
      resolve = settle;
    });
    const pending: PendingPerformance = {
      options: {
        countInBars: options.countInBars ?? this.countInBars,
        ...(options.leadIn ? { leadIn: { ...options.leadIn } } : {}),
      },
      generation: this.#performanceGeneration,
      owner: this.#contextOwner,
      promise,
      resolve,
      settled: false,
    };
    this.#pendingPerformance = pending;
    this.#performanceFlight = promise;
    this.performancePending = true;
    void this.#beginPerformance(pending);
    return promise;
  }

  endPerformance(): void {
    this.#performanceGeneration += 1;
    const pending = this.#pendingPerformance;
    pending?.unsubscribe?.();
    if (pending) pending.unsubscribe = undefined;
    if (pending) this.#settlePerformance(pending, { status: "cancelled" });
    this.performancePending = false;
    this.#stopTransport();
    this.practicePhase = "idle";
  }

  /**
   * Register the active route's practice context. Returns an idempotent cleanup
   * function. Only the current owner may update or clear.
   */
  async registerPracticeContext(context: PracticeContext): Promise<() => void> {
    const requestGen = ++this.#contextRequestGen;
    await this.#settingsStore?.ready;
    if (requestGen !== this.#contextRequestGen) return () => {};
    this.endPerformance();
    const isActivation = this.#contextOwner !== context.owner;
    this.#contextOwner = context.owner;
    const myGen = ++this.#contextGen;
    this.#practiceContext = context;
    const reconciled = this.#reconcileInstrument(context);
    if (reconciled !== this.activeInstrument) {
      if (context.pinnedInstrument) {
        this.activeInstrument = reconciled;
        this.router.setActiveInstrument(reconciled);
      } else {
        this.setActiveInstrument(reconciled);
      }
    }
    const pendingNavigation = this.#pendingPracticeNavigation;
    this.#pendingPracticeNavigation = undefined;
    const bpm = this.resolvePracticeBpm(
      pendingNavigation ? pendingNavigation.bpm : isActivation ? context.initialUrlBpm : undefined,
      context.variantKey,
      context.defaultBpm,
    );
    this.practiceBpm = bpm;
    this.setTransportBpm(bpm);
    context.onBpmChange?.(bpm);
    return () => {
      if (this.#contextGen !== myGen) return;
      this.endPerformance();
      this.#practiceContext = undefined;
      this.#contextOwner = undefined;
      if (this.#settingsStore?.loaded) {
        const restored = this.#settingsStore.get().activeInstrument;
        if (restored !== this.activeInstrument) {
          this.activeInstrument = restored;
          this.router.setActiveInstrument(restored);
        }
      }
    };
  }

  /**
   * Resolve the practice BPM using URL precedence, then persisted variant,
   * then pedagogical default.
   */
  resolvePracticeBpm(urlBpm: number | undefined, variantKey: string, defaultBpm: number): number {
    if (urlBpm !== undefined && Number.isFinite(urlBpm) && urlBpm > 0) {
      const clamped = Math.round(Math.max(20, Math.min(300, urlBpm)));
      const map = this.#settingsStore?.get().tempoByVariant ?? {};
      const nextMap = updateTempoByVariant(map, variantKey, clamped);
      this.#persistSettings({ tempoByVariant: nextMap }, "Tempo persist failed");
      return clamped;
    }
    const map = this.#settingsStore?.get().tempoByVariant ?? {};
    const stored = lookupTempoByVariant(map, variantKey);
    if (stored !== undefined) return stored;
    return defaultBpm;
  }

  /**
   * Store a BPM for the given variant key and notify the active context's
   * onBpmChange callback.
   */
  setPracticeVariantBpm(bpm: number, variantKey: string): void {
    const clamped = Math.round(Math.max(20, Math.min(300, bpm)));
    const map = this.#settingsStore?.get().tempoByVariant ?? {};
    const nextMap = updateTempoByVariant(map, variantKey, clamped);
    this.#persistSettings({ tempoByVariant: nextMap }, "Tempo persist failed");
    this.practiceBpm = clamped;
    this.setTransportBpm(clamped);
    this.#practiceContext?.onBpmChange?.(clamped);
  }

  /** Update the active exact variant, or the standalone metronome when browsing. */
  setPracticeBpm(bpm: number): void {
    this.setPracticeVariantBpm(bpm, this.#practiceContext?.variantKey ?? "v1:metronome");
  }

  /** Apply a BPM from one external same-component navigation or history entry. */
  activatePracticeNavigation(activation: number, bpm: number | undefined): void {
    if (activation <= this.#practiceNavigationActivation) return;
    this.#practiceNavigationActivation = activation;
    if (!this.#practiceContext) {
      this.#pendingPracticeNavigation = { bpm };
      return;
    }
    if (bpm === undefined || !Number.isFinite(bpm) || bpm <= 0) return;
    const clamped = Math.round(Math.max(20, Math.min(300, bpm)));
    if (this.practiceBpm === clamped) return;
    this.setPracticeVariantBpm(bpm, this.#practiceContext.variantKey);
  }

  get practiceInstrumentPinned(): boolean {
    return this.#practiceContext?.pinnedInstrument !== undefined;
  }

  get practiceInstrumentOptions(): InstrumentId[] {
    const context = this.#practiceContext;
    if (context?.pinnedInstrument) return [context.pinnedInstrument];
    return context?.allowedInstruments ?? (Object.keys(INSTRUMENT_LABELS) as InstrumentId[]);
  }

  get practiceMeter(): PracticeMeter {
    return this.#practiceContext?.meter ?? { numerator: 4, denominator: 4 };
  }

  /** Read current settings from the runtime-owned store. */
  getMusicSettings(): MusicSettings | undefined {
    return this.#settingsStore?.get();
  }

  /** Write a settings patch through the runtime-owned store. */
  async updateMusicSettings(patch: Partial<MusicSettings>): Promise<void> {
    if (!this.#settingsStore) return;
    const persistence = this.#settingsStore.update(patch);
    const next = this.#settingsStore.get();
    this.#applyAudioSettings(next);
    if (patch.metronomeEnabled !== undefined) this.metronomeEnabled = next.metronomeEnabled;
    if (patch.countInBars !== undefined) this.countInBars = next.countInBars;
    if (patch.activeInstrument !== undefined) {
      this.activeInstrument = next.activeInstrument;
      this.router.setActiveInstrument(next.activeInstrument);
    }
    const playbackVoice =
      patch.preferredPlaybackSound !== undefined && this.audioEnabled
        ? this.ensurePlaybackVoice()
        : undefined;
    let persistenceError: unknown;
    try {
      await persistence;
      this.settingsError = undefined;
    } catch (error) {
      persistenceError = error;
      this.settingsError = error instanceof Error ? error.message : "Settings persist failed";
    }
    await playbackVoice;
    if (persistenceError !== undefined) throw persistenceError;
  }

  #applyAudioSettings(settings: MusicSettings): void {
    const preferredChanged = settings.preferredPlaybackSound !== this.preferredPlaybackSound;
    this.preferredPlaybackSound = settings.preferredPlaybackSound;
    this.instrument = PLAYBACK_SOUND_LABELS[settings.preferredPlaybackSound];
    this.playbackLevel = settings.playbackLevel;
    this.metronomeLevel = settings.metronomeLevel;
    this.masterLevel = settings.masterLevel;
    this.masterMuted = settings.muted;
    this.sound.setPlaybackLevel(this.playbackLevel);
    this.sound.setMetronomeLevel(this.metronomeLevel);
    this.sound.setMasterVolume(this.masterLevel);
    this.sound.setMasterMuted(this.masterMuted);
    if (settings.preferredPlaybackSound !== "salamander-piano") {
      if (preferredChanged || this.sound.playbackSound !== settings.preferredPlaybackSound) {
        this.sound.setPlaybackSound(settings.preferredPlaybackSound);
      }
      this.effectivePlaybackSound = settings.preferredPlaybackSound;
      this.playbackFallback = undefined;
    } else if (preferredChanged && this.effectivePlaybackSound !== "salamander-piano") {
      this.sound.setPlaybackSound("warm-synth");
      this.effectivePlaybackSound = "warm-synth";
    }
  }

  #persistSettings(patch: Partial<MusicSettings>, fallback = "Settings persist failed"): void {
    const store = this.#settingsStore;
    if (!store) return;
    void store
      .update(patch)
      .then(() => {
        this.settingsError = undefined;
      })
      .catch((error: unknown) => {
        this.settingsError = error instanceof Error ? error.message : fallback;
      });
  }

  async #ensurePlaybackVoice(preferred: PlaybackSoundId): Promise<boolean> {
    if (!(await this.enableAudio())) return false;
    if (preferred !== this.preferredPlaybackSound) return true;
    if (preferred !== "salamander-piano") {
      if (this.sound.playbackSound !== preferred) this.sound.setPlaybackSound(preferred);
      this.instrument = PLAYBACK_SOUND_LABELS[preferred];
      this.effectivePlaybackSound = preferred;
      this.playbackFallback = undefined;
      return true;
    }
    if (this.effectivePlaybackSound === "salamander-piano") return true;
    try {
      const activated = await this.sound.loadSampler(SALAMANDER_PIANO_SAMPLES);
      if (activated && preferred === this.preferredPlaybackSound) {
        this.effectivePlaybackSound = "salamander-piano";
        this.instrument = PLAYBACK_SOUND_LABELS["salamander-piano"];
        this.playbackFallback = undefined;
      }
    } catch {
      if (preferred === this.preferredPlaybackSound) {
        this.sound.setPlaybackSound("warm-synth");
        this.effectivePlaybackSound = "warm-synth";
        this.instrument = PLAYBACK_SOUND_LABELS["warm-synth"];
        this.playbackFallback = "Sampled Piano could not load. Using Warm Synth for this session.";
      }
    }
    return true;
  }

  /** Ensure the active instrument respects pinned/allowed context. */
  #reconcileInstrument(ctx: PracticeContext): InstrumentId {
    if (ctx.pinnedInstrument) return ctx.pinnedInstrument;
    const current = this.activeInstrument;
    if (ctx.allowedInstruments) {
      if (ctx.allowedInstruments.includes(current)) return current;
      return ctx.allowedInstruments[0] ?? current;
    }
    return current;
  }

  async #beginPerformance(pending: PendingPerformance): Promise<void> {
    try {
      if (!(await this.enableAudio())) {
        if (this.#isCurrentPerformance(pending)) {
          this.practicePhase = "idle";
          this.#settlePerformance(pending, { status: "failed", message: this.audioMessage });
        }
        return;
      }
      if (!this.#isCurrentPerformance(pending)) return;

      const transport = await this.#ensureTransport();
      if (!transport || !this.#isCurrentPerformance(pending)) return;

      if (transport.state.running) transport.stop();
      this.metronomeRunning = false;
      const preparationBars =
        (pending.options.countInBars ?? 0) + (pending.options.leadIn?.bars ?? 0);
      this.#leadInBeats =
        (pending.options.leadIn?.bars ?? 0) * (this.#practiceContext?.meter?.numerator ?? 4);
      this.#configureTransport(transport, preparationBars);

      if (preparationBars === 0 && !this.metronomeEnabled) {
        this.practicePhase = "running";
        this.#settlePerformance(pending, {
          status: "started",
          downbeat: this.#monotonicNowMs(),
        });
        return;
      }

      let leadInStarted = false;
      pending.unsubscribe = transport.subscribe((event) => {
        if (!this.#isCurrentPerformance(pending)) return;
        if (
          event.kind === "beat" &&
          event.absoluteBeat === 0 &&
          !leadInStarted &&
          this.#leadInBeats > 0
        ) {
          leadInStarted = true;
          try {
            pending.options.leadIn?.onStart(event);
          } catch (error) {
            this.#settlePerformance(pending, {
              status: "failed",
              message: error instanceof Error ? error.message : "Reference playback failed.",
            });
            this.#stopTransport();
            this.practicePhase = "idle";
          }
        }
        if (!this.#isCurrentPerformance(pending)) return;
        if (event.kind !== "beat" || event.countingIn || event.beat !== 0) return;
        if (!this.#isCurrentPerformance(pending)) return;

        pending.unsubscribe?.();
        pending.unsubscribe = undefined;
        this.practicePhase = "running";
        this.#settlePerformance(pending, {
          status: "started",
          downbeat: event.atMonotonicMs,
        });
        if (!this.metronomeEnabled) this.#stopTransport();
      });
      this.practicePhase = preparationBars > 0 ? "count-in" : "running";
      transport.start();
      this.metronomeRunning = true;
    } catch (error) {
      if (!this.#isCurrentPerformance(pending)) return;
      this.practicePhase = "idle";
      this.#settlePerformance(pending, {
        status: "failed",
        message: error instanceof Error ? error.message : "Practice clock could not start.",
      });
      this.#stopTransport();
    }
  }

  #isCurrentPerformance(pending: PendingPerformance): boolean {
    return (
      !pending.settled &&
      pending.generation === this.#performanceGeneration &&
      pending.owner === this.#contextOwner
    );
  }

  #settlePerformance(pending: PendingPerformance, result: BeginPerformanceResult): void {
    if (pending.settled) return;
    pending.unsubscribe?.();
    pending.unsubscribe = undefined;
    pending.settled = true;
    if (this.#pendingPerformance === pending) {
      this.#pendingPerformance = undefined;
      this.performancePending = false;
    }
    if (this.#performanceFlight === pending.promise) this.#performanceFlight = undefined;
    pending.resolve(result);
  }

  #configureTransport(transport: TransportEngine, countInBars = this.countInBars): void {
    const meter = this.#practiceContext?.meter ?? { numerator: 4, denominator: 4 as const };
    transport.setTimeSignature(meter.numerator, meter.denominator);
    transport.setQuantizationGrid(`${meter.denominator}n` as QuantizationGrid);
    transport.setBpm(this.transportBpm);
    transport.setCountInBars(countInBars);
  }

  #stopTransport(): void {
    this.#leadInBeats = 0;
    this.sound.stopMetronomeClicks();
    if (this.#transport?.state.running) this.#transport.stop();
    this.metronomeRunning = false;
    this.activeBeat = -1;
  }

  async #ensureTransport(): Promise<TransportEngine | undefined> {
    if (this.#transport) return this.#transport;
    if (this.#disposed) return Promise.resolve(undefined);
    if (this.#transportFlight) return this.#transportFlight;

    const generation = this.#transportGeneration;
    const flight = this.#createTransport({
      bpm: this.transportBpm,
      countInBars: this.countInBars,
      onMetronomeClick: (event: TransportEvent) => {
        if (this.#leadInBeats > 0 && event.absoluteBeat < this.#leadInBeats) return;
        if (
          event.countingIn ||
          (this.metronomeEnabled && (this.#practiceContext?.shouldPlayMetronome?.(event) ?? true))
        ) {
          this.sound.playMetronomeClick(event.atSeconds, event.accented);
        }
      },
    }).then((transport) => {
      if (this.#disposed || generation !== this.#transportGeneration) {
        transport.stop();
        return undefined;
      }
      this.#transport = transport;
      this.#unsubscribeTransport = transport.subscribe((event) => {
        if (event.kind === "beat") this.activeBeat = event.beat;
      });
      return transport;
    });
    this.#transportFlight = flight;
    const clear = () => {
      if (this.#transportFlight === flight) this.#transportFlight = undefined;
    };
    void flight.then(clear, clear);
    return flight;
  }

  dispose(): void {
    this.#disposed = true;
    this.#transportGeneration += 1;
    this.endPerformance();
    this.#unsubscribeMidi();
    this.#unsubscribeMidiState();
    this.#unsubscribeRouterState();
    this.#unsubscribeTransport?.();
    for (const timer of this.#controllerHeartbeats.values()) clearInterval(timer);
    this.#controllerHeartbeats.clear();
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

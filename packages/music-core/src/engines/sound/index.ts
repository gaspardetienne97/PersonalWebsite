import type { MonotonicMs, Score } from "@repo/music-core/domain";
import { monotonicMs } from "@repo/music-core/domain";
import type { PlaybackSoundId } from "@repo/music-core/engines/settings";
import { midiToNote } from "@repo/music-core/engines/theory";

type ToneTime = number | string;

interface ToneInstrument {
  triggerAttackRelease(
    notes: string | string[] | number,
    duration: ToneTime,
    time?: ToneTime,
    velocity?: number,
  ): unknown;
  /** Sustain notes until release — used for the intonation drone. */
  triggerAttack(notes: string | string[] | number, time?: ToneTime, velocity?: number): unknown;
  triggerRelease(notes?: string | string[] | number, time?: ToneTime): unknown;
  releaseAll?(time?: ToneTime): unknown;
  toDestination(): ToneInstrument;
  connect(destination: unknown): ToneInstrument;
  dispose(): unknown;
}

interface ToneGain {
  gain: { value: number };
  toDestination(): ToneGain;
  connect(destination: unknown): ToneGain;
  dispose(): unknown;
}

interface TonePlayer {
  volume: { value: number };
  start(time?: ToneTime): unknown;
  stop(time?: ToneTime): unknown;
}

interface TonePlayers {
  player(name: string): TonePlayer;
  toDestination(): TonePlayers;
  connect(destination: unknown): TonePlayers;
  dispose(): unknown;
}

type ToneConstructor<T> = new (...args: unknown[]) => T;

export interface ToneSoundModule {
  start(): Promise<void>;
  loaded(): Promise<void>;
  /** Scheduling time: raw audio clock plus Tone's look-ahead. */
  now(): number;
  /** Raw audio-context time, with no look-ahead added. */
  immediate(): number;
  gainToDb(gain: number): number;
  Synth: ToneConstructor<ToneInstrument>;
  PolySynth: ToneConstructor<ToneInstrument>;
  Sampler: ToneConstructor<ToneInstrument>;
  Players: ToneConstructor<TonePlayers>;
  Gain: ToneConstructor<ToneGain>;
}

export interface AudioGateState {
  enabled: boolean;
  message: string;
}

export interface DrumPadSample {
  padId: string;
  midiNote: number;
  url: string;
}

export interface DrumPatternStep {
  padIds: string[];
  offsetSeconds: number;
}

export interface SoundPatternStep {
  midiNotes: number[];
  offsetSeconds: number;
  durationSeconds: number;
}

export interface CountInSchedule {
  startAudioSeconds: number;
  delayMs: number;
}

type ToneLoader = () => Promise<ToneSoundModule>;

const loadTone: ToneLoader = async () => (await import("tone")) as unknown as ToneSoundModule;

/** Selectable playback timbres — built from oscillator + envelope (no samples). */
export const SOUND_PRESETS: Record<string, Record<string, unknown>> = {
  "Warm Synth": {
    oscillator: { type: "triangle" },
    envelope: { attack: 0.03, decay: 0.25, sustain: 0.35, release: 1.4 },
  },
  Synth: {
    oscillator: { type: "triangle" },
    envelope: { attack: 0.005, decay: 0.1, sustain: 0.3, release: 0.8 },
  },
  "E-Piano": {
    oscillator: { type: "sine" },
    envelope: { attack: 0.002, decay: 0.3, sustain: 0.12, release: 1.3 },
  },
  Square: {
    oscillator: { type: "square" },
    envelope: { attack: 0.005, decay: 0.1, sustain: 0.25, release: 0.5 },
  },
  Saw: {
    oscillator: { type: "sawtooth" },
    envelope: { attack: 0.01, decay: 0.15, sustain: 0.3, release: 0.6 },
  },
};

export const SOUND_PRESET_NAMES: string[] = Object.keys(SOUND_PRESETS);

type SynthPlaybackSoundId = Exclude<PlaybackSoundId, "salamander-piano">;

const SOUND_ID_TO_PRESET: Record<SynthPlaybackSoundId, string> = {
  "warm-synth": "Warm Synth",
  synth: "Synth",
  "e-piano": "E-Piano",
  square: "Square",
  saw: "Saw",
};

const PRESET_TO_SOUND_ID = Object.fromEntries(
  Object.entries(SOUND_ID_TO_PRESET).map(([id, name]) => [name, id]),
) as Record<string, SynthPlaybackSoundId>;

/**
 * Sustained drone voices for the Intonation trainer. `intervals` are semitone
 * offsets stacked over the tonic — Sine/Cello hold the tonic alone, Shruti adds
 * the fifth and octave for a tanpura-like bed.
 */
export interface DroneTimbreSpec {
  preset: Record<string, unknown>;
  intervals: number[];
}

export const DRONE_TIMBRES: Record<string, DroneTimbreSpec> = {
  Sine: {
    preset: {
      oscillator: { type: "sine" },
      envelope: { attack: 0.4, decay: 0.1, sustain: 1, release: 1.2 },
    },
    intervals: [0],
  },
  Cello: {
    preset: {
      oscillator: { type: "fatsawtooth" },
      envelope: { attack: 0.3, decay: 0.2, sustain: 0.9, release: 1 },
    },
    intervals: [0],
  },
  Shruti: {
    preset: {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.5, decay: 0.2, sustain: 1, release: 1.4 },
    },
    intervals: [0, 7, 12],
  },
};

export const DRONE_TIMBRE_NAMES: string[] = Object.keys(DRONE_TIMBRES);

export interface ScorePattern {
  steps: SoundPatternStep[];
  durationSec: number;
}

/**
 * When a scheduled pattern's first beat lands, expressed on the same clock a
 * route reads with `performance.now()`. Routes compare it directly; they never
 * see audio time, and playback keeps its own schedule regardless.
 */
export interface PatternPlaybackEpoch {
  clock: "performance";
  startedAt: MonotonicMs;
}

/**
 * Project a Score's tempo-independent beats onto wall-clock seconds so the
 * transport's Play button can preview a melody via {@link SoundEngine.playPattern}.
 * One step per note (overlaps are fine); tempo comes from the score unless overridden.
 */
export function scoreToPattern(score: Score, options: { bpm?: number } = {}): ScorePattern {
  const bpm = options.bpm ?? score.tempoMap[0]?.bpm ?? 120;
  const secondsPerBeat = 60 / bpm;
  const steps: SoundPatternStep[] = score.notes.map((note) => ({
    midiNotes: [note.midiNote],
    offsetSeconds: note.startBeat * secondsPerBeat,
    durationSeconds: note.durationBeats * secondsPerBeat,
  }));
  const endBeat = score.notes.reduce(
    (latest, note) => Math.max(latest, note.startBeat + note.durationBeats),
    0,
  );
  return { steps, durationSec: endBeat * secondsPerBeat };
}

export class SoundEngine {
  #tone: ToneSoundModule | undefined;
  #synth: ToneInstrument | undefined;
  #patternVoice: ToneInstrument | undefined;
  #sampler: ToneInstrument | undefined;
  #players: TonePlayers | undefined;
  #metronome: ToneInstrument | undefined;
  #drone: ToneInstrument | undefined;
  #master: ToneGain | undefined;
  #playbackGain: ToneGain | undefined;
  #metronomeGain: ToneGain | undefined;
  #droneGain: ToneGain | undefined;
  #masterLevel = 1;
  #playbackLevel = 0.8;
  #metronomeLevel = 0.7;
  #droneLevel = 0.5;
  #droneTimbre = DRONE_TIMBRE_NAMES[0]!;
  #droneNote: number | undefined;
  #instrumentName = SOUND_ID_TO_PRESET["warm-synth"];
  #playbackSound: PlaybackSoundId = "warm-synth";
  #voiceGeneration = 0;
  #drumKitGeneration = 0;
  #patternVoiceDisposable = false;
  #patternLoopTimer: ReturnType<typeof setTimeout> | undefined;
  #drumPatternLoopTimer: ReturnType<typeof setTimeout> | undefined;
  #loadTone: ToneLoader;
  #enablePromise: Promise<AudioGateState> | undefined;
  #generation = 0;
  #disposed = false;
  enabled = false;
  muted = false;

  constructor(loader: ToneLoader = loadTone) {
    this.#loadTone = loader;
  }

  enable(): Promise<AudioGateState> {
    if (this.enabled) return Promise.resolve({ enabled: true, message: "Audio enabled." });
    if (this.#disposed) return Promise.resolve(this.#cancelledEnableState());
    if (this.#enablePromise) return this.#enablePromise;

    const pending = this.#enable(this.#generation);
    this.#enablePromise = pending;
    const clear = () => {
      if (this.#enablePromise === pending) this.#enablePromise = undefined;
    };
    void pending.then(clear, clear);
    return pending;
  }

  async #enable(generation: number): Promise<AudioGateState> {
    const tone = await this.#loadTone();
    if (this.#enableIsStale(generation)) return this.#cancelledEnableState();

    await tone.start();
    if (this.#enableIsStale(generation)) return this.#cancelledEnableState();

    let master: ToneGain | undefined;
    let playbackGain: ToneGain | undefined;
    let metronomeGain: ToneGain | undefined;
    let synth: ToneInstrument | undefined;
    let metronome: ToneInstrument | undefined;
    const cleanup = () => {
      metronome?.dispose();
      synth?.dispose();
      metronomeGain?.dispose();
      playbackGain?.dispose();
      master?.dispose();
    };

    try {
      master = new tone.Gain(this.muted ? 0 : this.#masterLevel).toDestination();
      if (this.#enableIsStale(generation)) {
        cleanup();
        return this.#cancelledEnableState();
      }
      playbackGain = new tone.Gain(this.#playbackLevel).connect(master);
      if (this.#enableIsStale(generation)) {
        cleanup();
        return this.#cancelledEnableState();
      }
      metronomeGain = new tone.Gain(this.#metronomeLevel).connect(master);
      if (this.#enableIsStale(generation)) {
        cleanup();
        return this.#cancelledEnableState();
      }
      synth = new tone.PolySynth(tone.Synth, SOUND_PRESETS[this.#instrumentName]).connect(
        playbackGain,
      );
      if (this.#enableIsStale(generation)) {
        cleanup();
        return this.#cancelledEnableState();
      }
      metronome = new tone.Synth({
        oscillator: { type: "triangle" },
        envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.02 },
      }).connect(metronomeGain);
      if (this.#enableIsStale(generation)) {
        cleanup();
        return this.#cancelledEnableState();
      }
    } catch (error) {
      cleanup();
      throw error;
    }

    this.#tone = tone;
    this.#master = master;
    this.#playbackGain = playbackGain;
    this.#metronomeGain = metronomeGain;
    this.#synth = synth;
    this.#metronome = metronome;
    this.enabled = true;
    return { enabled: true, message: "Audio enabled." };
  }

  #enableIsStale(generation: number): boolean {
    return this.#disposed || generation !== this.#generation;
  }

  #cancelledEnableState(): AudioGateState {
    return { enabled: false, message: "Audio enablement was cancelled." };
  }

  /** Master mute — toggles all audio output. */
  setMasterMuted(muted: boolean): void {
    this.muted = muted;
    if (this.#master) this.#master.gain.value = muted ? 0 : this.#masterLevel;
  }

  setMasterVolume(volume: number): void {
    this.#masterLevel = clampVelocity(volume);
    if (this.#master && !this.muted) this.#master.gain.value = this.#masterLevel;
  }

  setPlaybackLevel(level: number): void {
    this.#playbackLevel = clampVelocity(level);
    if (this.#playbackGain) this.#playbackGain.gain.value = this.#playbackLevel;
  }

  get playbackLevel(): number {
    return this.#playbackLevel;
  }

  /** Metronome blend — its own level, independent of playback. */
  setMetronomeLevel(level: number): void {
    this.#metronomeLevel = clampVelocity(level);
    if (this.#metronomeGain) this.#metronomeGain.gain.value = this.#metronomeLevel;
  }

  get metronomeLevel(): number {
    return this.#metronomeLevel;
  }

  get instrument(): string {
    return this.#instrumentName;
  }

  get playbackSound(): PlaybackSoundId {
    return this.#playbackSound;
  }

  /** Activate a synth voice and make any in-flight sampler load stale. */
  setPlaybackSound(sound: SynthPlaybackSoundId): void {
    const name = SOUND_ID_TO_PRESET[sound];
    this.#voiceGeneration += 1;
    this.stopPattern();
    this.#sampler?.dispose();
    this.#sampler = undefined;
    this.#playbackSound = sound;
    this.#instrumentName = name;
    if (this.#tone && this.#playbackGain) {
      this.#synth?.dispose();
      this.#synth = new this.#tone.PolySynth(this.#tone.Synth, SOUND_PRESETS[name]).connect(
        this.#playbackGain,
      );
    }
  }

  /** Choose the timbre the synth plays MIDI as. Rebuilds the voice live. */
  setInstrument(name: string): void {
    const sound = PRESET_TO_SOUND_ID[name];
    if (sound) this.setPlaybackSound(sound);
  }

  playNote(midiNote: number, duration: ToneTime = 0.18, time?: ToneTime, velocity = 0.8): void {
    if (!this.enabled) return;
    this.#instrument?.triggerAttackRelease(
      midiToNote(midiNote),
      duration,
      time,
      clampVelocity(velocity),
    );
  }

  playChord(midiNotes: number[], duration: ToneTime = 0.32, time?: ToneTime, velocity = 0.8): void {
    if (!this.enabled) return;
    this.#instrument?.triggerAttackRelease(
      midiNotes.map((note) => midiToNote(note)),
      duration,
      time,
      clampVelocity(velocity),
    );
  }

  /**
   * Schedule a pattern and report when its first beat lands on the performance
   * clock, or `undefined` when playback is unavailable. The three samples are
   * taken in the same call so the look-ahead `now()` adds to `immediate()` can
   * be projected onto the caller's clock without mixing units or epochs.
   */
  playPattern(steps: SoundPatternStep[], velocity = 0.8): PatternPlaybackEpoch | undefined {
    if (!this.enabled || !this.#tone || !this.#instrument) return undefined;
    this.stopPattern();
    const voice =
      this.#sampler ??
      new this.#tone.PolySynth(this.#tone.Synth, SOUND_PRESETS[this.#instrumentName]).connect(
        this.#playbackGain,
      );
    this.#patternVoice = voice;
    this.#patternVoiceDisposable = voice !== this.#sampler;
    const performanceSample = performance.now();
    const immediateAudio = this.#tone.immediate();
    const startAt = this.#tone.now();
    for (const step of steps) {
      voice.triggerAttackRelease(
        step.midiNotes.map((note) => midiToNote(note)),
        step.durationSeconds,
        startAt + step.offsetSeconds,
        clampVelocity(velocity),
      );
    }
    return {
      clock: "performance",
      startedAt: monotonicMs(performanceSample + (startAt - immediateAudio) * 1_000),
    };
  }

  stopPattern(): void {
    const voice = this.#patternVoice;
    voice?.releaseAll?.();
    if (this.#patternVoiceDisposable) voice?.dispose();
    this.#patternVoice = undefined;
    this.#patternVoiceDisposable = false;
  }

  startPatternLoop(steps: SoundPatternStep[], durationSec: number, velocity = 0.8): void {
    if (!Number.isFinite(durationSec) || durationSec <= 0) {
      throw new Error("Pattern loop duration must be finite and greater than zero.");
    }

    this.stopPatternLoop();
    if (!this.enabled || !this.#tone) return;

    const playAndScheduleNext = () => {
      this.playPattern(steps, velocity);
      this.#patternLoopTimer = setTimeout(playAndScheduleNext, durationSec * 1_000);
    };
    playAndScheduleNext();
  }

  stopPatternLoop(): void {
    if (this.#patternLoopTimer !== undefined) {
      clearTimeout(this.#patternLoopTimer);
      this.#patternLoopTimer = undefined;
    }
    this.stopPattern();
  }

  async loadSampler(samples: Record<string, string>): Promise<boolean> {
    const tone = this.#requireTone();
    const generation = ++this.#voiceGeneration;
    const next = new tone.Sampler({ urls: samples });
    const connected = this.#playbackGain ? next.connect(this.#playbackGain) : next.toDestination();
    try {
      await tone.loaded();
    } catch (error) {
      connected.dispose();
      throw error;
    }
    if (generation !== this.#voiceGeneration) {
      connected.dispose();
      return false;
    }
    const previous = this.#sampler;
    this.stopPattern();
    this.#sampler = connected;
    this.#playbackSound = "salamander-piano";
    previous?.dispose();
    return true;
  }

  async loadDrumKit(samples: DrumPadSample[]): Promise<void> {
    const tone = this.#requireTone();
    const generation = ++this.#drumKitGeneration;
    // Build the replacement before disposing the working kit, so a failed
    // decode/load leaves the previous players intact.
    const next = new tone.Players(
      Object.fromEntries(samples.map(({ padId, url }) => [padId, url])),
    );
    const connected = this.#playbackGain ? next.connect(this.#playbackGain) : next.toDestination();
    try {
      await tone.loaded();
    } catch (error) {
      connected.dispose();
      if (this.#disposed || generation !== this.#drumKitGeneration) return;
      throw error;
    }
    if (this.#disposed || generation !== this.#drumKitGeneration) {
      connected.dispose();
      return;
    }
    const previous = this.#players;
    this.#players = connected;
    previous?.dispose();
  }

  playDrum(padId: string, time?: ToneTime, velocity = 0.8): void {
    if (!this.enabled || !this.#tone || !this.#players) return;
    const player = this.#players.player(padId);
    player.volume.value = this.#tone.gainToDb(clampVelocity(velocity));
    player.start(time);
  }

  stopDrum(padId: string, time?: ToneTime): void {
    if (!this.enabled || !this.#players) return;
    this.#players.player(padId).stop(time);
  }

  playDrumPattern(steps: DrumPatternStep[], velocity = 0.8): void {
    if (!this.enabled || !this.#tone || !this.#players) return;
    const startAt = this.#tone.now();
    for (const step of steps) {
      for (const padId of step.padIds) {
        this.playDrum(padId, startAt + step.offsetSeconds, velocity);
      }
    }
  }

  startDrumPatternLoop(steps: DrumPatternStep[], durationSec: number, velocity = 0.8): void {
    if (!Number.isFinite(durationSec) || durationSec <= 0) {
      throw new Error("Drum loop duration must be finite and greater than zero.");
    }

    this.stopDrumPatternLoop();
    if (!this.enabled || !this.#tone) return;

    const playAndScheduleNext = () => {
      this.playDrumPattern(steps, velocity);
      this.#drumPatternLoopTimer = setTimeout(playAndScheduleNext, durationSec * 1_000);
    };
    playAndScheduleNext();
  }

  stopDrumPatternLoop(): void {
    if (this.#drumPatternLoopTimer !== undefined) {
      clearTimeout(this.#drumPatternLoopTimer);
      this.#drumPatternLoopTimer = undefined;
    }
  }

  // --- Intonation drone -----------------------------------------------------

  get droneActive(): boolean {
    return this.#droneNote !== undefined;
  }

  get droneTimbre(): string {
    return this.#droneTimbre;
  }

  get droneLevel(): number {
    return this.#droneLevel;
  }

  /** Start (or move) a sustained tonic drone at `midiNote`. No-op until enabled. */
  startDrone(midiNote: number): void {
    if (!this.enabled || !this.#tone || !this.#playbackGain) return;
    this.#ensureDroneVoice();
    if (this.#droneNote !== undefined) {
      this.#drone?.triggerRelease(this.#droneNotesFor(this.#droneNote));
    }
    this.#droneNote = midiNote;
    this.#drone?.triggerAttack(this.#droneNotesFor(midiNote));
  }

  /** Change the drone pitch while it is sounding; ignored when stopped. */
  setDroneNote(midiNote: number): void {
    if (!this.droneActive) return;
    this.startDrone(midiNote);
  }

  /** Swap the timbre; rebuilds and re-attacks the voice if the drone is active. */
  setDroneTimbre(name: string): void {
    if (!(name in DRONE_TIMBRES)) return;
    const note = this.#droneNote;
    // Release with the *current* timbre's intervals before switching.
    if (note !== undefined) this.#drone?.triggerRelease(this.#droneNotesFor(note));
    this.#droneTimbre = name;
    if (note !== undefined && this.#tone && this.#playbackGain) {
      this.#drone?.dispose();
      this.#drone = undefined;
      const voice = this.#ensureDroneVoice();
      voice?.triggerAttack(this.#droneNotesFor(note));
    }
  }

  setDroneLevel(level: number): void {
    this.#droneLevel = clampVelocity(level);
    if (this.#droneGain) this.#droneGain.gain.value = this.#droneLevel;
  }

  stopDrone(): void {
    if (this.#droneNote !== undefined) {
      this.#drone?.triggerRelease(this.#droneNotesFor(this.#droneNote));
      this.#droneNote = undefined;
    }
  }

  #ensureDroneVoice(): ToneInstrument | undefined {
    if (!this.#tone || !this.#playbackGain) return undefined;
    if (!this.#droneGain) {
      this.#droneGain = new this.#tone.Gain(this.#droneLevel).connect(this.#playbackGain);
    }
    if (!this.#drone) {
      this.#drone = new this.#tone.PolySynth(
        this.#tone.Synth,
        DRONE_TIMBRES[this.#droneTimbre].preset,
      ).connect(this.#droneGain);
    }
    return this.#drone;
  }

  #droneNotesFor(midiNote: number): string[] {
    return DRONE_TIMBRES[this.#droneTimbre].intervals.map((offset) =>
      midiToNote(midiNote + offset),
    );
  }

  playMetronomeClick(atSeconds: number, accented: boolean): void {
    if (!this.enabled) return;
    this.#metronome?.triggerAttackRelease(
      accented ? 1200 : 800,
      "32n",
      atSeconds,
      accented ? 0.7 : 0.45,
    );
  }

  playCountIn(input: { bpm: number; beats: number; beatsPerMeasure: number }): CountInSchedule {
    const tone = this.#requireTone();
    const beatSeconds = 60 / input.bpm;
    const startAudioSeconds = tone.now();

    for (let beat = 0; beat < input.beats; beat += 1) {
      this.playMetronomeClick(
        startAudioSeconds + beat * beatSeconds,
        beat % input.beatsPerMeasure === 0,
      );
    }

    return {
      startAudioSeconds,
      delayMs: Math.round(input.beats * beatSeconds * 1_000),
    };
  }

  dispose(): void {
    this.#disposed = true;
    this.#generation += 1;
    this.#voiceGeneration += 1;
    this.#drumKitGeneration += 1;
    this.stopPatternLoop();
    this.stopDrumPatternLoop();
    this.#synth?.dispose();
    this.#sampler?.dispose();
    this.#players?.dispose();
    this.#metronome?.dispose();
    this.#drone?.dispose();
    this.#metronomeGain?.dispose();
    this.#playbackGain?.dispose();
    this.#droneGain?.dispose();
    this.#master?.dispose();
    this.#synth = undefined;
    this.#patternVoice = undefined;
    this.#sampler = undefined;
    this.#players = undefined;
    this.#metronome = undefined;
    this.#drone = undefined;
    this.#metronomeGain = undefined;
    this.#playbackGain = undefined;
    this.#droneGain = undefined;
    this.#droneNote = undefined;
    this.#master = undefined;
    this.#tone = undefined;
    this.enabled = false;
  }

  get #instrument(): ToneInstrument | undefined {
    return this.#sampler ?? this.#synth;
  }

  #requireTone(): ToneSoundModule {
    if (!this.enabled || !this.#tone) {
      throw new Error("Audio must be enabled from a user gesture before loading samples.");
    }
    return this.#tone;
  }
}

function clampVelocity(velocity: number): number {
  return Math.min(1, Math.max(0, velocity));
}

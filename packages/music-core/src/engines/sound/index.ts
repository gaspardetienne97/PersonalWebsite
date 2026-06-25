import type { Score } from "@repo/music-core/domain";
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
  now(): number;
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

export interface DrumSample {
  name: string;
  url: string;
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
  #patternSynth: ToneInstrument | undefined;
  #sampler: ToneInstrument | undefined;
  #players: TonePlayers | undefined;
  #metronome: ToneInstrument | undefined;
  #drone: ToneInstrument | undefined;
  #master: ToneGain | undefined;
  #metronomeGain: ToneGain | undefined;
  #droneGain: ToneGain | undefined;
  #masterLevel = 1;
  #metronomeLevel = 0.7;
  #droneLevel = 0.5;
  #droneTimbre = DRONE_TIMBRE_NAMES[0]!;
  #droneNote: number | undefined;
  #instrumentName = SOUND_PRESET_NAMES[0]!;
  #patternLoopTimer: ReturnType<typeof setTimeout> | undefined;
  #loadTone: ToneLoader;
  enabled = false;
  muted = false;

  constructor(loader: ToneLoader = loadTone) {
    this.#loadTone = loader;
  }

  async enable(): Promise<AudioGateState> {
    if (this.enabled) return { enabled: true, message: "Audio enabled." };

    this.#tone = await this.#loadTone();
    await this.#tone.start();
    // master -> destination; metronome -> metronomeGain -> master; instruments -> master.
    this.#master = new this.#tone.Gain(this.muted ? 0 : this.#masterLevel).toDestination();
    this.#metronomeGain = new this.#tone.Gain(this.#metronomeLevel).connect(this.#master);
    this.#synth = new this.#tone.PolySynth(
      this.#tone.Synth,
      SOUND_PRESETS[this.#instrumentName],
    ).connect(this.#master);
    this.#metronome = new this.#tone.Synth({
      oscillator: { type: "triangle" },
      envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.02 },
    }).connect(this.#metronomeGain);
    this.enabled = true;

    return { enabled: true, message: "Audio enabled." };
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

  /** Choose the timbre the synth plays MIDI as. Rebuilds the voice live. */
  setInstrument(name: string): void {
    if (!(name in SOUND_PRESETS)) return;
    this.#instrumentName = name;
    if (this.#tone && this.#master) {
      this.#synth?.dispose();
      this.#synth = new this.#tone.PolySynth(this.#tone.Synth, SOUND_PRESETS[name]).connect(
        this.#master,
      );
    }
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

  playPattern(steps: SoundPatternStep[], velocity = 0.8): void {
    if (!this.enabled || !this.#tone || !this.#master) return;
    this.#patternSynth?.dispose();
    this.#patternSynth = new this.#tone.PolySynth(
      this.#tone.Synth,
      SOUND_PRESETS[this.#instrumentName],
    ).connect(this.#master);
    const startAt = this.#tone.now();
    for (const step of steps) {
      this.#patternSynth.triggerAttackRelease(
        step.midiNotes.map((note) => midiToNote(note)),
        step.durationSeconds,
        startAt + step.offsetSeconds,
        clampVelocity(velocity),
      );
    }
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
  }

  async loadSampler(samples: Record<string, string>): Promise<void> {
    const tone = this.#requireTone();
    this.#sampler?.dispose();
    const sampler = new tone.Sampler({ urls: samples });
    this.#sampler = this.#master ? sampler.connect(this.#master) : sampler.toDestination();
    await tone.loaded();
  }

  async loadDrumKit(samples: DrumSample[]): Promise<void> {
    const tone = this.#requireTone();
    this.#players?.dispose();
    const players = new tone.Players(
      Object.fromEntries(samples.map(({ name, url }) => [name, url])),
    );
    this.#players = this.#master ? players.connect(this.#master) : players.toDestination();
    await tone.loaded();
  }

  playDrum(name: string, time?: ToneTime, velocity = 0.8): void {
    if (!this.enabled || !this.#tone || !this.#players) return;
    const player = this.#players.player(name);
    player.volume.value = this.#tone.gainToDb(clampVelocity(velocity));
    player.start(time);
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
    if (!this.enabled || !this.#tone || !this.#master) return;
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
    if (note !== undefined && this.#tone && this.#master) {
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
    if (!this.#tone || !this.#master) return undefined;
    if (!this.#droneGain) {
      this.#droneGain = new this.#tone.Gain(this.#droneLevel).connect(this.#master);
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
    this.stopPatternLoop();
    this.#synth?.dispose();
    this.#patternSynth?.dispose();
    this.#sampler?.dispose();
    this.#players?.dispose();
    this.#metronome?.dispose();
    this.#drone?.dispose();
    this.#metronomeGain?.dispose();
    this.#droneGain?.dispose();
    this.#master?.dispose();
    this.#synth = undefined;
    this.#patternSynth = undefined;
    this.#sampler = undefined;
    this.#players = undefined;
    this.#metronome = undefined;
    this.#drone = undefined;
    this.#metronomeGain = undefined;
    this.#droneGain = undefined;
    this.#droneNote = undefined;
    this.#master = undefined;
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

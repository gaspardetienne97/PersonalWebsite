import { midiToNote } from "@repo/music-core/engines/theory";

type ToneTime = number | string;

interface ToneInstrument {
  triggerAttackRelease(
    notes: string | string[] | number,
    duration: ToneTime,
    time?: ToneTime,
    velocity?: number,
  ): unknown;
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

export class SoundEngine {
  #tone: ToneSoundModule | undefined;
  #synth: ToneInstrument | undefined;
  #sampler: ToneInstrument | undefined;
  #players: TonePlayers | undefined;
  #metronome: ToneInstrument | undefined;
  #master: ToneGain | undefined;
  #metronomeGain: ToneGain | undefined;
  #masterLevel = 1;
  #metronomeLevel = 0.7;
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
    this.#synth = new this.#tone.PolySynth(this.#tone.Synth).connect(this.#master);
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
    if (!this.enabled || !this.#tone) return;
    const startAt = this.#tone.now();
    for (const step of steps) {
      this.#instrument?.triggerAttackRelease(
        step.midiNotes.map((note) => midiToNote(note)),
        step.durationSeconds,
        startAt + step.offsetSeconds,
        clampVelocity(velocity),
      );
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
    this.#synth?.dispose();
    this.#sampler?.dispose();
    this.#players?.dispose();
    this.#metronome?.dispose();
    this.#metronomeGain?.dispose();
    this.#master?.dispose();
    this.#synth = undefined;
    this.#sampler = undefined;
    this.#players = undefined;
    this.#metronome = undefined;
    this.#metronomeGain = undefined;
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

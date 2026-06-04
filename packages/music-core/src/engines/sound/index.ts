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
  dispose(): unknown;
}

interface TonePlayer {
  volume: { value: number };
  start(time?: ToneTime): unknown;
}

interface TonePlayers {
  player(name: string): TonePlayer;
  toDestination(): TonePlayers;
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

type ToneLoader = () => Promise<ToneSoundModule>;

const loadTone: ToneLoader = async () => (await import("tone")) as unknown as ToneSoundModule;

export class SoundEngine {
  #tone: ToneSoundModule | undefined;
  #synth: ToneInstrument | undefined;
  #sampler: ToneInstrument | undefined;
  #players: TonePlayers | undefined;
  #metronome: ToneInstrument | undefined;
  #loadTone: ToneLoader;
  enabled = false;

  constructor(loader: ToneLoader = loadTone) {
    this.#loadTone = loader;
  }

  async enable(): Promise<AudioGateState> {
    if (this.enabled) return { enabled: true, message: "Audio enabled." };

    this.#tone = await this.#loadTone();
    await this.#tone.start();
    this.#synth = new this.#tone.PolySynth(this.#tone.Synth).toDestination();
    this.#metronome = new this.#tone.Synth({
      oscillator: { type: "triangle" },
      envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.02 },
    }).toDestination();
    this.enabled = true;

    return { enabled: true, message: "Audio enabled." };
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
    this.#sampler = new tone.Sampler({ urls: samples }).toDestination();
    await tone.loaded();
  }

  async loadDrumKit(samples: DrumSample[]): Promise<void> {
    const tone = this.#requireTone();
    this.#players?.dispose();
    this.#players = new tone.Players(
      Object.fromEntries(samples.map(({ name, url }) => [name, url])),
    ).toDestination();
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

  dispose(): void {
    this.#synth?.dispose();
    this.#sampler?.dispose();
    this.#players?.dispose();
    this.#metronome?.dispose();
    this.#synth = undefined;
    this.#sampler = undefined;
    this.#players = undefined;
    this.#metronome = undefined;
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

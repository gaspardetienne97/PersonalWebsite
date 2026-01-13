import * as Tone from "tone";

export interface DrumSample {
  note: number;
  name: string;
  url: string;
}

export interface AudioEngineState {
  isInitialized: boolean;
  isPlaying: boolean;
  currentTime: number;
  tempo: number;
}

class AudioEngine {
  private sampler: Tone.Sampler | null = null;
  private metronome: Tone.Synth | null = null;
  private metronomePart: Tone.Part | null = null;
  private isInitialized = false;
  private samples: Map<number, Tone.Player> = new Map();
  private transport: ReturnType<typeof Tone.getTransport> | null = null;

  async initialize(): Promise<boolean> {
    if (this.isInitialized) return true;

    // Start audio context (requires user gesture)
    await Tone.start();

    // Get transport reference
    this.transport = Tone.getTransport();

    // Create metronome synth
    this.metronome = new Tone.Synth({
      oscillator: { type: "triangle" },
      envelope: {
        attack: 0.001,
        decay: 0.1,
        sustain: 0,
        release: 0.1,
      },
    }).toDestination();

    this.isInitialized = true;
    console.log("Audio engine initialized");
    return true;
  }

  /**
   * Load drum samples from URL map
   */
  async loadSamples(samples: DrumSample[]): Promise<void> {
    await this.initialize();

    // Clear existing
    this.samples.forEach((p) => p.dispose());
    this.samples.clear();

    // Load new samples
    const loadPromises = samples.map(async (sample) => {
      const player = new Tone.Player(sample.url).toDestination();
      await Tone.loaded();
      this.samples.set(sample.note, player);
    });

    await Promise.all(loadPromises);
    console.log(`Loaded ${samples.length} drum samples`);
  }

  /**
   * Trigger a drum sample
   */
  triggerDrum(note: number, velocity: number = 100, time?: number): void {
    const player = this.samples.get(note);
    if (!player) {
      console.warn(`No sample loaded for note ${note}`);
      return;
    }

    // Normalize velocity to 0-1
    const normalizedVelocity = Math.min(1, Math.max(0, velocity / 127));
    player.volume.value = Tone.gainToDb(normalizedVelocity);

    if (player.loaded) {
      player.start(time);
    }
  }

  /**
   * Play metronome click
   */
  playClick(accent: boolean = false, time?: number): void {
    if (!this.metronome) return;

    const freq = accent ? 1000 : 800;
    const velocity = accent ? 0.5 : 0.3;

    this.metronome.triggerAttackRelease(freq, "32n", time, velocity);
  }

  /**
   * Start metronome at given tempo
   */
  startMetronome(bpm: number, timeSignature: [number, number] = [4, 4]): void {
    if (!this.transport) return;

    this.stopMetronome();

    this.transport.bpm.value = bpm;

    const [beats] = timeSignature;
    const events: { time: string; accent: boolean }[] = [];

    for (let i = 0; i < beats; i++) {
      events.push({
        time: `0:${i}:0`,
        accent: i === 0,
      });
    }

    this.metronomePart = new Tone.Part((time, event) => {
      this.playClick(event.accent, time);
    }, events);

    this.metronomePart.loop = true;
    this.metronomePart.loopEnd = "1m";
    this.metronomePart.start(0);

    this.transport.start();
  }

  /**
   * Stop metronome
   */
  stopMetronome(): void {
    if (this.metronomePart) {
      this.metronomePart.stop();
      this.metronomePart.dispose();
      this.metronomePart = null;
    }
    if (this.transport) {
      this.transport.stop();
    }
  }

  /**
   * Set master volume (0-100)
   */
  setMasterVolume(volume: number): void {
    const db = volume === 0 ? -Infinity : Tone.gainToDb(volume / 100);
    Tone.getDestination().volume.value = db;
  }

  /**
   * Get current transport time in seconds
   */
  getCurrentTime(): number {
    return this.transport?.seconds ?? 0;
  }

  /**
   * Set transport tempo
   */
  setTempo(bpm: number): void {
    if (this.transport) {
      this.transport.bpm.value = bpm;
    }
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    this.stopMetronome();
    this.sampler?.dispose();
    this.metronome?.dispose();
    this.samples.forEach((p) => p.dispose());
    this.samples.clear();
    this.isInitialized = false;
  }
}

// Singleton
export const audioEngine = new AudioEngine();

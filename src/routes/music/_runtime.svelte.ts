import { getContext, setContext } from "svelte";

import type { InputSource, InstrumentId } from "@repo/music-core/domain";
import { InputRouter } from "@repo/music-core/engines/input-router";
import { MidiEngine } from "@repo/music-core/engines/midi";
import { SoundEngine } from "@repo/music-core/engines/sound";
import {
  createToneTransportEngine,
  type TransportEngine,
} from "@repo/music-core/engines/transport";

const MUSIC_RUNTIME = Symbol("music-runtime");

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

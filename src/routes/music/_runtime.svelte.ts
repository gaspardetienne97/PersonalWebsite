import { getContext, setContext } from "svelte";

import type { InputSource, InstrumentId } from "@repo/music-core/domain";
import { InputRouter } from "@repo/music-core/engines/input-router";
import { MidiEngine } from "@repo/music-core/engines/midi";
import { SoundEngine } from "@repo/music-core/engines/sound";

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

  dispose(): void {
    this.#unsubscribeMidi();
    this.#unsubscribeRouterState();
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

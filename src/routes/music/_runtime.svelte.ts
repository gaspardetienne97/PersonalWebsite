import { getContext, setContext } from "svelte";

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

  #enablePromise?: Promise<boolean>;
  #unsubscribeMidi = this.midi.subscribe((event) => {
    this.router.push(event);
  });

  enableAudio(): Promise<boolean> {
    this.#enablePromise ??= this.#enableAudio().finally(() => {
      this.#enablePromise = undefined;
    });
    return this.#enablePromise;
  }

  dispose(): void {
    this.#unsubscribeMidi();
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

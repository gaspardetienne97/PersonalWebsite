import { frequency } from "@repo/music-core/engines/theory";

export interface AudioGateState {
  enabled: boolean;
  message: string;
}

export class SoundEngine {
  #context: AudioContext | undefined;
  enabled = false;

  async enable(): Promise<AudioGateState> {
    if (typeof window === "undefined") {
      return { enabled: false, message: "Audio is available in the browser." };
    }
    const Ctx = window.AudioContext ?? window.webkitAudioContext;
    this.#context = this.#context ?? new Ctx();
    if (this.#context.state === "suspended") await this.#context.resume();
    this.enabled = true;
    return { enabled: true, message: "Audio enabled." };
  }

  playNote(midiNote: number, durationMs = 180): void {
    if (!this.#context || !this.enabled) return;
    const now = this.#context.currentTime;
    const osc = this.#context.createOscillator();
    const gain = this.#context.createGain();
    osc.frequency.value = frequency(midiNote);
    osc.type = "triangle";
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
    osc.connect(gain);
    gain.connect(this.#context.destination);
    osc.start(now);
    osc.stop(now + durationMs / 1000 + 0.02);
  }

  playChord(midiNotes: number[]): void {
    midiNotes.forEach((note) => this.playNote(note, 320));
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

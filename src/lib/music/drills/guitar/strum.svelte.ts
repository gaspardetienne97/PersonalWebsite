// Chord listening from the microphone: a rolling buffer of analysed frames, the
// pitch classes heard over the last 600 ms (the live readout), and one reading
// per strum onset (the 600 ms from the attack, hardware notes 4).
// Monophonic pitch detection cannot hear a chord; the chord reader can hear
// which pitch classes ring, not which string rang them.
import {
  analyseChord,
  framesWindow,
  readAnalysis,
  type ChordAnalysis,
} from "@repo/music-core/signal/chord";
import { CHORD_WINDOW_MS } from "@repo/music-core/signal/chroma";
import { input, mic, type MicFrame } from "#lib/music/runtime/index.ts";

const HISTORY_MS = 2500;

export interface Heard {
  at: number;
  pcs: number[];
  chroma: number[];
  /** The analysed window, to check against a known target (`checkChord`). */
  analysis: ChordAnalysis;
}

const frameMs = (f: MicFrame) => (f.frame.length / f.sampleRate) * 1000;

export class ChordListener {
  /** Pitch classes ringing now (last 600 ms). */
  live = $state.raw<number[]>([]);
  #frames: MicFrame[] = [];
  #pending: number[] = [];
  #stops: (() => void)[] = [];
  #n = 0;
  #onStrum: ((h: Heard) => void) | undefined;
  #onFrame: ((f: MicFrame) => void) | undefined;

  /** Listen; `onStrum` gets one reading per audio onset once its window is complete. */
  start(opts: { onStrum?: (h: Heard) => void; onFrame?: (f: MicFrame) => void } = {}) {
    this.stop();
    this.#onStrum = opts.onStrum;
    this.#onFrame = opts.onFrame;
    const off = mic.subscribeFrames((f) => this.#frame(f));
    this.#stops.push(() => void off());
    this.#stops.push(
      input.subscribe((e) => {
        if (e.kind === "onset" && e.source === "audio") this.#pending.push(e.at);
      }),
    );
  }

  stop() {
    for (const s of this.#stops) s();
    this.#stops = [];
    this.#pending = [];
    this.#frames = [];
    this.live = [];
  }

  /** The 600 ms from `from` (perf ms), or null until those frames have arrived. */
  analyse(from: number): Heard | null {
    const newest = this.#frames[this.#frames.length - 1];
    if (!newest || newest.at + frameMs(newest) < from + CHORD_WINDOW_MS) return null;
    return this.#read(from);
  }

  #read(from: number): Heard {
    const frames = this.#frames.filter(
      (f) => f.at + frameMs(f) > from && f.at < from + CHORD_WINDOW_MS,
    );
    // The reader answers nothing for silence, room noise and hum (its own floor and noise test).
    const analysis = analyseChord(
      framesWindow(frames, from, CHORD_WINDOW_MS),
      frames[0]?.sampleRate ?? 48000,
    );
    const r = readAnalysis(analysis);
    return { at: from, pcs: r.pcs, chroma: r.chroma, analysis };
  }

  #frame(f: MicFrame) {
    this.#frames.push(f);
    while (this.#frames.length && f.at - this.#frames[0].at > HISTORY_MS) this.#frames.shift();
    this.#onFrame?.(f);
    // The live readout costs one FFT; every fourth frame (~180 ms) is plenty.
    if (++this.#n % 4 === 0) this.live = this.#read(f.at + frameMs(f) - CHORD_WINDOW_MS).pcs;
    while (this.#pending.length) {
      const h = this.analyse(this.#pending[0]);
      if (!h) break;
      this.#pending.shift();
      this.#onStrum?.(h);
    }
  }
}

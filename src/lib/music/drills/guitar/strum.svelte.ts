// Chord listening from the microphone: a rolling buffer of analysed frames, the
// pitch classes heard over the last 600 ms (the live readout), and one chroma
// reading per strum onset (the 600 ms after the attack, hardware notes 4).
// Monophonic pitch detection cannot hear a chord; chroma can hear which pitch
// classes ring, not which string rang them.
import {
  chordWindow,
  chroma,
  chromaToPcs,
  CHORD_SAMPLE_RATE,
  CHORD_WINDOW_MS,
} from "@repo/music-core/signal/chroma";
import { rmsDb } from "@repo/music-core/signal/level";
import { input, mic, type MicFrame } from "#lib/music/runtime/index.ts";

const HISTORY_MS = 2500;
/** Below this RMS the window is silence, not a chord (a quiet room still has a strongest bin). */
// ponytail: fixed floor; per-room noise calibration if real rooms read tones out of hiss.
export const CHORD_FLOOR_DB = -50;

export interface Heard {
  at: number;
  pcs: number[];
  chroma: number[];
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
    const frames = this.#frames.filter(
      (f) => f.at + frameMs(f) > from && f.at < from + CHORD_WINDOW_MS,
    );
    return frames.length
      ? this.#read(frames, from)
      : { at: from, pcs: [], chroma: Array(12).fill(0) };
  }

  #read(frames: MicFrame[], at: number): Heard {
    const buf = new Float32Array(frames.reduce((n, f) => n + f.frame.length, 0));
    let o = 0;
    for (const f of frames) {
      buf.set(f.frame, o);
      o += f.frame.length;
    }
    if (rmsDb(buf) < CHORD_FLOOR_DB) return { at, pcs: [], chroma: Array(12).fill(0) };
    const c = chroma(chordWindow([buf], frames[0].sampleRate), CHORD_SAMPLE_RATE);
    return { at, pcs: chromaToPcs(c), chroma: c };
  }

  #frame(f: MicFrame) {
    this.#frames.push(f);
    while (this.#frames.length && f.at - this.#frames[0].at > HISTORY_MS) this.#frames.shift();
    this.#onFrame?.(f);
    // The live readout costs one FFT; every fourth frame (~180 ms) is plenty.
    if (++this.#n % 4 === 0) {
      const end = f.at + frameMs(f);
      this.live = this.#read(
        this.#frames.filter((x) => x.at + frameMs(x) > end - CHORD_WINDOW_MS),
        end - CHORD_WINDOW_MS,
      ).pcs;
    }
    while (this.#pending.length) {
      const h = this.analyse(this.#pending[0]);
      if (!h) break;
      this.#pending.shift();
      this.#onStrum?.(h);
    }
  }
}

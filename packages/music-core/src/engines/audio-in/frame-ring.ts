/**
 * FrameRing — fixed-capacity ring of the most recent mono PCM samples.
 *
 * Lets the Phase 3 capture grab the last ~0.5 s around an onset for buffered
 * Basic Pitch confirmation without holding the whole session in memory. Pure
 * and testable; sized by the caller to its window length.
 */
export class FrameRing {
  #buffer: Float32Array;
  #size = 0;
  #write = 0;

  constructor(capacity: number) {
    this.#buffer = new Float32Array(Math.max(1, Math.floor(capacity)));
  }

  push(frame: Float32Array): void {
    for (let i = 0; i < frame.length; i++) {
      this.#buffer[this.#write] = frame[i]!;
      this.#write = (this.#write + 1) % this.#buffer.length;
      if (this.#size < this.#buffer.length) this.#size++;
    }
  }

  /** Up to the last `count` samples, oldest-first. */
  takeLast(count: number): Float32Array {
    const n = Math.min(Math.max(0, Math.floor(count)), this.#size);
    const out = new Float32Array(n);
    let read = (this.#write - n + this.#buffer.length) % this.#buffer.length;
    for (let i = 0; i < n; i++) {
      out[i] = this.#buffer[read]!;
      read = (read + 1) % this.#buffer.length;
    }
    return out;
  }

  get size(): number {
    return this.#size;
  }
}

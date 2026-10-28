// Note Repeat on the app's side (the MPC's own does not reach a host in
// Controller Mode): a held pad plays again on every step of the rate's grid,
// counted from the run's or the loop's downbeat. Aftertouch (channel or poly
// pressure), when the pads send it, sets the repeats' level as the MPC's does;
// otherwise they keep the hit's velocity.
import type { InputEvent, NoteEvent } from "@repo/music-core";
import { nextRepeatAt, repeatPerBeat } from "@repo/music-core/content/pads-studio";

export interface NoteRepeatOptions {
  /** The grid's downbeat (performance clock), or null when nothing is running. */
  origin: () => number | null;
  beatMs: () => number;
  /** The rate at a time (a chart can change it beat by beat). */
  rate: (at: number) => string;
  /** Only this pad repeats (null: every pad). */
  pad?: () => number | null;
  onRepeat: (e: NoteEvent) => void;
}

export class NoteRepeat {
  #held = new Map<number, { hit: NoteEvent; last: number; timer: ReturnType<typeof setTimeout> }>();
  #pressure: number | null = null;
  /** Aftertouch arrived at least once: the pads send it. */
  aftertouch = false;

  constructor(private opts: NoteRepeatOptions) {}

  handle(e: InputEvent) {
    if (e.kind === "pressure") {
      this.#pressure = e.value;
      if (e.value > 0) this.aftertouch = true;
      return;
    }
    if (e.kind !== "noteon" && e.kind !== "noteoff") return;
    if (e.kind === "noteoff") return this.#release(e.midi);
    const only = this.opts.pad?.() ?? null;
    if (only !== null && e.midi !== only) return;
    this.#release(e.midi);
    this.#pressure = null;
    this.#schedule(e.midi, e, e.at);
  }

  #schedule(midi: number, hit: NoteEvent, last: number) {
    const origin = this.opts.origin();
    if (origin === null) return;
    const beatMs = this.opts.beatMs();
    // The rate a little ahead of the last note, so a hit just before a roll's beat takes the roll's rate.
    const step = beatMs / repeatPerBeat(this.opts.rate(last + beatMs / 4));
    const at = nextRepeatAt(last, hit.at, origin, step);
    const timer = setTimeout(
      () => {
        if (this.#held.get(midi)?.timer !== timer) return;
        const velocity =
          this.#pressure !== null && this.#pressure > 0 ? this.#pressure : hit.velocity;
        this.opts.onRepeat({
          ...hit,
          at,
          velocity,
          velocityMeasured: hit.velocityMeasured || this.#pressure !== null,
        });
        this.#schedule(midi, hit, at);
      },
      Math.max(0, at - performance.now()),
    );
    this.#held.set(midi, { hit, last, timer });
  }

  #release(midi: number) {
    const h = this.#held.get(midi);
    if (!h) return;
    clearTimeout(h.timer);
    this.#held.delete(midi);
  }

  stop() {
    for (const midi of [...this.#held.keys()]) this.#release(midi);
  }
}

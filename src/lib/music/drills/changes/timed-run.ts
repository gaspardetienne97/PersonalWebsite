// The timed run that chord scales, licks, comping and accompaniment share: capture from half a beat
// before the downbeat, the transport following the shell's clock, and one timer that ends the run.
import type { NoteEvent } from "@repo/music-core";
import type { RunContext } from "#lib/music/components/DrillShell.svelte";
import { capture, type Capture } from "#lib/music/drill.svelte.ts";

export class TimedRun {
  #cap: Capture | null = null;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #stopClock: (() => void) | null = null;
  #done: () => void = () => {};

  constructor(private transport: { follow(t0: number, beatMs: number): void; stop(): void }) {}

  /** Listen and follow the click; `done` is called `beats` after the downbeat, plus `padMs`. */
  begin(
    ctx: RunContext,
    beats: number,
    onNote: (e: NoteEvent) => void,
    done: () => void,
    padMs = 0,
  ) {
    this.#stopClock = ctx.stopClock;
    this.#done = done;
    this.#cap = capture(ctx.downbeat - ctx.beatMs / 2, (e) => e.kind === "noteon" && onNote(e));
    this.transport.follow(ctx.downbeat, ctx.beatMs);
    this.#timer = setTimeout(
      done,
      Math.max(0, ctx.downbeat - performance.now()) + beats * ctx.beatMs + padMs,
    );
  }

  /** The last note has landed: end in `ms` instead of at the end of the form. */
  endIn(ms: number) {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(this.#done, ms);
  }

  /** Stop the timer, the transport and the capture (and the click, when the run finished by itself). Returns what was played. */
  end(stopClock = false): NoteEvent[] {
    clearTimeout(this.#timer);
    if (stopClock) this.#stopClock?.();
    this.transport.stop();
    this.#cap?.stop();
    return this.#cap?.notes ?? [];
  }
}

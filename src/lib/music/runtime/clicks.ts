// The app's own metronome clicks, as the microphone path needs them: when each
// one leaves the speakers and which tone it is. runtime/audio.svelte.ts logs a
// click as it schedules it; runtime/mic.svelte.ts hands the ones due around
// each frame to the listener, which takes them out of what it hears
// (music-core signal/click.ts). Times are performance.now() milliseconds.
import type { ExpectedClick } from "@repo/music-core/signal/click";

/** Clicks are scheduled up to a second ahead and looked for until 300 ms after. */
const KEEP_MS = 3000;
let log: ExpectedClick[] = [];

export const clickLog = {
  /** A click was scheduled to sound at `at`, with its pitch. */
  add(at: number, hz: number) {
    const old = performance.now() - KEEP_MS;
    if (log.length && log[0].at < old) log = log.filter((c) => c.at >= old);
    log.push({ at, hz });
  },
  /** The clicks due between two times. */
  between(from: number, to: number): ExpectedClick[] {
    return log.filter((c) => c.at >= from && c.at <= to);
  },
  clear() {
    log = [];
  },
};

/**
 * Time — branded timestamp types.
 *
 * The app deals with two fundamentally different kinds of time, and conflating
 * them is a real, easy-to-introduce bug (v1 used `Date`/`number` for both). We
 * brand them so the type system keeps them apart:
 *
 *  - {@link MonotonicMs}: a high-resolution clock that only moves forward and is
 *    NOT wall-clock (e.g. `performance.now()` or `AudioContext.currentTime *
 *    1000`). Used for *timing/latency* — rhythm scoring, note onsets, anything
 *    where millisecond precision and monotonicity matter. Meaningless as a date.
 *
 *  - {@link UnixMs}: wall-clock milliseconds since the epoch (`Date.now()`).
 *    Used for *history* — when a session happened, when evidence was recorded.
 *    Serializes cleanly to IndexedDB/JSON (no `Date` reviver needed).
 *
 * Branding is zero-cost at runtime; the values are plain numbers.
 */

export type MonotonicMs = number & { readonly __brand: "MonotonicMs" };
export type UnixMs = number & { readonly __brand: "UnixMs" };

/** Identifies which clock a {@link MonotonicMs} came from (for latency calibration). */
export type ClockSource = "audioContext" | "performance" | "midi";

export function monotonicMs(n: number): MonotonicMs {
  return n as MonotonicMs;
}

export function unixMs(n: number): UnixMs {
  return n as UnixMs;
}

/** Current wall-clock time as a branded value. */
export function nowUnix(): UnixMs {
  return Date.now() as UnixMs;
}

/** Convert a stored wall-clock timestamp to a `Date` only at the UI edge. */
export function toDate(t: UnixMs): Date {
  return new Date(t);
}

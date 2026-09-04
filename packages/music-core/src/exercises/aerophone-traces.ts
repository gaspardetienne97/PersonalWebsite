import type { NoteOnEvent } from "@repo/music-core/domain";
import { centsBetween, midiToFrequency } from "@repo/music-core/engines/audio-in";

/** How many recent samples a live trace keeps; enough for a stage sparkline. */
export const TRACE_LENGTH = 64;

/**
 * Offset of an attack from the target, in cents. An audio attack carries the
 * detected frequency and yields the real offset; a MIDI attack is quantized to
 * whole semitones, so the offset is a multiple of 100.
 */
export function pitchCents(event: NoteOnEvent, targetMidi: number): number {
  if (event.frequencyHz !== undefined && event.frequencyHz > 0) {
    return centsBetween(event.frequencyHz, midiToFrequency(targetMidi));
  }
  return (event.midiNote - targetMidi) * 100;
}

/** The tail of a trace, oldest first. */
export function recent(values: readonly number[], length = TRACE_LENGTH): number[] {
  return values.length <= length ? [...values] : values.slice(values.length - length);
}

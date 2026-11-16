// What the microphone path does with each frame, in one place: the app's own
// metronome taken out, the level gate, the pitch reader, the onset detector and
// the note tracker. The app (runtime/mic.svelte.ts) and the detection eval
// (scripts/detection-eval) both run this, so what is measured is what is heard.
import { createClickCanceller, type CleanFrame, type ExpectedClick } from "./click";
import { createNoiseGate } from "./level";
import { createOnsetDetector } from "./onset";
import { analyzePitch, clearEnough, type PitchReading } from "./pitch";
import { createNoteTracker, type TrackedNote } from "./tracker";

/** The metronome's two tones (runtime/audio.svelte.ts plays them, click.ts listens for them). */
export const CLICK_HZ = { accent: 1760, beat: 1320 } as const;
/** In a frame a click was in, a reading this close to its tone, or to the octave or twelfth under it, is the click. */
const CLICK_CENTS = 250;

export interface HeardFrame {
  /** The frame with the app's own click taken out, and the last two such frames joined. */
  frame: Float32Array;
  wide: Float32Array;
  /** Start of `frame`, ms. */
  at: number;
  /** The reading the app shows and tracks: clear enough for its register, else null. */
  pitch: PitchReading | null;
  onset: { at: number; strength: number } | null;
  /** Note-ons and note-offs this frame produced. */
  notes: TrackedNote[];
  /** RMS of the frame and the gate it was read with. */
  rms: number;
  gateRms: number;
}

export function createListener(sampleRate: number) {
  const canceller = createClickCanceller(sampleRate);
  const gate = createNoiseGate();
  const onsets = createOnsetDetector(sampleRate);
  const tracker = createNoteTracker();
  let prev: Float32Array | null = null;
  /** The onset detector looks at two frames, so a click it must ignore also covers the frame after. */
  let muteNext = false;

  /** What the click removal left in the frame before, which the onset detector still has in its window. */
  let residueBefore = 0;
  let clickSince = 0;

  function hear({ frame, at, click, clickHz, residue = 0, clickAt }: CleanFrame, a4: number) {
    const wide = new Float32Array(2 * frame.length);
    if (prev) wide.set(prev, 0);
    wide.set(frame, frame.length);
    prev = frame;
    let sum = 0;
    for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
    const rms = Math.sqrt(sum / Math.max(1, frame.length));
    const floor = gate.push(rms, at);
    // Where a click was taken off, what is left of it is noise too: nothing
    // under twice that is read or counted as an attack.
    const gateRms = Math.max(floor, 2 * residue);
    const onsetGate = Math.max(gateRms, 2 * residueBefore);
    residueBefore = residue;

    const p = analyzePitch(frame, sampleRate, wide, a4, gateRms);
    const pitch = p && clearEnough(p) ? p : null;
    // A click that could not be removed hides whatever attack is in its frames
    // (and in the frame after, which the onset detector still has in its
    // window); one that was removed counts while what is left is over the gate.
    const mute = click === "unlearned" || muteNext;
    muteNext = click === "unlearned";
    if (clickAt !== undefined) clickSince = clickAt;
    const hidden = mute || onsetGate > floor;
    const onset = onsets.push(frame, at, onsetGate, mute, hidden ? clickSince : undefined);
    // What is left of a click (or all of one that could not be removed) is not a
    // note: the frame is left out, and the note that was sounding carries on.
    const hz = pitch?.hz;
    const isClick =
      hz !== undefined &&
      clickHz !== undefined &&
      [1, 2, 3].some((k) => Math.abs(1200 * Math.log2((hz * k) / clickHz)) <= CLICK_CENTS);
    if (isClick) {
      if (onset) tracker.attack(onset.at);
      return { frame, wide, at, pitch: null, onset, notes: [], rms, gateRms };
    }
    const notes = tracker.push(at, pitch, onset?.at, rms);
    return { frame, wide, at, pitch, onset, notes, rms, gateRms };
  }

  return {
    /**
     * Push the next frame (`at`: its start, ms). `clicks` are the app's own
     * metronome clicks due around now, on the same clock. Returns what was
     * heard, a frame at a time, oldest first: usually this frame, but a frame
     * inside a click's window is held back until the next one arrives.
     */
    push(
      frame: Float32Array,
      at: number,
      { a4 = 440, clicks }: { a4?: number; clicks?: readonly ExpectedClick[] } = {},
    ): HeardFrame[] {
      return canceller.push(frame, at, clicks).map((c) => hear(c, a4));
    },
    /** The microphone stopped: end the sounding note. */
    stop(at: number): TrackedNote[] {
      return tracker.stop(at);
    },
  };
}

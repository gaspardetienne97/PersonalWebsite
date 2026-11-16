// From a pitch reading per frame to note-ons and note-offs. Pure and clock-free,
// so the microphone path and the detection eval run the same code.
export interface TrackedPitch {
  midi: number;
  cents: number;
  clarity: number;
}
export type TrackedNote =
  | { kind: "noteon"; midi: number; at: number; cents: number; clarity: number }
  | { kind: "noteoff"; midi: number; at: number };

/** Semitone distances that are one tone's overtones or undertones: octaves, twelfths, two octaves. */
const HARMONIC_STEPS = new Set([12, 19, 24, 28, 31, 36]);

/**
 * The note tracker. A frame's reading names a note; a note sounds once the
 * same note has been read on `stableFrames` frames in a row (two frames, about
 * 85 ms of sound).
 *
 * - Hysteresis: a reading within `holdCents` of the note already sounding (or
 *   being counted) is that note, so a voice sitting on the line between two
 *   semitones does not flip between them every few frames.
 * - A step of one semitone with no attack (a voice sliding into its note) needs
 *   `stepFrames` frames.
 * - Overtone slips: a move to an octave or a twelfth of the sounding note with
 *   no attack is what a pitch reader does when a tone's overtone takes over, so
 *   it needs `harmonicFrames` frames. An attack in the last `attackMs` clears
 *   both waits.
 * - Ringing: a new pitch more than `tailDb` under the level of what was just
 *   played (a peak follower with a two second half-life), with no attack, is an
 *   open string or the room left ringing, and is treated as silence.
 * - The same pitch struck again never drops out, so only the attack says it is a
 *   new note. A new note's attack often arrives while the pitch still reads as
 *   the old one, so the re-strike waits until the pitch has held for
 *   `stableFrames` more frames and is dropped if the pitch moves on.
 * - `silentFrames` unread frames end the note; one dropped frame does not.
 */
export function createNoteTracker({
  stableFrames = 2,
  stepFrames = 3,
  harmonicFrames = 5,
  silentFrames = 2,
  holdCents = 70,
  restrikeMs = 120,
  attackMs = 150,
  tailDb = 18,
  halfLifeMs = 2000,
} = {}) {
  const tail = 10 ** (-tailDb / 20);
  let peak = 0;
  let peakAt = 0;
  let candidate: number | undefined;
  let candidateAt = 0;
  let candidateRun = 0;
  let silentRun = 0;
  let sounding: number | undefined;
  let soundingAt = 0;
  let lastOnset = -Infinity;
  let restrike: { at: number; midi: number; frames: number } | null = null;

  /** The note this reading belongs to: the one in `refs` it is still within reach of, else its own. */
  const nameOf = (p: TrackedPitch, refs: (number | undefined)[]) => {
    const exact = p.midi + p.cents / 100;
    for (const ref of refs)
      if (ref !== undefined && Math.abs(exact - ref) * 100 <= holdCents) return ref;
    return p.midi;
  };

  return {
    get sounding() {
      return sounding;
    },
    /** One frame: its start time, its reading (null when nothing clear was heard), an attack found in it, its RMS. */
    push(at: number, pitch: TrackedPitch | null, onsetAt?: number, rms = 1): TrackedNote[] {
      const out: TrackedNote[] = [];
      const off = (when: number) => {
        if (sounding === undefined) return;
        out.push({ kind: "noteoff", midi: sounding, at: when });
        sounding = undefined;
      };
      const on = (midi: number, when: number, p: TrackedPitch) => {
        off(when);
        sounding = midi;
        soundingAt = when;
        out.push({
          kind: "noteon",
          midi,
          at: when,
          cents: Math.round((p.midi - midi) * 100 + p.cents),
          clarity: p.clarity,
        });
      };
      if (onsetAt !== undefined) lastOnset = onsetAt;
      peak = Math.max(peak * 0.5 ** ((at - peakAt) / halfLifeMs), rms);
      peakAt = at;
      let midi = pitch ? nameOf(pitch, [sounding, candidate]) : undefined;
      // A new pitch far under the level of what was just played, with no attack,
      // is what is left ringing (an open string, the room), not a note.
      if (midi !== sounding && rms < peak * tail && at - lastOnset > attackMs) {
        pitch = null;
        midi = undefined;
      }

      if (onsetAt !== undefined && pitch && sounding === midi && onsetAt - soundingAt > restrikeMs)
        restrike = { at: onsetAt, midi: midi!, frames: 0 };
      else if (restrike) {
        if (midi !== restrike.midi) restrike = null;
        else if (++restrike.frames >= stableFrames) {
          on(restrike.midi, restrike.at, pitch!);
          restrike = null;
        }
      }

      if (pitch && midi !== undefined) {
        silentRun = 0;
        if (midi === candidate) candidateRun++;
        else {
          candidate = midi;
          candidateAt = at;
          candidateRun = 1;
        }
        if (midi !== sounding) {
          const slip =
            sounding !== undefined &&
            HARMONIC_STEPS.has(Math.abs(midi - sounding)) &&
            candidateAt - lastOnset > attackMs;
          const step =
            sounding !== undefined &&
            Math.abs(midi - sounding) === 1 &&
            candidateAt - lastOnset > attackMs;
          const need = slip ? harmonicFrames : step ? stepFrames : stableFrames;
          if (candidateRun >= need) on(midi, candidateAt, pitch);
        }
      } else {
        candidate = undefined;
        candidateRun = 0;
        if (++silentRun >= silentFrames) off(at);
      }
      return out;
    },
    /** An attack in a frame that is otherwise left out (the app's own click was in it). */
    attack(onsetAt: number) {
      lastOnset = onsetAt;
    },
    /** End the sounding note (the microphone stopped). */
    stop(at: number): TrackedNote[] {
      const out: TrackedNote[] =
        sounding === undefined ? [] : [{ kind: "noteoff", midi: sounding, at }];
      sounding = candidate = undefined;
      candidateRun = silentRun = 0;
      restrike = null;
      lastOnset = -Infinity;
      peak = 0;
      return out;
    },
  };
}

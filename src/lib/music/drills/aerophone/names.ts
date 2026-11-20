// One spelling per drill for every place a note is named (contradiction 9): the
// chip, the heard note, the fingering caption and the slip line all go through
// the speller the drill builds once. The player reads written notes, so a
// concert note is spelled at its written pitch.
import { noteName, showKeyName, showNote } from "@repo/music-core";
import fingerings from "@repo/music-core/data/aerophone-fingerings.json";
import { fingeringFor } from "@repo/music-core/content/winds-pads";
import { m } from "@repo/i18n/messages.js";

/** Concert MIDI to its written name: by the exercise key's signature (flats below 0, sharps otherwise), or the
 *  fingering chart's own spelling when the exercise has no key (`signature` null). */
export function aeroSpeller(shift: number, signature: number | null): (concert: number) => string {
  return (concert) => {
    const written = concert + shift;
    return signature === null
      ? (fingeringFor(written)?.name ?? noteName(written))
      : noteName(written, signature < 0 ? "flat" : "sharp");
  };
}

/** Each key as printed on the instrument, with where it sits in words (in the reader's language). The printed label
 *  (1, X, C1, Tc, the pinky keys' B or G#) stays as it is; the note a key is named for ("palm D") follows the naming. */
const KEY_LABELS: Record<string, () => string> = {
  k1: m.music_winds_key_k1,
  k2: m.music_winds_key_k2,
  k3: m.music_winds_key_k3,
  k4: m.music_winds_key_k4,
  k5: m.music_winds_key_k5,
  k6: m.music_winds_key_k6,
  X: () => m.music_winds_key_x({ note: showKeyName("F") }),
  P: () => m.music_winds_key_p({ note: showKeyName("Bb") }),
  C1: () => m.music_winds_key_c1({ note: showKeyName("D") }),
  C2: () => m.music_winds_key_c2({ note: showKeyName("Eb") }),
  C4: () => m.music_winds_key_c4({ note: showKeyName("F") }),
  C3: () => m.music_winds_key_c3({ note: showKeyName("E") }),
  Tc: () => m.music_winds_key_tc({ note: showKeyName("C") }),
  Ta: () => m.music_winds_key_ta({ note: showKeyName("Bb") }),
  Gs: m.music_winds_key_gs,
  Cs: m.music_winds_key_cs,
  B: m.music_winds_key_b,
  Bb: m.music_winds_key_bb,
  Eb: m.music_winds_key_eb,
  C: m.music_winds_key_c,
  Tf: () => m.music_winds_key_tf({ note: showKeyName("F#") }),
  C5: () => m.music_winds_key_c5({ note: showKeyName("F#") }),
  "oct+2": m.music_winds_key_oct_up2,
  "oct+1": m.music_winds_key_oct_up1,
  "oct-1": m.music_winds_key_oct_down1,
  "oct-2": m.music_winds_key_oct_down2,
};

const keyLabel = (id: string) =>
  KEY_LABELS[id]?.() ?? fingerings.keys.find((k) => k.id === id)?.label ?? id;

/** The keys a written note is fingered with, in words ("1 (left index), 2 (left middle)"); null outside the chart. */
export function fingeringWords(written: number): string | null {
  const f = fingeringFor(written);
  if (!f) return null;
  return (
    [f.octave ? keyLabel("oct+1") : "", ...f.keys.map(keyLabel)].filter(Boolean).join(", ") ||
    m.music_winds_names_all_open()
  );
}

/** A note name or a bare letter, with its accidental and octave, standing alone in a label ("G4 A4", "C#5 to D5", "C to G"). */
const NOTE_IN_TEXT = /(?<![\p{L}\p{N}#♯♭])[A-G](?:##|bb|#|b|♯|♭)?(?:-?\d)?(?![\p{L}\p{N}#♯♭])/gu;

/**
 * The notes in a label built elsewhere ("G4 A4", "C#5 to D5", "C to G", "Alto Eb") as the user reads note names; with
 * letters the text comes back unchanged. Only for labels made of notes and a few words: a capital "A" standing alone
 * (Spanish "A la…") would read as a note.
 */
export const namedNotes = (text: string) => text.replace(NOTE_IN_TEXT, (name) => showNote(name));

/** The same for key names ("Alto Eb", "C"): keys are absolute, so movable do names them as fixed do. */
export const namedKeys = (text: string) => text.replace(NOTE_IN_TEXT, (name) => showKeyName(name));

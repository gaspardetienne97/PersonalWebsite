// One spelling per drill for every place a note is named (contradiction 9): the
// chip, the heard note, the fingering caption and the slip line all go through
// the speller the drill builds once. The player reads written notes, so a
// concert note is spelled at its written pitch.
import { noteName } from "@repo/music-core";
import fingerings from "@repo/music-core/data/aerophone-fingerings.json";
import { fingeringFor } from "@repo/music-core/content/winds-pads";

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

const keyLabel = (id: string) => fingerings.keys.find((k) => k.id === id)?.label ?? id;

/** The keys a written note is fingered with, in words ("1 (left index), 2 (left middle)"); null outside the chart. */
export function fingeringWords(written: number): string | null {
  const f = fingeringFor(written);
  if (!f) return null;
  return (
    [f.octave ? keyLabel("oct+1") : "", ...f.keys.map(keyLabel)].filter(Boolean).join(", ") ||
    "all keys open"
  );
}

// One spelling per drill for every place a note is named (contradiction 9): the
// chip, the heard note, the fingering caption and the slip line all go through
// the speller the drill builds once. The player reads written notes, so a
// concert note is spelled at its written pitch.
import { noteName } from "@repo/music-core";
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

/** Each key as printed on the instrument, with where it sits in words (in the reader's language). */
const KEY_LABELS: Record<string, () => string> = {
  k1: m.music_winds_key_k1,
  k2: m.music_winds_key_k2,
  k3: m.music_winds_key_k3,
  k4: m.music_winds_key_k4,
  k5: m.music_winds_key_k5,
  k6: m.music_winds_key_k6,
  X: m.music_winds_key_x,
  P: m.music_winds_key_p,
  C1: m.music_winds_key_c1,
  C2: m.music_winds_key_c2,
  C4: m.music_winds_key_c4,
  C3: m.music_winds_key_c3,
  Tc: m.music_winds_key_tc,
  Ta: m.music_winds_key_ta,
  Gs: m.music_winds_key_gs,
  Cs: m.music_winds_key_cs,
  B: m.music_winds_key_b,
  Bb: m.music_winds_key_bb,
  Eb: m.music_winds_key_eb,
  C: m.music_winds_key_c,
  Tf: m.music_winds_key_tf,
  C5: m.music_winds_key_c5,
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

// Pitch basics shared by every module. MIDI 60 = C4, A4 = 69.

export const SHARP_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;
export const FLAT_NAMES = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
] as const;

export const pc = (midi: number) => ((Math.round(midi) % 12) + 12) % 12;
export const octaveOf = (midi: number) => Math.floor(Math.round(midi) / 12) - 1;

/** "C4", "Eb4" (flats by default: the app's keys are mostly flat-side jazz keys). */
export function noteName(
  midi: number,
  prefer: "flat" | "sharp" = "flat",
  withOctave = true,
): string {
  const names = prefer === "flat" ? FLAT_NAMES : SHARP_NAMES;
  return names[pc(midi)] + (withOctave ? String(octaveOf(midi)) : "");
}

const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Parse "C#4", "Bb3", "Eb" (octave optional, defaults to 4). Returns MIDI or null. */
export function parseNote(name: string): number | null {
  const m = /^([A-Ga-g])(#{1,2}|b{1,2}|♯|♭)?(-?\d)?$/.exec(name.trim());
  if (!m) return null;
  const letter = m[1].toUpperCase();
  const acc = m[2] ?? "";
  const shift = acc.replace("♯", "#").replace("♭", "b");
  const delta = shift.startsWith("#") ? shift.length : shift.startsWith("b") ? -shift.length : 0;
  const octave = m[3] === undefined ? 4 : Number(m[3]);
  return (octave + 1) * 12 + LETTER_PC[letter] + delta;
}

/** Pitch-class of a note name without octave ("Bb" -> 10). */
export function pcOf(name: string): number | null {
  const midi = parseNote(name.replace(/-?\d+$/, ""));
  return midi === null ? null : pc(midi);
}

export const midiToHz = (midi: number, a4 = 440) => a4 * 2 ** ((midi - 69) / 12);
export const hzToMidiFloat = (hz: number, a4 = 440) => 69 + 12 * Math.log2(hz / a4);

/** Nearest MIDI note and the signed cents from it. */
export function hzToNote(hz: number, a4 = 440): { midi: number; cents: number } {
  const f = hzToMidiFloat(hz, a4);
  const midi = Math.round(f);
  return { midi, cents: (f - midi) * 100 };
}

export const isBlackKey = (midi: number) => [1, 3, 6, 8, 10].includes(pc(midi));

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const clamp01 = (v: number) => clamp(v, 0, 1);

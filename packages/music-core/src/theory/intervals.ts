// The 12 interval tokens the ear drills and skill graph use (pitch.interval.<token>).

export const INTERVALS = [
  { token: "m2", semitones: 1, name: "Minor 2nd" },
  { token: "M2", semitones: 2, name: "Major 2nd" },
  { token: "m3", semitones: 3, name: "Minor 3rd" },
  { token: "M3", semitones: 4, name: "Major 3rd" },
  { token: "P4", semitones: 5, name: "Perfect 4th" },
  { token: "TT", semitones: 6, name: "Tritone" },
  { token: "P5", semitones: 7, name: "Perfect 5th" },
  { token: "m6", semitones: 8, name: "Minor 6th" },
  { token: "M6", semitones: 9, name: "Major 6th" },
  { token: "m7", semitones: 10, name: "Minor 7th" },
  { token: "M7", semitones: 11, name: "Major 7th" },
  { token: "P8", semitones: 12, name: "Octave" },
] as const;

export type IntervalToken = (typeof INTERVALS)[number]["token"];
export type IntervalDef = (typeof INTERVALS)[number];

export const intervalByToken = (token: string) => INTERVALS.find((i) => i.token === token);
export const intervalBySemitones = (semitones: number) =>
  INTERVALS.find((i) => i.semitones === semitones);

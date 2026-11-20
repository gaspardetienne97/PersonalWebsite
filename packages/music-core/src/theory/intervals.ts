// The 12 interval tokens the ear drills and skill graph use (pitch.interval.<token>).

import { m } from "@repo/i18n/messages.js";

export const INTERVALS = [
  { token: "m2", semitones: 1, name: m.music_content_interval_m2() },
  { token: "M2", semitones: 2, name: m.music_content_interval_maj2() },
  { token: "m3", semitones: 3, name: m.music_content_interval_m3() },
  { token: "M3", semitones: 4, name: m.music_content_interval_maj3() },
  { token: "P4", semitones: 5, name: m.music_content_interval_p4() },
  { token: "TT", semitones: 6, name: m.music_content_interval_tt() },
  { token: "P5", semitones: 7, name: m.music_content_interval_p5() },
  { token: "m6", semitones: 8, name: m.music_content_interval_m6() },
  { token: "M6", semitones: 9, name: m.music_content_interval_maj6() },
  { token: "m7", semitones: 10, name: m.music_content_interval_m7() },
  { token: "M7", semitones: 11, name: m.music_content_interval_maj7() },
  { token: "P8", semitones: 12, name: m.music_content_interval_p8() },
] as const;

export type IntervalToken = (typeof INTERVALS)[number]["token"];
export type IntervalDef = (typeof INTERVALS)[number];

export const intervalByToken = (token: string) => INTERVALS.find((i) => i.token === token);
export const intervalBySemitones = (semitones: number) =>
  INTERVALS.find((i) => i.semitones === semitones);

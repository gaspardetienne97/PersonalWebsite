import type { NoteEvent, NoteOnEvent } from "@repo/music-core/domain";
import { chordNotes, midiToNote, pitchClass, scaleNotes } from "@repo/music-core/engines/theory";

export type ToneRole = "chord" | "scale" | "avoid";

export interface TargetTone {
  pitchClass: number;
  note: string;
  role: ToneRole;
}

export interface JamChord {
  symbol: string;
  roman: string;
  scale: string;
  bars: number;
}

export interface JamProgression {
  id: string;
  name: string;
  key: string;
  style: "jazz" | "blues" | "modal";
  chords: JamChord[];
}

export const JAM_PROGRESSIONS: JamProgression[] = [
  {
    id: "ii-v-i",
    name: "ii–V–I",
    key: "C major",
    style: "jazz",
    chords: [
      { symbol: "Dm7", roman: "ii", scale: "D dorian", bars: 2 },
      { symbol: "G7", roman: "V", scale: "G mixolydian", bars: 2 },
      { symbol: "Cmaj7", roman: "I", scale: "C major", bars: 2 },
      { symbol: "A7", roman: "VI", scale: "A mixolydian", bars: 2 },
    ],
  },
  {
    id: "minor-ii-v-i",
    name: "Minor ii–V–i",
    key: "C minor",
    style: "jazz",
    chords: [
      { symbol: "Dm7b5", roman: "iiø", scale: "D locrian", bars: 2 },
      { symbol: "G7alt", roman: "V7alt", scale: "G altered", bars: 2 },
      { symbol: "Cm7", roman: "i", scale: "C dorian", bars: 2 },
    ],
  },
  {
    id: "blues",
    name: "12-bar blues",
    key: "C",
    style: "blues",
    chords: [
      { symbol: "C7", roman: "I7", scale: "C mixolydian", bars: 4 },
      { symbol: "F7", roman: "IV7", scale: "F mixolydian", bars: 2 },
      { symbol: "C7", roman: "I7", scale: "C mixolydian", bars: 2 },
      { symbol: "G7", roman: "V7", scale: "G mixolydian", bars: 2 },
      { symbol: "C7", roman: "I7", scale: "C mixolydian", bars: 2 },
    ],
  },
  {
    id: "modal",
    name: "Modal vamp",
    key: "D dorian",
    style: "modal",
    chords: [
      { symbol: "Dm7", roman: "i", scale: "D dorian", bars: 4 },
      { symbol: "Em7", roman: "ii", scale: "E dorian", bars: 4 },
    ],
  },
];

/** Roles for all 12 pitch classes against the current chord + scale. */
export function targetTones(chordSymbol: string, scaleName: string): TargetTone[] {
  const chordPitchClasses = new Set(chordNotes(chordSymbol).map((name) => pitchClass(name)));
  const scalePitchClasses = new Set(scaleNotes(scaleName).map((name) => pitchClass(name)));

  return Array.from({ length: 12 }, (_, pitchClass) => {
    let role: ToneRole;
    if (chordPitchClasses.has(pitchClass)) role = "chord";
    else if (scalePitchClasses.has(pitchClass)) role = "scale";
    else role = "avoid";
    return { pitchClass, note: midiToNote(60 + pitchClass), role };
  });
}

export class JamSession {
  #progression: JamProgression;
  #index = 0;
  #recorded: NoteOnEvent[] = [];

  constructor(progression: JamProgression) {
    this.#progression = progression;
  }

  get progression(): JamProgression {
    return this.#progression;
  }

  get index(): number {
    return this.#index;
  }

  get current(): JamChord {
    return this.#progression.chords[this.#index]!;
  }

  get next(): JamChord {
    const chords = this.#progression.chords;
    return chords[(this.#index + 1) % chords.length]!;
  }

  advance(): JamChord {
    this.#index = (this.#index + 1) % this.#progression.chords.length;
    return this.current;
  }

  reset(): void {
    this.#index = 0;
  }

  targetTones(): TargetTone[] {
    return targetTones(this.current.symbol, this.current.scale);
  }

  record(event: NoteEvent): void {
    if (event.type === "noteOn") this.#recorded.push(event);
  }

  recorded(): NoteOnEvent[] {
    return [...this.#recorded];
  }

  clearRecording(): void {
    this.#recorded = [];
  }
}

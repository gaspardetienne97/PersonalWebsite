const NOTE_TO_PC: Record<string, number> = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const INTERVALS = ["P1", "m2", "M2", "m3", "M3", "P4", "TT", "P5", "m6", "M6", "m7", "M7"];

const CHORD_INTERVALS: Record<string, number[]> = {
  "": [0, 4, 7],
  m: [0, 3, 7],
  min: [0, 3, 7],
  maj7: [0, 4, 7, 11],
  M7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  min7: [0, 3, 7, 10],
  "7": [0, 4, 7, 10],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
};

const SCALE_INTERVALS: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  ionian: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  blues: [0, 3, 5, 6, 7, 10],
};

export function noteToMidi(note: string): number {
  const match = /^([A-G](?:#|b)?)(-?\d+)$/.exec(note.trim());
  if (!match) throw new Error(`Invalid note: ${note}`);
  const [, name, octaveText] = match;
  const pitchClass = NOTE_TO_PC[name!];
  if (pitchClass === undefined) throw new Error(`Invalid note name: ${name}`);
  return (Number(octaveText) + 1) * 12 + pitchClass;
}

export function midiToNote(midi: number, preferFlats = false): string {
  const rounded = Math.round(midi);
  const octave = Math.floor(rounded / 12) - 1;
  const names = preferFlats ? FLAT_NAMES : SHARP_NAMES;
  return `${names[((rounded % 12) + 12) % 12]}${octave}`;
}

export function frequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function intervalBetween(from: string | number, to: string | number): string {
  const a = typeof from === "number" ? from : noteToMidi(from);
  const b = typeof to === "number" ? to : noteToMidi(to);
  return INTERVALS[(((b - a) % 12) + 12) % 12]!;
}

export function transpose(note: string, semitones: number): string {
  const preferFlats = note.includes("b");
  return midiToNote(noteToMidi(note) + semitones, preferFlats);
}

export function chordNotes(symbol: string): string[] {
  const match = /^([A-G](?:#|b)?)(.*)$/.exec(symbol.trim());
  if (!match) throw new Error(`Invalid chord symbol: ${symbol}`);
  const [, root, qualityText] = match;
  const quality = normalizeQuality(qualityText ?? "");
  const intervals = CHORD_INTERVALS[quality];
  if (!intervals) throw new Error(`Unsupported chord quality: ${symbol}`);
  const rootPc = NOTE_TO_PC[root!];
  if (rootPc === undefined) throw new Error(`Invalid chord root: ${root}`);
  const preferFlats = root!.includes("b") || ["F", "Bb", "Eb", "Ab", "Db", "Gb"].includes(root!);
  return intervals.map((interval) => pitchClassName(rootPc + interval, preferFlats));
}

export function scaleNotes(name: string): string[] {
  const [root, ...kindParts] = name.trim().split(/\s+/);
  const kind = kindParts.join(" ").toLowerCase();
  const intervals = SCALE_INTERVALS[kind];
  const rootPc = NOTE_TO_PC[root ?? ""];
  if (rootPc === undefined || !intervals) throw new Error(`Unsupported scale: ${name}`);
  const preferFlats = root.includes("b") || ["F", "Bb", "Eb", "Ab", "Db", "Gb"].includes(root);
  return intervals.map((interval) => pitchClassName(rootPc + interval, preferFlats));
}

export function romanNumeral(_chord: string, _key: string): string {
  return "I";
}

function normalizeQuality(quality: string): string {
  if (quality === "maj") return "";
  if (quality === "major") return "";
  if (quality === "minor") return "m";
  return quality;
}

function pitchClassName(value: number, preferFlats: boolean): string {
  const names = preferFlats ? FLAT_NAMES : SHARP_NAMES;
  return names[((value % 12) + 12) % 12]!;
}

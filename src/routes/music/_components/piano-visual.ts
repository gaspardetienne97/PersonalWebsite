import { midiToNote, noteToMidi } from "@repo/music-core/engines/theory";

const NATURAL_INDEX = new Map([
  ["C", 0],
  ["D", 1],
  ["E", 2],
  ["F", 3],
  ["G", 4],
  ["A", 5],
  ["B", 6],
]);

const BLACK_KEY_BASE = new Map([
  ["C#", "C"],
  ["D#", "D"],
  ["F#", "F"],
  ["G#", "G"],
  ["A#", "A"],
]);

export interface PianoOctaveRange {
  startOctave: number;
  endOctave: number;
}

export interface PianoFingerMarker {
  midiNote: number;
  note: string;
  finger: number;
  leftPercent: number;
}

export function noteName(midiNote: number): string {
  return midiToNote(midiNote);
}

export function noteLabel(midiNote: number): string {
  return noteName(midiNote).replace(/\d+$/, "");
}

export function noteMidi(note: string): number {
  return noteToMidi(note);
}

export function noteOctave(note: string): number | undefined {
  const octave = Number.parseInt(note.match(/(-?\d+)$/)?.[1] ?? "", 10);
  return Number.isFinite(octave) ? octave : undefined;
}

export function pianoOctaveRange(notes: string[], fallback: PianoOctaveRange): PianoOctaveRange {
  const octaves = notes.map(noteOctave).filter((value): value is number => value !== undefined);
  if (octaves.length === 0) return fallback;
  return {
    startOctave: Math.max(0, Math.min(...octaves)),
    endOctave: Math.min(8, Math.max(...octaves)),
  };
}

export function midiOctaveRange(midiNotes: number[], fallback: PianoOctaveRange): PianoOctaveRange {
  return pianoOctaveRange(midiNotes.map(noteName), fallback);
}

export function pianoFingerMarkers(
  fingerings: Record<number, number> | undefined,
  range: PianoOctaveRange,
): PianoFingerMarker[] {
  if (!fingerings) return [];
  return Object.entries(fingerings)
    .map(([midi, finger]) => {
      const midiNote = Number(midi);
      const note = noteName(midiNote);
      return {
        midiNote,
        note,
        finger,
        leftPercent: pianoKeyLeftPercent(note, range),
      };
    })
    .filter((marker) => Number.isFinite(marker.leftPercent))
    .sort((left, right) => left.midiNote - right.midiNote);
}

export function suggestedFingerings(
  midiNotes: number[],
  hand: "left" | "right" | "both" | undefined,
): Record<number, number> {
  const unique = [...new Set(midiNotes)].sort((left, right) => left - right);
  return Object.fromEntries(
    unique.map((midiNote, index) => [
      midiNote,
      hand === "left" ? Math.max(1, 5 - index) : Math.min(5, index + 1),
    ]),
  );
}

function pianoKeyLeftPercent(note: string, range: PianoOctaveRange): number {
  const { startOctave, endOctave } = range;
  const pitch = note.replace(/\d+$/, "");
  const octave = noteOctave(note);
  if (octave === undefined || octave < startOctave || octave > endOctave) return Number.NaN;

  const whiteCount = (endOctave - startOctave + 1) * 7;
  const unit = 100 / whiteCount;
  const natural = BLACK_KEY_BASE.get(pitch) ?? pitch;
  const naturalIndex = NATURAL_INDEX.get(natural);
  if (naturalIndex === undefined) return Number.NaN;

  const whiteIndex = (octave - startOctave) * 7 + naturalIndex;
  return BLACK_KEY_BASE.has(pitch) ? (whiteIndex + 1) * unit : (whiteIndex + 0.5) * unit;
}

import { Chord, Interval, Midi, Note, Progression, Scale } from "tonal";

export function noteToMidi(note: string): number {
  const midi = Note.midi(note.trim());
  if (midi === null) throw new Error(`Invalid note: ${note}`);
  return midi;
}

export function midiToNote(midi: number, preferFlats = false): string {
  return preferFlats ? Note.fromMidi(midi) : Note.fromMidiSharps(midi);
}

/** Pitch class (0-11) for a note name, with or without an octave. */
export function pitchClass(note: string): number {
  const chroma = Note.chroma(note.trim());
  if (chroma === undefined) throw new Error(`Invalid note: ${note}`);
  return chroma;
}

export function frequency(midi: number): number {
  return Midi.midiToFreq(midi);
}

export function intervalBetween(from: string | number, to: string | number): string {
  const a = typeof from === "number" ? from : noteToMidi(from);
  const b = typeof to === "number" ? to : noteToMidi(to);
  const interval = Interval.fromSemitones((((b - a) % 12) + 12) % 12);
  if (interval === "4A" || interval === "5d") return "TT";
  return interval.replace(/^(\d+)([PMAmd])$/, "$2$1");
}

export function transpose(note: string, semitones: number): string {
  const transposed = Note.transpose(note.trim(), Interval.fromSemitones(semitones));
  if (!transposed) throw new Error(`Invalid note: ${note}`);
  return transposed;
}

export function chordNotes(symbol: string): string[] {
  const chord = Chord.get(symbol.trim());
  if (chord.empty) throw new Error(`Unsupported chord: ${symbol}`);
  return chord.notes;
}

export function scaleNotes(name: string): string[] {
  const scale = Scale.get(name.trim());
  if (scale.empty) throw new Error(`Unsupported scale: ${name}`);
  return scale.notes;
}

export function romanNumeral(chord: string, key: string): string {
  const numeral = Progression.toRomanNumerals(key.trim(), [chord.trim()])[0];
  if (!numeral) throw new Error(`Cannot express ${chord} in ${key}`);
  return numeral;
}

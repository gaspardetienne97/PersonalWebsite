/**
 * computeChroma — a 12-bin pitch-class energy vector for one audio frame.
 *
 * Uses the Goertzel algorithm to read energy at the exact target pitch
 * frequencies across a few octaves and folds them into 12 pitch classes. This
 * avoids adding an FFT dependency and stays a pure, testable function (the
 * streaming glue lives in Phase 2). Normalized so the strongest class is 1.
 *
 * The per-note scan is `computeNoteEnergies`; chroma is one fold of that bank.
 * There is exactly one Goertzel scan per frame, and the note gate reads the
 * same published bank rather than rescanning it.
 */

export interface ChromaOptions {
  sampleRate: number;
  /** Lowest MIDI note probed (default 40 = E2). */
  minMidi?: number;
  /** Highest MIDI note probed (default 88 = E6). */
  maxMidi?: number;
}

/** Goertzel power per probed MIDI note, indexed by `midi - minMidi`. */
export interface NoteEnergyBank {
  minMidi: number;
  maxMidi: number;
  energies: Float32Array;
}

export function computeNoteEnergies(frame: Float32Array, options: ChromaOptions): NoteEnergyBank {
  const minMidi = options.minMidi ?? 40;
  const maxMidi = options.maxMidi ?? 88;
  const energies = new Float32Array(Math.max(0, maxMidi - minMidi + 1));

  for (let midi = minMidi; midi <= maxMidi; midi++) {
    const frequency = 440 * 2 ** ((midi - 69) / 12);
    energies[midi - minMidi] = goertzelPower(frame, frequency, options.sampleRate);
  }

  return { minMidi, maxMidi, energies };
}

/** Bank energy at `midi`, or 0 outside the probed range. */
export function noteEnergy(bank: NoteEnergyBank, midi: number): number {
  if (midi < bank.minMidi || midi > bank.maxMidi) return 0;
  return bank.energies[midi - bank.minMidi] ?? 0;
}

/** Folds a note-energy bank into the 12 pitch classes, peak-normalized. */
export function chromaFromNoteEnergies(bank: NoteEnergyBank): Float32Array {
  const chroma = new Float32Array(12);

  for (let midi = bank.minMidi; midi <= bank.maxMidi; midi++) {
    chroma[midi % 12]! += bank.energies[midi - bank.minMidi]!;
  }

  let max = 0;
  for (const value of chroma) if (value > max) max = value;
  if (max > 0) for (let i = 0; i < 12; i++) chroma[i]! /= max;
  return chroma;
}

export function computeChroma(frame: Float32Array, options: ChromaOptions): Float32Array {
  return chromaFromNoteEnergies(computeNoteEnergies(frame, options));
}

/** Pitch classes whose normalized chroma energy clears `threshold` (ascending). */
export function chromaToPitchClasses(chroma: Float32Array, threshold = 0.5): number[] {
  const out: number[] = [];
  for (let pitchClass = 0; pitchClass < 12; pitchClass++) {
    if ((chroma[pitchClass] ?? 0) >= threshold) out.push(pitchClass);
  }
  return out;
}

/** Generalized Goertzel power at `frequency` over the frame. */
function goertzelPower(frame: Float32Array, frequency: number, sampleRate: number): number {
  const k = (frequency / sampleRate) * frame.length;
  const omega = (2 * Math.PI * k) / frame.length;
  const coeff = 2 * Math.cos(omega);
  let s1 = 0;
  let s2 = 0;
  for (let n = 0; n < frame.length; n++) {
    const s0 = frame[n]! + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return s1 * s1 + s2 * s2 - coeff * s1 * s2;
}

import { describe, expect, test } from "vitest";

import {
  chromaFromNoteEnergies,
  chromaToPitchClasses,
  computeChroma,
  computeNoteEnergies,
  noteEnergy,
} from "./chroma";

const SAMPLE_RATE = 44_100;
const SIZE = 2048;

function tone(freqs: number[]): Float32Array {
  const frame = new Float32Array(SIZE);
  for (let n = 0; n < SIZE; n++) {
    const t = n / SAMPLE_RATE;
    let sum = 0;
    for (const freq of freqs) sum += Math.sin(2 * Math.PI * freq * t);
    frame[n] = sum / freqs.length;
  }
  return frame;
}

describe("computeChroma", () => {
  test("concentrates energy in the played pitch class", () => {
    // 440 Hz = A = pitch class 9.
    const chroma = computeChroma(tone([440]), { sampleRate: SAMPLE_RATE });
    const argmax = [...chroma].indexOf(Math.max(...chroma));
    expect(argmax).toBe(9);
  });

  test("ranks a C-major triad's tones highest", () => {
    // C4 261.63 (pc 0), E4 329.63 (pc 4), G4 392.00 (pc 7).
    const chroma = computeChroma(tone([261.63, 329.63, 392.0]), { sampleRate: SAMPLE_RATE });
    const top3 = [...chroma.keys()]
      .sort((a, b) => chroma[b]! - chroma[a]!)
      .slice(0, 3)
      .sort((a, b) => a - b);
    expect(top3).toEqual([0, 4, 7]);
  });

  test("returns all zeros for silence", () => {
    expect([...computeChroma(new Float32Array(SIZE), { sampleRate: SAMPLE_RATE })]).toEqual(
      Array.from({ length: 12 }, () => 0),
    );
  });
});

describe("computeNoteEnergies", () => {
  test("one scan feeds both chroma and the gate: folding the bank is byte-identical chroma", () => {
    const frame = tone([261.63, 329.63, 392.0]);
    const bank = computeNoteEnergies(frame, { sampleRate: SAMPLE_RATE });
    expect(bank.minMidi).toBe(40);
    expect(bank.maxMidi).toBe(88);
    expect(bank.energies).toHaveLength(49);
    expect([...chromaFromNoteEnergies(bank)]).toEqual([
      ...computeChroma(frame, { sampleRate: SAMPLE_RATE }),
    ]);
  });

  test("peaks at the played MIDI note and reads zero outside the band", () => {
    const bank = computeNoteEnergies(tone([440]), { sampleRate: SAMPLE_RATE });
    const loudest = [...bank.energies].indexOf(Math.max(...bank.energies)) + bank.minMidi;
    expect(loudest).toBe(69);
    expect(noteEnergy(bank, 39)).toBe(0);
    expect(noteEnergy(bank, 89)).toBe(0);
    expect(noteEnergy(bank, 69)).toBe(bank.energies[29]);
  });
});

describe("chromaToPitchClasses", () => {
  test("keeps pitch classes at or above the threshold", () => {
    const chroma = new Float32Array(12).fill(0.1);
    chroma[0] = 1;
    chroma[4] = 0.8;
    chroma[7] = 0.6;
    expect(chromaToPitchClasses(chroma, 0.5)).toEqual([0, 4, 7]);
  });

  test("returns empty when nothing clears the threshold", () => {
    expect(chromaToPitchClasses(new Float32Array(12).fill(0.2), 0.5)).toEqual([]);
  });
});

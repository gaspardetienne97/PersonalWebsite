import { describe, expect, test } from "vitest";

import {
  centsBetween,
  detectPitch,
  frequencyToMidi,
  intonationZone,
  midiToFrequency,
  tunerReading,
} from "./index";

const SAMPLE_RATE = 44100;

/** A mono buffer of a pure sine at `freq` Hz (optionally summed with harmonics). */
function sine(freq: number, length = 4096, harmonics: number[] = []): Float32Array {
  const buf = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    let v = Math.sin(2 * Math.PI * freq * t);
    for (let h = 0; h < harmonics.length; h++) {
      v += harmonics[h] * Math.sin(2 * Math.PI * freq * (h + 2) * t);
    }
    buf[i] = v;
  }
  return buf;
}

describe("frequency <-> midi", () => {
  test("A4 = 440 Hz is MIDI 69", () => {
    expect(frequencyToMidi(440)).toBeCloseTo(69, 6);
    expect(midiToFrequency(69)).toBeCloseTo(440, 6);
  });

  test("roundtrips across the range", () => {
    for (const midi of [40, 55, 60, 72, 88]) {
      expect(frequencyToMidi(midiToFrequency(midi))).toBeCloseTo(midi, 6);
    }
  });

  test("an octave is 1200 cents, a semitone 100", () => {
    expect(centsBetween(880, 440)).toBeCloseTo(1200, 6);
    expect(centsBetween(midiToFrequency(61), midiToFrequency(60))).toBeCloseTo(100, 6);
  });

  test("honours an alternate A4 reference", () => {
    expect(frequencyToMidi(442, 442)).toBeCloseTo(69, 6);
  });
});

describe("detectPitch", () => {
  test("finds a pure tone within a couple cents", () => {
    for (const freq of [110, 220, 440, 660]) {
      const { frequency, clarity } = detectPitch(sine(freq), { sampleRate: SAMPLE_RATE });
      expect(Math.abs(centsBetween(frequency, freq))).toBeLessThan(5);
      expect(clarity).toBeGreaterThan(0.9);
    }
  });

  test("locks onto the fundamental of a harmonic-rich tone", () => {
    // A2 (110 Hz) with strong 2nd/3rd/4th harmonics — must not pick an octave.
    const buf = sine(110, 4096, [0.6, 0.4, 0.3]);
    const { frequency } = detectPitch(buf, { sampleRate: SAMPLE_RATE });
    expect(Math.abs(centsBetween(frequency, 110))).toBeLessThan(10);
  });

  test("returns no pitch for silence", () => {
    expect(detectPitch(new Float32Array(4096), { sampleRate: SAMPLE_RATE })).toEqual({
      frequency: 0,
      clarity: 0,
    });
  });

  test("never reports a pitch outside the configured bounds", () => {
    // A 440 Hz tone capped at 300 Hz folds to its in-band subharmonic (220 Hz)
    // rather than being reported out of range.
    const capped = detectPitch(sine(440), { sampleRate: SAMPLE_RATE, maxFrequency: 300 });
    expect(capped.frequency).toBeLessThanOrEqual(300);
    expect(capped.frequency).toBeGreaterThan(0);

    // With the whole tone and its subharmonics below the floor, nothing is found.
    const floored = detectPitch(sine(440), { sampleRate: SAMPLE_RATE, minFrequency: 600 });
    expect(floored.frequency).toBe(0);
  });
});

describe("tunerReading", () => {
  test("names the note and reports near-zero cents for an in-tune A4", () => {
    const reading = tunerReading({ frequency: 440, clarity: 0.99 });
    expect(reading).not.toBeNull();
    expect(reading?.name).toBe("A4");
    expect(reading?.midi).toBe(69);
    expect(Math.abs(reading?.cents ?? 99)).toBeLessThan(1);
    expect(reading?.zone).toBe("in-tune");
    expect(reading?.inTune).toBe(true);
  });

  test("reports flat when below the target", () => {
    const reading = tunerReading({ frequency: 436, clarity: 0.95 });
    expect(reading?.note).toBe("A");
    expect(reading?.cents).toBeLessThan(0);
    expect(reading?.zone).toBe("flat");
    expect(reading?.inTune).toBe(false);
  });

  test("reports sharp when above the target", () => {
    const reading = tunerReading({ frequency: 446, clarity: 0.95 });
    expect(reading?.cents).toBeGreaterThan(0);
    expect(reading?.zone).toBe("sharp");
  });

  test("rejects frames below the clarity floor", () => {
    expect(tunerReading({ frequency: 440, clarity: 0.3 })).toBeNull();
    expect(tunerReading({ frequency: 0, clarity: 0.9 })).toBeNull();
  });

  test("computes octaves across C boundaries", () => {
    expect(tunerReading({ frequency: midiToFrequency(60), clarity: 0.9 })?.name).toBe("C4");
    expect(tunerReading({ frequency: midiToFrequency(48), clarity: 0.9 })?.name).toBe("C3");
    expect(tunerReading({ frequency: midiToFrequency(71), clarity: 0.9 })?.name).toBe("B4");
  });

  test("widens the in-tune window with toleranceCents", () => {
    const reading = tunerReading({ frequency: 437.5, clarity: 0.9 }, { toleranceCents: 12 });
    expect(reading?.zone).toBe("in-tune");
  });
});

describe("intonationZone", () => {
  test("maps cents to flat / in-tune / sharp", () => {
    expect(intonationZone(-20)).toBe("flat");
    expect(intonationZone(0)).toBe("in-tune");
    expect(intonationZone(20)).toBe("sharp");
    expect(intonationZone(4)).toBe("in-tune");
    expect(intonationZone(6)).toBe("sharp");
  });
});

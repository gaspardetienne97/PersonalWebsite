import { describe, expect, it } from "vitest";
import { midiToHz } from "../theory/notes";
import { identifyChord } from "../theory/chords";
import { explainPeaks, framesWindow, readChord, spectralPeaks } from "./chord";
import { CHORD_SAMPLE_RATE, chroma } from "./chroma";
import { rng, synth, type Partial } from "./fixtures";

const SR = CHORD_SAMPLE_RATE;
/** A string: `amps` are the levels of partials 1, 2, 3... relative to `level`. */
const string = (midi: number, level = 0.1, amps = [1, 0.6, 0.4, 0.25, 0.15, 0.1]): Partial[] =>
  amps.map((a, i) => ({ hz: midiToHz(midi) * (i + 1), amp: level * a, phase: i * 0.7 + midi }));
const ring = (partials: Partial[], seconds = 0.6, noise = 0.0005) =>
  synth(SR, seconds, partials, { noise, seed: 5 });
const names = (pcs: number[]) => identifyChord(pcs)[0]?.symbol;

// Guitar shapes as MIDI notes, low string first.
const OPEN_G = [43, 47, 50, 55, 59, 67]; // 320003
const OPEN_C = [48, 52, 55, 60, 64]; // x32010
const OPEN_AM = [45, 52, 57, 60, 64]; // x02210
const OPEN_EM = [40, 47, 52, 55, 59, 64]; // 022000
const OPEN_D = [50, 57, 62, 66]; // xx0232

describe("readChord", () => {
  it("reads G B D from an open G whose D string is 20 dB under the rest", () => {
    // The owner's bug: 320003 has G on three strings, B on two and D on one.
    const levels = [0.1, 0.1, 0.01, 0.1, 0.1, 0.1];
    const buf = ring(OPEN_G.flatMap((m, i) => string(m, levels[i])));
    expect(readChord(buf, SR).pcs).toEqual([2, 7, 11]);
    // The old reading, for the record: power chroma leaves D far under any usable cut.
    expect(chroma(buf, SR)[2]).toBeLessThan(0.2);
  });

  it.each([
    ["C", OPEN_C, [0, 4, 7]],
    ["Am", OPEN_AM, [0, 4, 9]],
    ["Em", OPEN_EM, [4, 7, 11]],
    ["D", OPEN_D, [2, 6, 9]],
  ])("reads the open %s shape and names it", (symbol, shape, pcs) => {
    const r = readChord(ring(shape.flatMap((m) => string(m))), SR);
    expect(r.pcs).toEqual(pcs);
    expect(names(r.pcs)).toBe(symbol);
  });

  it("does not hear harmonics as notes on a mic that loses the bass", () => {
    // Fundamentals 20 dB down, third partial strongest: a C chord whose loudest
    // peak is the B two octaves up (third partial of the open E string).
    const thin = [0.1, 0.5, 1, 0.5, 0.3, 0.2];
    const r = readChord(ring(OPEN_C.flatMap((m) => string(m, 0.05, thin))), SR);
    expect(r.pcs).toEqual([0, 4, 7]);
    expect(r.chroma[11]).toBeGreaterThan(0.2); // the B is in the spectrum, and explained
  });

  it("reads a seventh chord and a suspended chord as what they are", () => {
    expect(readChord(ring([55, 59, 62, 65].flatMap((m) => string(m))), SR).pcs).toEqual([
      2, 5, 7, 11,
    ]);
    expect(readChord(ring([50, 57, 62, 67].flatMap((m) => string(m))), SR).pcs).toEqual([2, 7, 9]);
  });

  it("reads a piano triad in close position, the fifth kept", () => {
    const piano = (m: number) => string(m, 0.1, [1, 0.5, 0.33, 0.25]);
    expect(readChord(ring([60, 64, 67].flatMap(piano)), SR).pcs).toEqual([0, 4, 7]);
    expect(readChord(ring([57, 60, 64].flatMap(piano)), SR).pcs).toEqual([0, 4, 9]);
  });

  it("does not call a chord with a wrong note the chord", () => {
    // An open C with the first finger off: the B string rings open, so it is Cmaj7.
    const r = readChord(ring([48, 52, 55, 59, 64].flatMap((m) => string(m))), SR);
    expect(r.pcs).toEqual([0, 4, 7, 11]);
    // A minor third in a G shape is G minor, not G.
    expect(readChord(ring([43, 46, 50, 55, 58, 67].flatMap((m) => string(m))), SR).pcs).toEqual([
      2, 7, 10,
    ]);
  });

  it("does not invent the third of a power chord", () => {
    // G and D only. The fifth partial of G is a B: it must stay a partial.
    const r = readChord(ring([43, 50, 55].flatMap((m) => string(m))), SR);
    expect(r.pcs).toEqual([2, 7]);
  });

  it("reads one tone from a single string, however bright", () => {
    expect(readChord(ring(string(45)), SR).pcs).toEqual([9]);
    // A sawtooth: nineteen partials under 2.1 kHz, the 9th a B and the 11th a D sharp.
    const saw = Array.from({ length: 40 }, (_, i) => ({ hz: 110 * (i + 1), amp: 0.25 / (i + 1) }));
    expect(readChord(ring(saw), SR).pcs).toEqual([9]);
  });

  it("answers nothing on silence and on noise", () => {
    expect(readChord(new Float32Array(13230), SR).pcs).toEqual([]);
    expect(readChord(synth(SR, 0.6, [], { noise: 0.05, seed: 2 }), SR).pcs).toEqual([]);
    expect(readChord(synth(SR, 0.6, [], { noise: 0.001, seed: 3 }), SR).pcs).toEqual([]);
  });

  it("answers nothing for mains hum on a line input, and still reads a chord over it", () => {
    const hum = [1, 2, 3, 4, 5, 7, 9].map((k) => ({ hz: 60 * k, amp: 0.004 / k, phase: k }));
    expect(readChord(ring(hum, 0.6, 0.00002), SR).pcs).toEqual([]);
    const euro = [2, 3, 4, 5, 6].map((k) => ({ hz: 50 * k, amp: 0.004 / k, phase: k }));
    expect(readChord(ring(euro, 0.6, 0.00002), SR).pcs).toEqual([]);
    const over = ring([...hum, ...OPEN_G.flatMap((m) => string(m, 0.05))]);
    expect(readChord(over, SR).pcs).toEqual([2, 7, 11]);
  });

  it("answers nothing for strings far from any shared tuning", () => {
    // Damped strings ring a quarter tone off wherever the hand rests.
    const off = [40.0, 45.25, 49.6, 55.45, 58.85, 64.3];
    const r = readChord(ring(off.flatMap((m) => string(m, 0.1, [1, 0.3]))), SR);
    expect(r.spreadCents).toBeGreaterThan(17);
    expect(r.pcs).toEqual([]);
  });

  it("reads a guitar that is in tune with itself but 20 cents flat", () => {
    const flat = OPEN_C.flatMap((m) => string(m - 0.2));
    expect(readChord(ring(flat), SR).pcs).toEqual([0, 4, 7]);
  });

  it("answers nothing for a smear across neighbouring semitones", () => {
    // A muted stroke: short dead thuds, broad bumps instead of partials.
    const rand = rng(11);
    const buf = new Float32Array(13230);
    for (const hz of [150, 160, 170, 215, 228, 241, 330, 349]) {
      const tau = 0.02 + rand() * 0.02;
      for (let i = 0; i < buf.length; i++) {
        const t = i / SR;
        buf[i] += 0.2 * Math.exp(-t / tau) * Math.sin(2 * Math.PI * hz * t);
      }
    }
    expect(readChord(buf, SR).pcs).toEqual([]);
  });

  it("reads the same chord at 48 kHz from 400 ms", () => {
    const buf = synth(
      48000,
      0.4,
      OPEN_G.flatMap((m) => string(m)),
      { noise: 0.0005 },
    );
    expect(readChord(buf, 48000).pcs).toEqual([2, 7, 11]);
  });
});

describe("spectral peaks", () => {
  it("places low guitar notes that a 4096-sample frame at 48 kHz has no bin for", () => {
    const peaks = spectralPeaks(
      ring([
        { hz: midiToHz(43), amp: 0.2 },
        { hz: midiToHz(45), amp: 0.2 },
      ]),
      SR,
    );
    expect(peaks.map((p) => Math.round(p.hz))).toEqual([98, 110]);
  });

  it("drops the skirts of a decaying string", () => {
    const buf = synth(SR, 0.6, [{ hz: 261.6, amp: 0.3 }], { decay: 6, noise: 0.0002 });
    expect(spectralPeaks(buf, SR).length).toBe(1);
  });

  it("credits a peak to the lower note whose series it sits on, to the cent", () => {
    // E4 with its partials: the third (B5) may be E's. An equal-tempered G# beside
    // an E (14 cents off the fifth partial) is its own note.
    const e4 = midiToHz(64);
    const peaks = [
      { hz: e4, amp: 0.2 },
      { hz: e4 * 2, amp: 0.1 },
      { hz: e4 * 3, amp: 1 },
      { hz: midiToHz(92), amp: 0.3 },
    ];
    const ex = explainPeaks(peaks);
    expect(ex[2].own).toBe(11);
    expect(ex[2].by[4]).toBeGreaterThan(0);
    expect(ex[3].own).toBe(8);
    expect(ex[3].by[4]).toBe(0);
  });
});

describe("framesWindow", () => {
  it("cuts contiguous frames to the sample", () => {
    const frame = (at: number, v: number) => ({
      at,
      sampleRate: 1000,
      frame: new Float32Array(100).fill(v),
    });
    const w = framesWindow([frame(1000, 1), frame(1100, 2), frame(1200, 3)], 1050, 120);
    expect(w.length).toBe(120);
    expect([w[0], w[49], w[50], w[119]]).toEqual([1, 1, 2, 2]);
    expect(framesWindow([frame(1000, 1)], 1080, 100).length).toBe(20);
    expect(framesWindow([], 0, 100).length).toBe(0);
  });
});

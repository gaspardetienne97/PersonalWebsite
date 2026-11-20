import { describe, expect, it } from "vite-plus/test";
import { midiToHz } from "../theory/notes";
import {
  CHORD_SAMPLE_RATE,
  chordWindow,
  chroma,
  chromaToPcs,
  createNoteGate,
  noteEnergies,
  resample,
} from "./chroma";
import { fft } from "./fft";
import { synth, type Partial } from "./fixtures";

const SR = CHORD_SAMPLE_RATE;
/** Piano-ish partials: 1, 1/2, 1/3, 1/4. */
const piano = (midi: number, amp = 0.1): Partial[] =>
  [1, 0.5, 0.33, 0.25].map((a, i) => ({ hz: midiToHz(midi) * (i + 1), amp: amp * a, phase: i }));
const chordWin = (notes: number[], seed = 3) =>
  synth(
    SR,
    0.6,
    notes.flatMap((m) => piano(m)),
    { noise: 0.001, seed },
  );
const silence = (seed = 9) => synth(SR, 0.6, [], { noise: 0.001, seed });

describe("fft and resampling", () => {
  it("puts a bin-centred cosine in its bin", () => {
    const re = Float64Array.from({ length: 64 }, (_, i) => Math.cos((2 * Math.PI * 5 * i) / 64));
    const im = new Float64Array(64);
    fft(re, im);
    expect(re[5]).toBeCloseTo(32, 6);
    expect(Math.abs(re[6]) + Math.abs(im[6])).toBeLessThan(1e-9);
  });

  it("builds the 600 ms, 22.05 kHz mono analysis window", () => {
    const l = synth(48000, 1, [{ hz: 220, amp: 0.5 }]);
    const r = new Float32Array(l.length);
    const w = chordWindow([l, r], 48000);
    expect(w.length).toBe(13230);
    expect(Math.max(...w)).toBeCloseTo(0.25, 2);
    expect(resample(new Float32Array(441), 44100, 22050).length).toBe(220);
  });
});

describe("chroma", () => {
  it("names the pitch classes of a C major triad", () => {
    const c = chroma(chordWin([60, 64, 67]), SR);
    expect(chromaToPcs(c)).toEqual([0, 4, 7]);
    expect(Math.max(...c)).toBe(1);
  });

  it("is all zero on digital silence", () => {
    expect(chroma(new Float32Array(13230), SR).every((v) => v === 0)).toBe(true);
  });

  it("resolves E2 from F2 at the bottom of the band", () => {
    const e = noteEnergies(synth(SR, 0.6, [{ hz: midiToHz(40), amp: 0.2 }]), SR);
    expect(e[0]).toBeGreaterThan(20 * e[1]);
  });
});

describe("note gate", () => {
  it("fires once after 3 stable frames, holds on a sustained chord, re-arms on silence", () => {
    const g = createNoteGate([60, 64, 67], { sampleRate: SR });
    const got = [
      silence(),
      chordWin([60, 64, 67], 1),
      chordWin([60, 64, 67], 2),
      chordWin([60, 64, 67], 3),
    ].map((w) => g.push(w).matched);
    expect(got).toEqual([false, false, false, true]);
    expect(g.push(chordWin([60, 64, 67], 4))).toMatchObject({ matched: false, sounding: true });
    expect(g.push(chordWin([60, 64, 67], 5)).matched).toBe(false);
    g.push(silence(2));
    const again = [1, 2, 3].map((s) => g.push(chordWin([60, 64, 67], s)).matched);
    expect(again).toEqual([false, false, true]);
  });

  it("re-arms on a frame where the chord is incomplete", () => {
    const g = createNoteGate([60, 64, 67], { sampleRate: SR });
    for (const s of [1, 2, 3]) g.push(chordWin([60, 64, 67], s));
    const partial = g.push(chordWin([60, 64], 4));
    expect(partial).toMatchObject({ sounding: false, present: [60, 64] });
    expect([1, 2, 3].map((s) => g.push(chordWin([60, 64, 67], s)).matched)).toEqual([
      false,
      false,
      true,
    ]);
  });

  it("rejects the chord an octave down (its partials land on the targets)", () => {
    const g = createNoteGate([60, 64, 67], { sampleRate: SR });
    const frames = [1, 2, 3, 4].map((s) => g.push(chordWin([48, 52, 55], s)));
    expect(frames.some((f) => f.matched || f.sounding)).toBe(false);
  });

  it("accepts a low target over its own strong partials", () => {
    const g = createNoteGate([48], { sampleRate: SR });
    expect([1, 2, 3].map((s) => g.push(chordWin([48], s)).matched)).toEqual([false, false, true]);
  });

  it("accepts an octave doubling when both notes are targets", () => {
    const g = createNoteGate([48, 60], { sampleRate: SR });
    expect([1, 2, 3].map((s) => g.push(chordWin([48, 60], s)).matched)).toEqual([
      false,
      false,
      true,
    ]);
  });

  it("rejects a semitone neighbour and the wrong note", () => {
    const g = createNoteGate([64], { sampleRate: SR });
    expect([1, 2, 3, 4].some((s) => g.push(chordWin([65], s)).sounding)).toBe(false);
    expect([1, 2, 3, 4].some((s) => g.push(chordWin([67], s)).sounding)).toBe(false);
  });

  it("ignores anything below the 0.01 RMS signal floor", () => {
    const g = createNoteGate([60], { sampleRate: SR });
    const quiet = synth(SR, 0.6, piano(60, 0.005));
    expect([1, 2, 3, 4].some(() => g.push(quiet).sounding)).toBe(false);
  });

  it("needs 2.5x the energy of the noise floor it learned from quiet frames", () => {
    // A steady C4 hum at RMS ~0.016 sits under a 0.02 floor, so the gate learns it as noise.
    const hum = synth(SR, 0.6, piano(60, 0.02));
    const learn = () => {
      const g = createNoteGate([60], { sampleRate: SR, signalFloorRms: 0.02 });
      for (let i = 0; i < 30; i++) g.push(hum);
      return g;
    };
    // 1.25x the amplitude is 1.56x the energy: above the floor, below the SNR ratio.
    expect(learn().push(synth(SR, 0.6, piano(60, 0.025))).sounding).toBe(false);
    expect(learn().push(synth(SR, 0.6, piano(60, 0.1))).sounding).toBe(true);
  });
});

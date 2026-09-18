/**
 * Low-string robustness regression (O25). Synthetic plucked-string fixtures are
 * pushed through the *production* chain — the real worklet source (high-pass +
 * framing) feeding a real {@link AudioPitchSource} over a fake AudioContext — so
 * the clarity threshold, the worklet high-pass and capture's wide-window rerun
 * are all exercised together, the way a microphone frame reaches the tuner.
 *
 * The fixtures are the ones the synthetic harness measured the failures on:
 * plucked strings with 8 inharmonic partials, per-partial decay, a pick
 * transient, and (for the low guitar strings) 2nd/3rd partials louder than the
 * fundamental. Everything is seeded, so frame counts are deterministic.
 */

import { afterEach, describe, expect, test, vi } from "vitest";

import {
  AudioPitchSource,
  centsBetween,
  detectPitch,
  frequencyToMidi,
  tunerReading,
} from "./index";
import workletSource from "./pitch-worklet.js?raw";
import type { TunerReading } from "./tuner";

const SAMPLE_RATE = 48000;

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------- fixtures --

interface StringFixture {
  name: string;
  f0: number;
  /** Relative partial amplitudes, index 0 = fundamental. */
  harmonics: number[];
  /** Fundamental decay time constant in seconds; higher partials decay faster. */
  tau: number;
  /** Inharmonicity coefficient B in f_k = k·f0·sqrt(1 + B·k²). */
  B: number;
}

/** The harness's eight base fixtures; low guitar strings are harmonic-dominant. */
const FIXTURES: StringFixture[] = [
  {
    name: "E2 guitar",
    f0: 82.41,
    harmonics: [0.35, 1, 0.8, 0.5, 0.35, 0.25, 0.15, 0.1],
    tau: 1.6,
    B: 1.5e-4,
  },
  {
    name: "A2 guitar",
    f0: 110,
    harmonics: [0.45, 1, 0.7, 0.45, 0.3, 0.2, 0.12, 0.08],
    tau: 1.4,
    B: 1.2e-4,
  },
  {
    name: "C3 piano",
    f0: 130.81,
    harmonics: [1, 0.7, 0.5, 0.3, 0.2, 0.12, 0.08, 0.05],
    tau: 2,
    B: 2e-4,
  },
  {
    name: "D3 guitar",
    f0: 146.83,
    harmonics: [0.6, 1, 0.6, 0.35, 0.22, 0.14, 0.08, 0.05],
    tau: 1.2,
    B: 8e-5,
  },
  {
    name: "G3 guitar",
    f0: 196,
    harmonics: [0.8, 0.9, 0.5, 0.3, 0.18, 0.1, 0.06, 0.04],
    tau: 1,
    B: 5e-5,
  },
  {
    name: "B3 guitar",
    f0: 246.94,
    harmonics: [1, 0.7, 0.4, 0.25, 0.15, 0.08, 0.05, 0.03],
    tau: 0.9,
    B: 3e-5,
  },
  {
    name: "E4 guitar",
    f0: 329.63,
    harmonics: [1, 0.6, 0.35, 0.2, 0.12, 0.07, 0.04, 0.02],
    tau: 0.8,
    B: 2e-5,
  },
  {
    name: "A4 piano",
    f0: 440,
    harmonics: [1, 0.5, 0.3, 0.15, 0.08, 0.04, 0.02, 0.01],
    tau: 1.2,
    B: 5e-5,
  },
];

const SECONDS = 1.2;

/** Deterministic LCG so every run synthesises byte-identical fixtures. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function gauss(next: () => number): number {
  const u = Math.max(1e-12, next());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
}

/** A plucked string: inharmonic partials, per-partial decay, pick transient. */
function pluck(fx: StringFixture, seed: number, seconds = SECONDS): Float32Array {
  const n = Math.round(SAMPLE_RATE * seconds);
  const out = new Float32Array(n);
  const next = rng(seed);
  const transientN = Math.round(SAMPLE_RATE * 0.015);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    let v = 0;
    for (let k = 1; k <= fx.harmonics.length; k++) {
      const fk = k * fx.f0 * Math.sqrt(1 + fx.B * k * k);
      v +=
        fx.harmonics[k - 1] *
        Math.exp(-t / (fx.tau / k ** 0.9)) *
        Math.sin(2 * Math.PI * fk * t + k * 0.7);
    }
    v *= Math.min(1, t / 0.004); // 4 ms attack, so the note has no click of its own
    if (i < transientN) v += 0.6 * gauss(next) * Math.exp(-i / (transientN / 4));
    out[i] = v;
  }
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  for (let i = 0; i < n; i++) out[i] = (out[i] / peak) * 0.5;
  return out;
}

function rms(x: Float32Array, from = 0, to = x.length): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += x[i] * x[i];
  return Math.sqrt(sum / Math.max(1, to - from));
}

/** Add `noise` at `dbRel` under the note's first-300 ms RMS (the level a player tunes at). */
function addAt(signal: Float32Array, noise: Float32Array, dbRel: number): Float32Array {
  const gain = (rms(signal, 0, Math.round(SAMPLE_RATE * 0.3)) * 10 ** (dbRel / 20)) / rms(noise);
  const out = signal.slice();
  for (let i = 0; i < out.length; i++) out[i] += noise[i] * gain;
  return out;
}

/** Mains hum: fundamental plus 2nd and 3rd harmonics, as a pickup or PSU delivers it. */
function mainsHum(n: number, f: number): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    out[i] =
      Math.sin(2 * Math.PI * f * t) +
      0.5 * Math.sin(2 * Math.PI * 2 * f * t + 0.4) +
      0.3 * Math.sin(2 * Math.PI * 3 * f * t + 1.3);
  }
  return out;
}

/** The neighbouring string, plucked 0.8 s earlier and still ringing. */
function ringingNeighbour(fx: StringFixture, semitones: number, seed: number): Float32Array {
  const neighbour: StringFixture = {
    ...fx,
    f0: fx.f0 * 2 ** (semitones / 12),
    harmonics: [0.7, 1, 0.6, 0.35, 0.2, 0.1, 0.05, 0.03],
  };
  return pluck(neighbour, seed, SECONDS + 0.8).subarray(Math.round(SAMPLE_RATE * 0.8));
}

// ------------------------------------------------------------- the pipeline --

/** Run the real worklet source over a signal and collect the frames it posts. */
function workletFrames(signal: Float32Array, sampleRate = SAMPLE_RATE): Float32Array[] {
  const frames: Float32Array[] = [];
  class FakeProcessorBase {
    port = { postMessage: (frame: Float32Array) => frames.push(frame) };
  }
  let Processor: (new () => { process(inputs: Float32Array[][]): boolean }) | undefined;
  const register = (
    _name: string,
    ctor: new () => { process(inputs: Float32Array[][]): boolean },
  ) => {
    Processor = ctor;
  };
  new Function("AudioWorkletProcessor", "registerProcessor", "sampleRate", workletSource)(
    FakeProcessorBase,
    register,
    sampleRate,
  );
  const processor = new Processor!();
  // 128 samples per render quantum, exactly as the audio thread calls process().
  for (let i = 0; i < signal.length; i += 128) processor.process([[signal.subarray(i, i + 128)]]);
  return frames;
}

function stubAudioGlobals(port: {
  onmessage: ((event: MessageEvent<Float32Array>) => void) | null;
}): void {
  class FakeAudioContext {
    audioWorklet = { addModule: async () => {} };
    sampleRate = SAMPLE_RATE;
    state = "running";
    createMediaStreamSource() {
      return { connect: () => {}, disconnect: () => {} };
    }
    async close() {}
  }
  class FakeAudioWorkletNode {
    port = port;
    disconnect() {}
  }
  vi.stubGlobal("navigator", {
    mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => {} }] }) },
  });
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);
}

interface FixtureResult {
  frames: number;
  accepted: number;
  correct: number;
  octaveUp: number;
}

/** Push a signal through worklet → AudioPitchSource and score the readings. */
async function runTuner(signal: Float32Array, f0: number): Promise<FixtureResult> {
  const port: {
    close: () => void;
    onmessage: ((event: MessageEvent<Float32Array>) => void) | null;
  } = { close: () => {}, onmessage: null };
  stubAudioGlobals(port);

  const readings: TunerReading[] = [];
  const source = new AudioPitchSource();
  source.subscribe((reading) => readings.push(reading));
  await source.start();

  const frames = workletFrames(signal);
  for (const frame of frames) port.onmessage?.({ data: frame } as MessageEvent<Float32Array>);
  await source.stop();

  const targetMidi = Math.round(frequencyToMidi(f0));
  let correct = 0;
  let octaveUp = 0;
  for (const reading of readings) {
    if (reading.midi === targetMidi) correct++;
    if (Math.abs(centsBetween(reading.frequency, f0) - 1200) < 50) octaveUp++;
  }
  return { frames: frames.length, accepted: readings.length, correct, octaveUp };
}

// ------------------------------------------------------------------- tests --

describe("pitch worklet high-pass", () => {
  test("strips a DC offset out of every frame", () => {
    const offset = new Float32Array(SAMPLE_RATE).fill(0.25);

    const frames = workletFrames(offset);
    const settled = frames[frames.length - 1];

    expect(Math.max(...settled.map(Math.abs))).toBeLessThan(0.001);
  });

  test("attenuates sub-40 Hz rumble", () => {
    const n = SAMPLE_RATE;
    const rumble = new Float32Array(n);
    for (let i = 0; i < n; i++) rumble[i] = 0.3 * Math.sin((2 * Math.PI * 28 * i) / SAMPLE_RATE);

    const frames = workletFrames(rumble);
    const settled = frames[frames.length - 1];

    expect(rms(settled)).toBeLessThan(0.6 * rms(rumble));
  });

  test("leaves the musical band alone", () => {
    const n = SAMPLE_RATE;
    const tone = new Float32Array(n);
    for (let i = 0; i < n; i++) tone[i] = 0.5 * Math.sin((2 * Math.PI * 200 * i) / SAMPLE_RATE);

    const frames = workletFrames(tone);
    const settled = frames[frames.length - 1];

    expect(rms(settled)).toBeGreaterThan(0.95 * rms(tone));
  });
});

describe("AudioPitchSource wide-window rerun", () => {
  /** Two back-to-back 2048-sample frames at different frequencies. */
  function twoFrames(
    firstHz: number,
    secondHz: number,
  ): { first: Float32Array; second: Float32Array } {
    const make = (hz: number, offset: number) => {
      const buf = new Float32Array(2048);
      for (let i = 0; i < 2048; i++)
        buf[i] = 0.5 * Math.sin((2 * Math.PI * hz * (i + offset)) / SAMPLE_RATE);
      return buf;
    };
    return { first: make(firstHz, 0), second: make(secondHz, 2048) };
  }

  async function emit(first: Float32Array, second: Float32Array): Promise<number[]> {
    const port: {
      close: () => void;
      onmessage: ((event: MessageEvent<Float32Array>) => void) | null;
    } = { close: () => {}, onmessage: null };
    stubAudioGlobals(port);
    const frequencies: number[] = [];
    const source = new AudioPitchSource();
    source.subscribeEvents((event) => frequencies.push(event.frequencyHz ?? 0));
    await source.start();
    port.onmessage?.({ data: first } as MessageEvent<Float32Array>);
    port.onmessage?.({ data: second } as MessageEvent<Float32Array>);
    await source.stop();
    return frequencies;
  }

  test("re-detects a low reading over the last 4096 samples", async () => {
    const { first, second } = twoFrames(100, 110);
    const wide = new Float32Array(4096);
    wide.set(first, 0);
    wide.set(second, 2048);
    const narrowHz = detectPitch(second, { sampleRate: SAMPLE_RATE }).frequency;
    const wideHz = detectPitch(wide, { sampleRate: SAMPLE_RATE }).frequency;
    expect(Math.abs(wideHz - narrowHz)).toBeGreaterThan(1); // the two windows disagree

    const frequencies = await emit(first, second);

    expect(frequencies[1]).toBeCloseTo(wideHz, 6);
  });

  test("keeps the frame's own reading when the wide window is unusable", async () => {
    // A string change (A2 → E2): the 4096 window straddles both notes, so it is
    // less periodic than the clean frame that just arrived.
    const { first, second } = twoFrames(110, 82.41);
    const wide = new Float32Array(4096);
    wide.set(first, 0);
    wide.set(second, 2048);
    const narrow = detectPitch(second, { sampleRate: SAMPLE_RATE });
    expect(tunerReading(narrow, {})).not.toBeNull();
    expect(tunerReading(detectPitch(wide, { sampleRate: SAMPLE_RATE }), {})).toBeNull();

    const frequencies = await emit(first, second);

    expect(frequencies).toHaveLength(2);
    expect(frequencies[1]).toBeCloseTo(narrow.frequency, 6);
  });

  test("keeps the single-frame latency above 130 Hz", async () => {
    const { first, second } = twoFrames(200, 220);
    const narrowHz = detectPitch(second, { sampleRate: SAMPLE_RATE }).frequency;

    const frequencies = await emit(first, second);

    expect(frequencies[1]).toBeCloseTo(narrowHz, 6);
  });
});

describe("low-string fixtures", () => {
  test("holds A2 against 60 Hz mains hum at -20 dB", async () => {
    const a2 = FIXTURES[1];
    const note = pluck(a2, 1101);
    const signal = addAt(note, mainsHum(note.length, 60), -20);

    const result = await runTuner(signal, a2.f0);

    expect(result.accepted).toBeGreaterThan(20);
    expect(result.correct / result.accepted).toBeGreaterThanOrEqual(0.95);
    expect(result.octaveUp).toBe(0);
  });

  test("holds G3 against a C4 left ringing at -16 dB", async () => {
    const g3 = FIXTURES[4];
    const note = pluck(g3, 1960);
    const signal = addAt(note, ringingNeighbour(g3, 5, 1967), -16);

    const result = await runTuner(signal, g3.f0);

    expect(result.accepted).toBeGreaterThan(20);
    expect(result.correct / result.accepted).toBeGreaterThanOrEqual(0.95);
    expect(result.octaveUp).toBe(0);
  });

  test("never reports an octave up across the eight base fixtures", async () => {
    const offenders: string[] = [];
    for (const fx of FIXTURES) {
      const clean = await runTuner(pluck(fx, Math.round(fx.f0 * 10)), fx.f0);
      // A laptop mic rolling off below 100 Hz: fundamental 22 dB under the 2nd partial.
      const weakF0 = { ...fx, harmonics: [0.08, ...fx.harmonics.slice(1)] };
      const rolled = await runTuner(pluck(weakF0, Math.round(fx.f0 * 10)), fx.f0);
      if (clean.octaveUp > 0) offenders.push(`${fx.name} clean: ${clean.octaveUp}`);
      if (rolled.octaveUp > 0) offenders.push(`${fx.name} weak-f0: ${rolled.octaveUp}`);
      // Accepted floors, so a change that silently ate frames could not pass by
      // being right about the handful it kept.
      expect(clean.accepted).toBeGreaterThan(25);
      expect(rolled.accepted).toBeGreaterThan(25);
      expect(clean.correct / clean.accepted).toBeGreaterThanOrEqual(0.95);
      expect(rolled.correct / rolled.accepted).toBeGreaterThanOrEqual(0.95);
    }
    expect(offenders).toEqual([]);
  });
});

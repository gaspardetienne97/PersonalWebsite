import { describe, expect, it } from "vitest";
import { createHighPass } from "./biquad";
import { stringTone, synth, type Partial } from "./fixtures";
import {
  analyzePitch,
  createIntonationStats,
  createTunerReader,
  mpm,
  type PitchReading,
} from "./pitch";

const RATES = [44100, 48000];
const toMidi = (hz: number) => Math.round(69 + 12 * Math.log2(hz / 440));

/** One second of audio, high-passed like the worklet, framed at 1024 hop with a 4096 wide window. */
function run(sr: number, parts: Partial[], { hp = true, from = 4096, dc = 0 } = {}) {
  const x = synth(sr, 1, parts, { noise: 0.01, dc });
  if (hp) createHighPass(sr).processBlock(x);
  const frames: (PitchReading | null)[] = [];
  for (let end = from; end <= x.length; end += 1024)
    frames.push(analyzePitch(x.subarray(end - 2048, end), sr, x.subarray(end - 4096, end)));
  return frames;
}
const count = (frames: (PitchReading | null)[], midi: number) =>
  frames.filter((f) => f?.midi === midi).length;

/** Frame-only MPM at an explicit ratio, to show each fixture has teeth. */
function runRatio(sr: number, parts: Partial[], ratio: number) {
  const x = synth(sr, 1, parts, { noise: 0.01 });
  createHighPass(sr).processBlock(x);
  const out: number[] = [];
  for (let end = 4096; end <= x.length; end += 1024) {
    const r = mpm(x.subarray(end - 2048, end), sr, { ratio });
    out.push(r ? toMidi(r.hz) : -1);
  }
  return out;
}

describe("mpm on open strings", () => {
  const strings = [
    ["E2", 82.41, 40],
    ["A2", 110, 45],
    ["D3", 146.83, 50],
    ["G3", 196, 55],
    ["B3", 246.94, 59],
    ["E4", 329.63, 64],
  ] as const;
  for (const sr of RATES)
    for (const [name, hz, midi] of strings)
      it(`${name} at ${sr} reads every frame on the note within 3 cents`, () => {
        const frames = run(sr, stringTone(hz));
        // 44100: 40 frames, 48000: 43 frames; all measured correct.
        expect(frames.length).toBe(sr === 44100 ? 40 : 43);
        expect(count(frames, midi)).toBe(frames.length);
        expect(Math.max(...frames.map((f) => Math.abs(f!.cents)))).toBeLessThan(3);
      });
});

describe("the interference fixtures from the lessons file", () => {
  const humA2 = [
    ...stringTone(110),
    { hz: 60, amp: 0.1 },
    { hz: 120, amp: 0.05 },
    { hz: 180, amp: 0.1 / 3 },
  ];
  for (const sr of RATES)
    it(`A2 with 60 Hz hum never reads A1 at ${sr}`, () => {
      const frames = run(sr, humA2);
      expect(count(frames, 33)).toBe(0);
      expect(count(frames, 45)).toBe(frames.length);
      // Control: at the classic 0.9 the same fixture flips to A1 (14/40 and 13/43 measured).
      expect(runRatio(sr, humA2, 0.9).filter((m) => m === 33).length).toBeGreaterThanOrEqual(10);
    });

  // Fundamental at a tenth of the octave partial: NSDF at T/2 ~0.81 of the T peak.
  const weak = stringTone(110, [0.1, 1, 0.35, 0.5]);
  for (const sr of RATES)
    it(`a weak fundamental never reads an octave up at ${sr}`, () => {
      const frames = run(sr, weak);
      expect(count(frames, 57)).toBe(0);
      expect(count(frames, 45)).toBe(frames.length);
      // Control: at 0.8 every frame flips up to A3.
      expect(runRatio(sr, weak, 0.8).every((m) => m === 57)).toBe(true);
    });

  const ringing = [
    ...stringTone(196),
    ...stringTone(261.63).map((p) => ({ ...p, amp: p.amp * 0.3 })),
  ];
  for (const sr of RATES)
    it(`G3 with C4 ringing a fourth above reads G3 at ${sr}`, () => {
      const frames = run(sr, ringing);
      expect(count(frames, 55)).toBe(frames.length);
      // Control: at 0.9 the common period (3T, C2) wins every frame.
      expect(runRatio(sr, ringing, 0.9).every((m) => m === 36)).toBe(true);
    });

  const rumble = (hz: number) => [
    ...stringTone(hz),
    { hz: 20, amp: 0.2 },
    { hz: 25, amp: 0.14 },
    { hz: 30, amp: 0.1 },
  ];
  const meanCents = (frames: (PitchReading | null)[]) => {
    const c = frames.filter(Boolean).map((f) => f!.cents);
    return c.reduce((a, b) => a + b, 0) / c.length;
  };
  for (const sr of RATES)
    for (const hz of [82.41, 110])
      it(`20-30 Hz rumble plus DC biases ${hz} Hz by at most 2 cents through the high-pass at ${sr}`, () => {
        const filtered = run(sr, rumble(hz), { from: 8192, dc: 0.06 });
        expect(filtered.every(Boolean)).toBe(true);
        expect(Math.abs(meanCents(filtered))).toBeLessThanOrEqual(2);
        // Control: unfiltered, the same fixture reads 3.8 to 8.5 cents sharp.
        expect(meanCents(run(sr, rumble(hz), { from: 8192, dc: 0.06, hp: false }))).toBeGreaterThan(
          3,
        );
      });
});

describe("mpm gates and the wide pass", () => {
  it("returns null below the RMS gate and outside the band", () => {
    expect(mpm(new Float32Array(2048), 48000)).toBeNull();
    expect(mpm(synth(48000, 0.05, [{ hz: 110, amp: 0.0009 }]), 48000)).toBeNull();
    expect(mpm(synth(48000, 0.05, [{ hz: 40, amp: 0.5 }]).subarray(0, 2048), 48000)).toBeNull();
    const high = mpm(synth(48000, 0.05, [{ hz: 2000, amp: 0.5 }]).subarray(0, 2048), 48000);
    expect(high === null || high.hz <= 1500).toBe(true);
  });

  it("uses the wide window when the frame alone is unusable", () => {
    const sr = 48000;
    const wide = new Float32Array(4096);
    wide.set(synth(sr, 2048 / sr, stringTone(82.41)));
    expect(analyzePitch(wide.subarray(2048), sr)).toBeNull();
    expect(analyzePitch(wide.subarray(2048), sr, wide)?.midi).toBe(40);
  });

  it("never lets a stale wide window replace the note the frame just heard", () => {
    const sr = 48000;
    const wide = new Float32Array(4096);
    wide.set(synth(sr, 2048 / sr, stringTone(110)));
    wide.set(synth(sr, 2048 / sr, stringTone(82.41)), 2048);
    expect(analyzePitch(wide.subarray(2048), sr, wide)?.midi).toBe(40);
  });

  it("reports cents against the reference pitch", () => {
    const r = analyzePitch(synth(48000, 2048 / 48000, stringTone(442)), 48000, undefined, 442);
    expect(r?.midi).toBe(69);
    expect(Math.abs(r!.cents)).toBeLessThan(1);
  });
});

const reading = (midi: number, cents: number, clarity = 0.9): PitchReading => ({
  hz: 440 * 2 ** ((midi + cents / 100 - 69) / 12),
  clarity,
  midi,
  cents,
});

describe("tuner reader", () => {
  it("holds the last good reading, ignores low clarity, clears after 1500 ms", () => {
    const t = createTunerReader();
    expect(t.push(reading(45, 3), 0)).toMatchObject({ midi: 45, inTune: true, at: 0 });
    expect(t.push(reading(47, 0, 0.5), 100)).toMatchObject({ midi: 45, at: 0 });
    expect(t.push(null, 1500)).toMatchObject({ midi: 45 });
    expect(t.push(null, 1501)).toBeNull();
    expect(t.push(reading(45, -6), 1600)).toMatchObject({ inTune: false });
    expect(t.read(3200)).toBeNull();
  });
});

describe("intonation stats", () => {
  it("computes in-tune %, hold, steadiness and drift over the window", () => {
    const s = createIntonationStats();
    // 0..4.5 s: 4 cents sharp; 5..9.5 s: alternating 20 cents sharp / 2 sharp.
    for (let i = 0; i < 10; i++) s.push(reading(57, 4), i * 500, 57);
    for (let i = 10; i < 20; i++) s.push(reading(57, i % 2 ? 2 : 20), i * 500, 57);
    let st = s.stats();
    expect(st.inTunePct).toBe(75);
    expect(st.holdSeconds).toBe(0); // the last in-tune sample follows an out-of-tune one
    expect(st.avgDriftCents).toBe(7.5);
    expect(st.trace).toHaveLength(20);
    // Against a target a semitone below, everything is 100+ cents sharp.
    const d = createIntonationStats();
    d.push(reading(58, 0), 0, 57);
    d.push(reading(58, 0), 100, 57);
    expect(d.stats()).toMatchObject({ inTunePct: 0, avgDriftCents: 100, steadinessPct: 100 });
    // The window drops samples older than 10 s.
    s.push(reading(57, 0), 14000, 57);
    st = s.stats();
    expect(st.trace[0].at).toBe(4000);
    // Hold spans consecutive in-tune samples: 9500 (+2) to 14000 (0).
    expect(st.holdSeconds).toBe(4.5);
  });

  it("measures an unbroken in-tune hold and a gap", () => {
    const s = createIntonationStats();
    s.push(reading(57, 30), 0);
    for (let i = 1; i <= 5; i++) s.push(reading(57, 1), i * 400);
    expect(s.stats().holdSeconds).toBe(1.6);
    s.push(null, 2400);
    expect(s.stats().holdSeconds).toBe(0);
    expect(s.stats().trace.at(-1)).toEqual({ at: 2400, cents: null });
  });
});

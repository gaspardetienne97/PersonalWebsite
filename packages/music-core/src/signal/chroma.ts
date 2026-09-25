// Note-energy bank, chroma and the known-target note gate (scoring rules §12,
// hardware notes §4 "Chord / note gating from audio").
import { midiToHz } from "../theory/notes";
import { powerSpectrum } from "./fft";

export const CHORD_WINDOW_MS = 600;
export const CHORD_SAMPLE_RATE = 22050;
export const GATE_LOW = 40;
export const GATE_HIGH = 88;

export function toMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const out = new Float32Array(channels[0]?.length ?? 0);
  for (const ch of channels) for (let i = 0; i < out.length; i++) out[i] += ch[i] / channels.length;
  return out;
}

// ponytail: linear interpolation, no anti-alias filter. Content above 11 kHz folds
// back when downsampling 48k -> 22.05k; guitar and piano carry little there.
export function resample(buf: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return buf;
  const out = new Float32Array(Math.floor((buf.length * toRate) / fromRate));
  const step = fromRate / toRate;
  for (let i = 0; i < out.length; i++) {
    const x = i * step;
    const j = Math.floor(x);
    const f = x - j;
    out[i] = buf[j] * (1 - f) + (buf[j + 1] ?? buf[j]) * f;
  }
  return out;
}

/** The last 600 ms of the input as mono at 22.05 kHz: the chord analysis window. */
export function chordWindow(channels: Float32Array[], sampleRate: number): Float32Array {
  const mono = toMono(channels);
  const take = Math.round((sampleRate * CHORD_WINDOW_MS) / 1000);
  return resample(mono.subarray(Math.max(0, mono.length - take)), sampleRate, CHORD_SAMPLE_RATE);
}

/** Power per MIDI note lo..hi (index midi - lo): FFT bins within half a semitone of the note. */
export function noteEnergies(
  buf: Float32Array,
  sampleRate: number,
  lo = GATE_LOW,
  hi = GATE_HIGH,
): Float64Array {
  const { power, size } = powerSpectrum(buf);
  const binHz = sampleRate / size;
  const out = new Float64Array(hi - lo + 1);
  for (let m = lo; m <= hi; m++) {
    const f = midiToHz(m);
    const a = Math.ceil((f * 2 ** (-1 / 24)) / binHz);
    const b = Math.min(power.length - 1, Math.floor((f * 2 ** (1 / 24)) / binHz));
    let e = 0;
    for (let k = a; k <= b; k++) e += power[k];
    out[m - lo] = e;
  }
  return out;
}

/** 12 pitch-class energies (C = 0), normalised so the strongest is 1; all zero on silence. */
export function chroma(buf: Float32Array, sampleRate: number): number[] {
  const e = noteEnergies(buf, sampleRate);
  const c = Array<number>(12).fill(0);
  e.forEach((v, i) => (c[(GATE_LOW + i) % 12] += v));
  const max = Math.max(...c);
  return max > 0 ? c.map((v) => v / max) : c;
}

export const chromaToPcs = (c: number[], threshold = 0.5) =>
  c.flatMap((v, pc) => (v >= threshold ? [pc] : []));

export const GATE_SETTINGS = {
  signalFloorRms: 0.01,
  snrRatio: 2.5,
  noiseSmoothing: 0.9,
  stableFrames: 3,
  presenceRatio: 0.25,
  harmonicMargin: 0.9,
  matchMargin: 1.4,
  harmonics: [12, 19, 24],
  confusers: [-24, -12, -1, 1, 12, 24],
};

export interface GateFrame {
  /** True on the one frame where the targets are confirmed after a re-arm. */
  matched: boolean;
  /** Every target is sounding and proves its own octave in this frame. */
  sounding: boolean;
  /** Targets that passed on this frame. */
  present: number[];
  rms: number;
}

/**
 * Waits for a known set of MIDI notes in audio. Push successive analysis
 * windows (ideally `chordWindow`, 600 ms at 22.05 kHz, hopped ~100 ms).
 *
 * Per target t, a frame passes when:
 * - frame RMS >= signal floor 0.01;
 * - energy(t) > 2.5 x the noise floor for t, and >= 0.25 x the loudest note in band;
 * - it out-shouts each confuser u = t + c that is not itself a target: by the
 *   harmonic margin (0.9x) when c is a harmonic offset (+12/+19/+24, so its own
 *   partials only need to not dominate it), else by the match margin (1.4x).
 * The noise floor per note is smoothed 0.9 over frames below the signal floor.
 * A match fires after 3 consecutive passing frames, once per re-arm (a silent
 * frame or any frame where the targets were not all sounding).
 */
export function createNoteGate(
  targets: number[],
  opts: { sampleRate: number } & Partial<typeof GATE_SETTINGS>,
) {
  const s = { ...GATE_SETTINGS, ...opts };
  const want = [...new Set(targets.map(Math.round))].filter((m) => m >= GATE_LOW && m <= GATE_HIGH);
  const noise = new Float64Array(GATE_HIGH - GATE_LOW + 1);
  let armed = true;
  let stable = 0;

  return {
    push(window: Float32Array): GateFrame {
      let sum = 0;
      for (let i = 0; i < window.length; i++) sum += window[i] * window[i];
      const rms = Math.sqrt(sum / Math.max(1, window.length));
      const e = noteEnergies(window, s.sampleRate);
      if (rms < s.signalFloorRms) {
        for (let i = 0; i < e.length; i++)
          noise[i] = s.noiseSmoothing * noise[i] + (1 - s.noiseSmoothing) * e[i];
        armed = true;
        stable = 0;
        return { matched: false, sounding: false, present: [], rms };
      }
      const E = (m: number) => (m >= GATE_LOW && m <= GATE_HIGH ? e[m - GATE_LOW] : 0);
      const loudest = Math.max(...e);
      const present = want.filter(
        (t) =>
          E(t) > s.snrRatio * noise[t - GATE_LOW] &&
          E(t) >= s.presenceRatio * loudest &&
          s.confusers.every((c) => {
            const u = t + c;
            if (want.includes(u)) return true;
            return E(t) >= (s.harmonics.includes(c) ? s.harmonicMargin : s.matchMargin) * E(u);
          }),
      );
      const sounding = want.length > 0 && present.length === want.length;
      if (!sounding) {
        armed = true;
        stable = 0;
        return { matched: false, sounding, present, rms };
      }
      stable++;
      const matched = armed && stable >= s.stableFrames;
      if (matched) armed = false;
      return { matched, sounding, present, rms };
    },
    reset() {
      noise.fill(0);
      armed = true;
      stable = 0;
    },
  };
}

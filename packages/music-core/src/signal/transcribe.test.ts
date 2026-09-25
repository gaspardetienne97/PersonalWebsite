import { describe, expect, it } from "vitest";
import { midiToHz } from "../theory/notes";
import { rng, stringTone } from "./fixtures";
import { transcribe } from "./transcribe";

const SR = 44100;
/** Plucked notes laid on a quiet noise bed: [midi, startS, lengthS, bend?]. */
function melody(notes: [number, number, number, ((t: number) => number)?][], seconds: number) {
  const out = new Float32Array(Math.round(SR * seconds));
  const rand = rng(5);
  for (let i = 0; i < out.length; i++) out[i] = (rand() * 2 - 1) * 0.0005;
  for (const [midi, start, len, bend] of notes) {
    const parts = stringTone(midiToHz(midi));
    const phase = parts.map((p) => p.phase ?? 0);
    const s0 = Math.round(start * SR);
    for (let i = 0; i < len * SR && s0 + i < out.length; i++) {
      const t = i / SR;
      const env = Math.min(1, t / 0.003) * Math.exp(-2 * t) * Math.min(1, (len - t) / 0.005);
      const ratio = 2 ** ((bend?.(t) ?? 0) / 12);
      let v = 0;
      parts.forEach((p, k) => {
        phase[k] += (2 * Math.PI * p.hz * ratio) / SR;
        v += p.amp * Math.sin(phase[k]);
      });
      out[s0 + i] += env * v;
    }
  }
  return out;
}

describe("transcribe", () => {
  it("turns a plucked line into notes, keeping a repeated pitch and dropping a blip", () => {
    const audio = melody(
      [
        [45, 0.1, 0.4], // A2
        [48, 0.55, 0.4], // C3
        [52, 1.0, 0.35], // E3
        [52, 1.4, 0.35], // E3 again, re-attacked
        [60, 1.85, 0.03], // 30 ms blip: under the 0.05 s minimum
        [55, 2.0, 0.5], // G3
      ],
      2.8,
    );
    const score = transcribe(audio, SR, { bpm: 60, title: "Line" });
    const notes = score.voices[0].notes;
    expect(notes.map((n) => n.midi)).toEqual([45, 48, 52, 52, 55]);
    const starts = [0.1, 0.55, 1.0, 1.4, 2.0];
    notes.forEach((n, i) => expect(Math.abs(n.startBeat - starts[i])).toBeLessThan(0.03));
    expect(Math.abs(notes[0].durationBeats - 0.4)).toBeLessThan(0.06);
    expect(score).toMatchObject({
      title: "Line",
      bpm: 60,
      lengthBeats: 4,
      source: { kind: "transcribed" },
    });
  });

  it("merges a note whose pitch slips for 30 ms back into one note, at 120 BPM by default", () => {
    // D3 bent a semitone up for 30 ms mid-note, with no new attack.
    const audio = melody([[50, 0.1, 0.4, (t) => (t >= 0.15 && t < 0.18 ? 1 : 0)]], 1);
    const score = transcribe(audio, SR);
    expect(score.bpm).toBe(120);
    const notes = score.voices[0].notes;
    expect(notes.map((n) => n.midi)).toEqual([50]);
    expect(Math.abs(notes[0].startBeat - 0.2)).toBeLessThan(0.06);
    expect(Math.abs(notes[0].durationBeats - 0.8)).toBeLessThan(0.12);
  });

  it("returns an empty voice for silence", () => {
    expect(transcribe(new Float32Array(SR), SR).voices[0].notes).toEqual([]);
  });
});

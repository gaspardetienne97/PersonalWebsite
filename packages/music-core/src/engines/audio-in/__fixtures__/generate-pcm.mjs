// Renders the committed PCM fixtures: 16-bit LE mono at 44.1 kHz, one frame of
// near-silence (so the gate sees a re-arm boundary) then eight frames of a
// decaying harmonic-rich tone. Run `node generate-pcm.mjs` here to regenerate.
//
// ponytail: rendered stand-ins, not microphone recordings. Replace with real
// piano captures once the physical acceptance matrix is run.
import { writeFileSync } from "node:fs";

const SAMPLE_RATE = 44_100;
const FRAME = 2048;
const HARMONICS = [1, 0.5, 0.25, 0.12];

const fixtures = {
  "c4-single.pcm": [60],
  "c-major-triad.pcm": [60, 64, 67],
  "c3-lower-octave.pcm": [48],
};

for (const [name, notes] of Object.entries(fixtures)) {
  const total = FRAME * 9;
  const pcm = new Int16Array(total);
  for (let n = FRAME; n < total; n++) {
    const t = (n - FRAME) / SAMPLE_RATE;
    let sample = 0;
    for (const midi of notes) {
      const f0 = 440 * 2 ** ((midi - 69) / 12);
      for (const [index, gain] of HARMONICS.entries()) {
        sample += gain * Math.sin(2 * Math.PI * f0 * (index + 1) * t);
      }
    }
    sample *= (0.3 / notes.length) * Math.exp(-t * 1.5);
    pcm[n] = Math.round(sample * 32_767);
  }
  for (let n = 0; n < FRAME; n++) pcm[n] = Math.round((Math.random() - 0.5) * 8);
  writeFileSync(new URL(name, import.meta.url), Buffer.from(pcm.buffer));
}

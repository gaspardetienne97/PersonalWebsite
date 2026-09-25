// Radix-2 FFT and a Hann power spectrum, shared by chroma, the note gate and onsets.

/** In-place iterative FFT; `re.length` must be a power of two. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const next = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = next;
      }
    }
  }
}

export const nextPow2 = (n: number) => 2 ** Math.ceil(Math.log2(Math.max(2, n)));

/**
 * Hann-windowed power spectrum, zero-padded to the next power of two.
 * Normalised so a full-scale sine of amplitude A gives a peak near A^2.
 * Returns bins 0..size/2 and the FFT size.
 */
export function powerSpectrum(buf: Float32Array): { power: Float64Array; size: number } {
  const size = nextPow2(buf.length);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const n = buf.length;
  for (let i = 0; i < n; i++) re[i] = buf[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  fft(re, im);
  const power = new Float64Array(size / 2 + 1);
  const norm = 4 / n; // Hann coherent gain 0.5, one-sided x2
  for (let k = 0; k < power.length; k++) {
    const r = re[k] * norm;
    const i = im[k] * norm;
    power[k] = r * r + i * i;
  }
  return { power, size };
}

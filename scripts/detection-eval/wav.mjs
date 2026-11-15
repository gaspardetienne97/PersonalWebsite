// A tiny WAV reader for the test recordings: 32-bit float (what /music/clips
// writes), plus 16 and 24-bit PCM so other takes can be dropped in.
export function readWav(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o) => String.fromCharCode(...bytes.subarray(o, o + 4));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("not a WAV file");
  let fmt = null;
  let data = null;
  for (let o = 12; o + 8 <= bytes.length; ) {
    const id = tag(o);
    const size = v.getUint32(o + 4, true);
    if (id === "fmt ") {
      let format = v.getUint16(o + 8, true);
      if (format === 0xfffe) format = v.getUint16(o + 32, true);
      fmt = {
        format,
        channels: v.getUint16(o + 10, true),
        sampleRate: v.getUint32(o + 12, true),
        bits: v.getUint16(o + 22, true),
      };
    } else if (id === "data") data = { at: o + 8, size: Math.min(size, bytes.length - o - 8) };
    o += 8 + size + (size % 2);
  }
  if (!fmt || !data) throw new Error("WAV without fmt or data");
  const step = fmt.bits / 8;
  const frames = Math.floor(data.size / (step * fmt.channels));
  const channels = Array.from({ length: fmt.channels }, () => new Float32Array(frames));
  const read =
    fmt.format === 3 && fmt.bits === 32
      ? (o) => v.getFloat32(o, true)
      : fmt.format === 1 && fmt.bits === 16
        ? (o) => v.getInt16(o, true) / 32768
        : fmt.format === 1 && fmt.bits === 24
          ? (o) => ((v.getInt8(o + 2) << 16) | v.getUint16(o, true)) / 8388608
          : null;
  if (!read) throw new Error(`unsupported WAV format ${fmt.format}/${fmt.bits}`);
  for (let i = 0, o = data.at; i < frames; i++)
    for (let c = 0; c < fmt.channels; c++, o += step) channels[c][i] = read(o);
  return { channels, sampleRate: fmt.sampleRate };
}

/**
 * Band-limited resampling (Hann-windowed sinc, 32 taps a side). The browser
 * resamples a 16 kHz webcam mic to the AudioContext rate before the app's
 * worklet sees it; this stands in for that.
 */
export function resampleSinc(x, from, to) {
  if (from === to) return x;
  const HALF = 32;
  const cutoff = Math.min(1, to / from);
  const out = new Float32Array(Math.floor((x.length * to) / from));
  for (let i = 0; i < out.length; i++) {
    const pos = (i * from) / to;
    const j0 = Math.floor(pos);
    let acc = 0;
    const lo = Math.max(0, j0 - Math.ceil(HALF / cutoff) + 1);
    const hi = Math.min(x.length - 1, j0 + Math.ceil(HALF / cutoff));
    for (let j = lo; j <= hi; j++) {
      const d = (pos - j) * cutoff;
      if (Math.abs(d) >= HALF) continue;
      const s = d === 0 ? 1 : Math.sin(Math.PI * d) / (Math.PI * d);
      acc += x[j] * s * (0.5 + 0.5 * Math.cos((Math.PI * d) / HALF));
    }
    out[i] = acc * cutoff;
  }
  return out;
}

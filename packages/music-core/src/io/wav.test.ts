import { describe, expect, it } from "vite-plus/test";
import { encodeWav, encodeWavFloat, WAV_FLOAT_HEADER } from "./wav";

describe("encodeWav", () => {
  it("writes a 44-byte header and interleaved 16-bit LE samples", () => {
    const bytes = encodeWav([Float32Array.from([0, 1, -1]), Float32Array.from([0.5, 2, -0.5])]);
    const v = new DataView(bytes.buffer);
    const str = (a: number, n: number) => String.fromCharCode(...bytes.subarray(a, a + n));
    expect(bytes.length).toBe(44 + 12);
    expect([str(0, 4), str(8, 4), str(12, 4), str(36, 4)]).toEqual([
      "RIFF",
      "WAVE",
      "fmt ",
      "data",
    ]);
    expect(v.getUint32(4, true)).toBe(48);
    expect(v.getUint16(20, true)).toBe(1);
    expect(v.getUint16(22, true)).toBe(2);
    expect(v.getUint32(24, true)).toBe(44100);
    expect(v.getUint32(28, true)).toBe(176400);
    expect(v.getUint16(32, true)).toBe(4);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(12);
    const samples = Array.from({ length: 6 }, (_, i) => v.getInt16(44 + i * 2, true));
    expect(samples).toEqual([0, 16383, 32767, 32767, -32768, -16384]);
  });

  it("honours the sample rate for mono", () => {
    const v = new DataView(encodeWav([new Float32Array(10)], 48000).buffer);
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getUint32(24, true)).toBe(48000);
    expect(v.getUint32(40, true)).toBe(20);
  });
});

describe("encodeWavFloat", () => {
  it("writes a float header, a fact chunk and every sample untouched", () => {
    const left = Float32Array.from([0, 0.25, -1.5, 1]);
    const right = Float32Array.from([0.5, -0.125, 2, -1]);
    const bytes = encodeWavFloat([left, right], 48000);
    const v = new DataView(bytes.buffer);
    const str = (a: number, n: number) => String.fromCharCode(...bytes.subarray(a, a + n));
    expect(WAV_FLOAT_HEADER).toBe(58);
    expect(bytes.length).toBe(58 + 4 * 2 * 4);
    expect([str(0, 4), str(8, 4), str(12, 4), str(38, 4), str(50, 4)]).toEqual([
      "RIFF",
      "WAVE",
      "fmt ",
      "fact",
      "data",
    ]);
    expect(v.getUint32(4, true)).toBe(bytes.length - 8);
    expect(v.getUint32(16, true)).toBe(18);
    expect(v.getUint16(20, true)).toBe(3);
    expect(v.getUint16(22, true)).toBe(2);
    expect(v.getUint32(24, true)).toBe(48000);
    expect(v.getUint32(28, true)).toBe(48000 * 2 * 4);
    expect(v.getUint16(32, true)).toBe(8);
    expect(v.getUint16(34, true)).toBe(32);
    expect(v.getUint32(46, true)).toBe(4);
    expect(v.getUint32(54, true)).toBe(32);
    const samples = Array.from({ length: 8 }, (_, i) => v.getFloat32(58 + i * 4, true));
    // Interleaved, and nothing clamped: a sample over full scale stays as it was captured.
    expect(samples).toEqual([0, 0.5, 0.25, -0.125, -1.5, 2, 1, -1]);
  });

  it("keeps a mono take at its own rate", () => {
    const v = new DataView(encodeWavFloat([new Float32Array(10)], 44100).buffer);
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getUint32(24, true)).toBe(44100);
    expect(v.getUint32(46, true)).toBe(10);
    expect(v.getUint32(54, true)).toBe(40);
  });
});

import { describe, expect, it } from "vitest";
import { encodeWav } from "./wav";

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

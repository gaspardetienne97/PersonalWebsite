import { describe, expect, test } from "vitest";

import { encodeWav, midiToFrequency, renderEventsToWav } from "./index";

function readString(view: DataView, offset: number, length: number): string {
  let text = "";
  for (let i = 0; i < length; i += 1) text += String.fromCharCode(view.getUint8(offset + i));
  return text;
}

describe("encodeWav", () => {
  test("writes a RIFF/WAVE PCM16 header sized to the channel data", () => {
    const left = Float32Array.from([0, 1, -1]);
    const right = Float32Array.from([0.5, -0.5, 0]);
    const view = new DataView(encodeWav([left, right], 44100));

    expect(readString(view, 0, 4)).toBe("RIFF");
    expect(readString(view, 8, 4)).toBe("WAVE");
    expect(readString(view, 36, 4)).toBe("data");
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(2); // channels
    expect(view.getUint32(24, true)).toBe(44100); // sample rate
    expect(view.getUint16(34, true)).toBe(16); // bits per sample

    const dataSize = 3 /* frames */ * 2 /* channels */ * 2 /* bytes */;
    expect(view.getUint32(40, true)).toBe(dataSize);
    expect(view.byteLength).toBe(44 + dataSize);
    // Full-scale +1 and -1 clamp to the PCM16 extremes (interleaved L,R; a
    // stereo frame is 4 bytes, so frame N's left channel is at 44 + N*4).
    expect(view.getInt16(44 + 4, true)).toBe(0x7fff); // frame 1, left = 1
    expect(view.getInt16(44 + 8, true)).toBe(-0x8000); // frame 2, left = -1
  });
});

test("midiToFrequency anchors A4 at 440 Hz", () => {
  expect(midiToFrequency(69)).toBeCloseTo(440, 5);
  expect(midiToFrequency(57)).toBeCloseTo(220, 5);
});

describe("renderEventsToWav", () => {
  test("schedules buffers and oscillators then encodes the rendered buffer", async () => {
    const scheduled: Array<{ kind: string; start: number }> = [];

    class FakeParam {
      value = 0;
      setValueAtTime() {
        return this;
      }
      linearRampToValueAtTime() {
        return this;
      }
    }
    class FakeNode {
      gain = new FakeParam();
      frequency = new FakeParam();
      type = "";
      buffer: unknown = null;
      connect() {
        return this;
      }
    }
    const makeSource = (kind: string) =>
      Object.assign(new FakeNode(), {
        start: (when: number) => scheduled.push({ kind, start: when }),
        stop: () => undefined,
      });

    class FakeOfflineContext {
      destination = {};
      constructor(
        public channels: number,
        public length: number,
        public sampleRate: number,
      ) {}
      createGain() {
        return new FakeNode();
      }
      createBufferSource() {
        return makeSource("buffer");
      }
      createOscillator() {
        return makeSource("oscillator");
      }
      async startRendering() {
        const data = new Float32Array(this.length);
        return {
          numberOfChannels: this.channels,
          sampleRate: this.sampleRate,
          getChannelData: () => data,
        } as unknown as AudioBuffer;
      }
    }

    const blob = await renderEventsToWav(
      [
        { startSec: 0, buffer: {} as AudioBuffer, velocity: 0.9 },
        { startSec: 0.25, frequency: 440, durationSec: 0.1 },
      ],
      {
        durationSec: 0.5,
        sampleRate: 8000,
        channels: 1,
        tailSec: 0,
        OfflineAudioContext: FakeOfflineContext as never,
      },
    );

    expect(blob.type).toBe("audio/wav");
    // 0.5s @ 8000 Hz mono = 4000 frames → 44-byte header + 4000*2 data bytes.
    expect(blob.size).toBe(44 + 4000 * 2);
    expect(scheduled).toEqual([
      { kind: "buffer", start: 0 },
      { kind: "oscillator", start: 0.25 },
    ]);
  });
});

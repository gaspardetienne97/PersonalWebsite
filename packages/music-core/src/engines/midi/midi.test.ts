import { describe, expect, test } from "vitest";

import { normalizeMidiMessage, webMidiSupported } from "./index";

describe("music-core/midi", () => {
  test("normalizes note on, note off, CC, pitch bend, and aftertouch", () => {
    expect(normalizeMidiMessage([0x90, 60, 100], 12, "dev-1")).toMatchObject({
      type: "noteOn",
      midiNote: 60,
      velocity: 100 / 127,
      channel: 1,
      source: "midi",
      deviceId: "dev-1",
    });
    expect(normalizeMidiMessage([0x90, 60, 0], 12, "dev-1")).toMatchObject({
      type: "noteOff",
      midiNote: 60,
    });
    expect(normalizeMidiMessage([0xb2, 2, 64], 12, "dev-1")).toMatchObject({
      type: "cc",
      controller: 2,
      value: 64 / 127,
      channel: 3,
    });
    expect(normalizeMidiMessage([0xe0, 0, 64], 12, "dev-1")).toMatchObject({
      type: "pitchBend",
      bend: 0,
    });
    expect(normalizeMidiMessage([0xd0, 80], 12, "dev-1")).toMatchObject({
      type: "aftertouch",
      pressure: 80 / 127,
    });
  });

  test("reports missing Web MIDI support", () => {
    expect(webMidiSupported({})).toBe(false);
    expect(webMidiSupported({ requestMIDIAccess: () => undefined })).toBe(true);
  });
});

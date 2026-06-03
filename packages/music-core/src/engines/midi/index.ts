import { monotonicMs, type NoteEvent } from "@repo/music-core/domain";

export interface MidiDeviceSummary {
  id: string;
  name: string;
  manufacturer?: string;
  state?: string;
}

export interface MidiCapabilities {
  supported: boolean;
  reason?: string;
}

export function webMidiSupported(
  target: Pick<Navigator, "requestMIDIAccess"> | object = globalThis.navigator ?? {},
): boolean {
  return "requestMIDIAccess" in target && typeof target.requestMIDIAccess === "function";
}

export function midiCapabilities(
  target?: Pick<Navigator, "requestMIDIAccess"> | object,
): MidiCapabilities {
  return webMidiSupported(target)
    ? { supported: true }
    : {
        supported: false,
        reason: "Web MIDI is unavailable in this browser. Use Chromium or on-screen input.",
      };
}

export function normalizeMidiMessage(
  data: ArrayLike<number>,
  timestamp: number,
  deviceId?: string,
): NoteEvent {
  const status = data[0] ?? 0;
  const data1 = data[1] ?? 0;
  const data2 = data[2] ?? 0;
  const command = status & 0xf0;
  const channel = (status & 0x0f) + 1;
  const base = {
    source: "midi" as const,
    timestamp: monotonicMs(timestamp),
    clock: "midi" as const,
    ...(deviceId !== undefined ? { deviceId } : {}),
    raw: { midiStatus: status, midiData1: data1, midiData2: data2 },
    channel,
  };

  if (command === 0x90 && data2 > 0) {
    return { ...base, type: "noteOn", midiNote: data1, velocity: data2 / 127 };
  }
  if (command === 0x80 || command === 0x90) {
    return { ...base, type: "noteOff", midiNote: data1 };
  }
  if (command === 0xb0) {
    return { ...base, type: "cc", controller: data1, value: data2 / 127 };
  }
  if (command === 0xe0) {
    const value14 = data1 + data2 * 128;
    return { ...base, type: "pitchBend", bend: (value14 - 8192) / 8192 };
  }
  if (command === 0xd0) {
    return { ...base, type: "aftertouch", pressure: data1 / 127 };
  }
  if (command === 0xa0) {
    return { ...base, type: "aftertouch", midiNote: data1, pressure: data2 / 127 };
  }

  return { ...base, type: "cc", controller: data1, value: data2 / 127 };
}

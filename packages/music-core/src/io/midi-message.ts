// Raw MIDI bytes -> normalized events (hardware notes 3 and 2).
import type { ControlEvent, NoteEvent } from "../types";
import { SOURCE_CONFIDENCE } from "../types";

export type ParsedMidi = NoteEvent | ControlEvent;

export function parseMidiMessage(
  data: ArrayLike<number>,
  at: number,
  deviceId?: string,
): ParsedMidi | null {
  if (!data || data.length === 0) return null;
  const status = data[0];
  if (status < 0x80 || status >= 0xf0) return null; // running status and system messages ignored
  const type = status & 0xf0;
  const channel = (status & 0x0f) + 1;
  const d1 = data[1] ?? 0;
  const d2 = data[2] ?? 0;
  const base = { at, deviceId, channel };
  switch (type) {
    case 0x90:
    case 0x80: {
      const on = type === 0x90 && d2 > 0; // velocity 0 note-on is a note-off
      return {
        ...base,
        kind: on ? "noteon" : "noteoff",
        midi: d1,
        velocity: on ? d2 / 127 : 0,
        source: "midi",
        confidence: SOURCE_CONFIDENCE.midi,
        velocityMeasured: true,
      };
    }
    case 0xb0:
      return { ...base, kind: "cc", controller: d1, value: d2 / 127 };
    case 0xe0:
      return { ...base, kind: "pitchbend", value: ((d2 << 7) | d1) / 8192 - 1 };
    case 0xd0:
      return { ...base, kind: "pressure", value: d1 / 127 };
    case 0xa0:
      return { ...base, kind: "pressure", value: d2 / 127 };
    default:
      return null;
  }
}

export const isSysex = (data: ArrayLike<number>) => data.length > 0 && data[0] === 0xf0;

export const toHex = (data: ArrayLike<number>) =>
  Array.from(data, (b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");

export interface MidiDevice {
  id: string;
  name: string;
  manufacturer: string;
  type: "input" | "output";
  state: "connected" | "disconnected";
}

export interface MidiNote {
  note: number;
  velocity: number;
  channel: number;
  timestamp: number;
}

export interface MidiMessage {
  type: "noteon" | "noteoff" | "cc" | "other";
  note?: number;
  velocity?: number;
  channel: number;
  timestamp: number;
  raw: Uint8Array;
}

export interface PadMapping {
  id: string;
  name: string;
  description: string;
  mapping: Record<number, number>; // pad index -> MIDI note
}

export const GM_DRUM_MAP: Record<number, string> = {
  35: "Acoustic Bass Drum",
  36: "Bass Drum 1",
  37: "Side Stick",
  38: "Acoustic Snare",
  39: "Hand Clap",
  40: "Electric Snare",
  41: "Low Floor Tom",
  42: "Closed Hi-Hat",
  43: "High Floor Tom",
  44: "Pedal Hi-Hat",
  45: "Low Tom",
  46: "Open Hi-Hat",
  47: "Low-Mid Tom",
  48: "Hi-Mid Tom",
  49: "Crash Cymbal 1",
  50: "High Tom",
  51: "Ride Cymbal 1",
  52: "Chinese Cymbal",
  53: "Ride Bell",
  54: "Tambourine",
  55: "Splash Cymbal",
  56: "Cowbell",
  57: "Crash Cymbal 2",
  58: "Vibraslap",
  59: "Ride Cymbal 2",
};

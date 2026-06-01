import { writable, derived } from "svelte/store";
import type { MidiDevice, MidiNote } from "$lib/types/index.js";

export interface MidiState {
  isSupported: boolean;
  isConnected: boolean;
  devices: MidiDevice[];
  activeInputId: string | null;
  lastNote: MidiNote | null;
  error: string | null;
}

const initialState: MidiState = {
  isSupported: false,
  isConnected: false,
  devices: [],
  activeInputId: null,
  lastNote: null,
  error: null,
};

export const midiState = writable<MidiState>(initialState);

export const activeDevice = derived(midiState, ($state) => {
  if (!$state.activeInputId) return null;
  return $state.devices.find((d) => d.id === $state.activeInputId) || null;
});

export const inputDevices = derived(midiState, ($state) =>
  $state.devices.filter((d) => d.type === "input"),
);

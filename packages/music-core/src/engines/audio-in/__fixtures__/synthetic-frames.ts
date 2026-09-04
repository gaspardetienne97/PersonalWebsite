/**
 * Test-only builders for note-gate frames. Synthetic banks test the math;
 * the PCM fixtures beside this file test rendered behaviour.
 */
import type { NoteEnergyBank } from "../chroma";
import { GATE_MAX_MIDI, GATE_MIN_MIDI, type NoteGateFrame } from "../note-gate";

export function bank(energies: Record<number, number> = {}): NoteEnergyBank {
  const out = new Float32Array(GATE_MAX_MIDI - GATE_MIN_MIDI + 1);
  for (const [midi, energy] of Object.entries(energies)) {
    out[Number(midi) - GATE_MIN_MIDI] = energy;
  }
  return { minMidi: GATE_MIN_MIDI, maxMidi: GATE_MAX_MIDI, energies: out };
}

export function frame(
  energies: Record<number, number>,
  options: { rms?: number; onset?: boolean } = {},
): NoteGateFrame {
  return { noteEnergies: bank(energies), rms: options.rms ?? 0.2, onset: options.onset ?? false };
}

export const SILENCE: NoteGateFrame = { noteEnergies: bank(), rms: 0, onset: false };

/** Little-endian 16-bit PCM → Float32 in [-1, 1). */
export function decodePcm16(buffer: ArrayBuffer): Float32Array {
  const view = new DataView(buffer);
  const out = new Float32Array(buffer.byteLength / 2);
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true) / 32_768;
  return out;
}

export function* frames(samples: Float32Array, size = 2048): Generator<Float32Array> {
  for (let offset = 0; offset + size <= samples.length; offset += size) {
    yield samples.subarray(offset, offset + size);
  }
}

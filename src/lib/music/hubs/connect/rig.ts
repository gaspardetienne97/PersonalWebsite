// The Connect rig: which tile a MIDI input or note lights, what a hit reads
// as, and the microphone choices. Connect is the one place the input device
// is picked; Settings only shows the stored label.
import { noteName, type Instrument } from "@repo/music-core";
import type { PickOption } from "$lib/music/components/Picker.svelte";
import { padLabel } from "$lib/music/drills/pads/midi-status";

export type RigTile = "keyboard" | "mpc" | "aerophone";

/** The MPC and the Aerophone have their own tile; any other MIDI input plays keys. */
export const tileFor = (instrument?: Instrument): RigTile =>
  instrument === "mpc" || instrument === "aerophone" ? instrument : "keyboard";

/** A hit as the player knows it: a bank A pad on the MPC, a note name elsewhere. */
export const hitLabel = (tile: RigTile, midi: number) =>
  tile === "mpc" && midi >= 36 && midi <= 51 ? padLabel(midi) : noteName(midi);

/**
 * The microphone picker's options. Before the browser grants the microphone it
 * lists inputs with no ids or names, so the saved input stays listed under its
 * saved name; it only reads "not connected" once names are known and it is missing.
 */
export function micOptions(
  devices: readonly { deviceId: string; label: string }[],
  savedId: string | undefined,
  savedLabel: string,
): PickOption[] {
  const named = devices.filter((d) => d.deviceId && d.deviceId !== "default");
  const options = [
    { value: "", label: "Default input" },
    ...named.map((d) => ({ value: d.deviceId, label: d.label })),
  ];
  if (savedId && !named.some((d) => d.deviceId === savedId))
    options.push({
      value: savedId,
      label: named.length ? `${savedLabel} (not connected)` : savedLabel,
    });
  return options;
}

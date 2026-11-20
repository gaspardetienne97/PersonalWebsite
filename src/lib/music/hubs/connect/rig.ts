// The Connect rig: which tile a MIDI input or note lights, what a hit reads
// as, and the microphone choices. Connect is the one place the input device
// is picked; Settings only shows the stored label.
import { noteName, type Instrument } from "@repo/music-core";
import type { PickOption } from "#lib/music/components/Picker.svelte";
import { padLabel } from "#lib/music/drills/pads/midi-status.ts";
import { m } from "@repo/i18n/messages.js";

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
    { value: "", label: m.music_hubs_rig_default_input() },
    ...named.map((d) => ({ value: d.deviceId, label: d.label })),
  ];
  if (savedId && !named.some((d) => d.deviceId === savedId))
    options.push({
      value: savedId,
      label: named.length ? m.music_hubs_rig_not_connected({ name: savedLabel }) : savedLabel,
    });
  return options;
}

/** The saved microphone's name: its device name, or "Default input" in the visitor's language. */
export const inputName = (deviceId: string | undefined, label: string) =>
  deviceId ? label : m.music_hubs_rig_default_input();

/**
 * A raw MIDI message ("99 2A 64") in words, for the activity feed: "Note on F#2,
 * velocity 100". `name` reads a note number the way the device's player knows it
 * (a pad on the MPC). The bytes stay one toggle away.
 */
export function describeMidi(
  hex: string,
  name: (note: number) => string = (n) => noteName(n),
): string {
  const b = hex
    .trim()
    .split(/\s+/)
    .map((x) => parseInt(x, 16));
  const s = b[0];
  if (!Number.isFinite(s)) return m.music_hubs_midi_unreadable();
  if (s === 0xf0) return m.music_hubs_midi_sysex({ count: b.length });
  if (s === 0xf8) return m.music_hubs_midi_clock();
  if (s === 0xfe) return m.music_hubs_midi_sensing();
  if (s >= 0xf0) return m.music_hubs_midi_system();
  const ch = (s & 0x0f) + 1;
  const [d1 = 0, d2 = 0] = b.slice(1);
  switch (s & 0xf0) {
    case 0x90:
      return d2
        ? m.music_hubs_midi_played({ note: name(d1), strength: strength(d2).toLowerCase() })
        : m.music_hubs_midi_released({ note: name(d1) });
    case 0x80:
      return m.music_hubs_midi_released({ note: name(d1) });
    case 0xa0:
      return m.music_hubs_midi_pressure_note({ note: name(d1), value: d2 });
    case 0xb0:
      return d1 === 2
        ? m.music_hubs_midi_breath({ value: d2 })
        : m.music_hubs_midi_controller({ cc: d1, value: d2 });
    case 0xc0:
      return m.music_hubs_midi_program({ n: d1 + 1 });
    case 0xd0:
      return m.music_hubs_midi_pressure({ value: d1 });
    case 0xe0:
      return m.music_hubs_midi_bend({ value: ((d2 << 7) | d1) - 8192 });
  }
  return m.music_hubs_midi_channel({ ch });
}

/** A note's velocity (1 to 127) in a player's word; the raw number waits behind Show details. */
export const strength = (v: number) =>
  v < 50
    ? m.music_hubs_midi_soft()
    : v < 96
      ? m.music_hubs_midi_medium()
      : m.music_hubs_midi_hard();

/** The velocity of a note-on with sound, else null (releases, controllers, system messages). */
export function velocityOf(hex: string): number | null {
  const [s = NaN, , v = 0] = hex
    .trim()
    .split(/\s+/)
    .map((x) => parseInt(x, 16));
  return (s & 0xf0) === 0x90 && v > 0 ? v : null;
}

/** Messages a player does not need to read (releases, clock ticks, keep-alives): shown only with details. */
export function isDetail(hex: string): boolean {
  const [s = NaN, , v = 0] = hex
    .trim()
    .split(/\s+/)
    .map((x) => parseInt(x, 16));
  const kind = s & 0xf0;
  return kind === 0x80 || (kind === 0x90 && v === 0) || s === 0xf8 || s === 0xfe;
}

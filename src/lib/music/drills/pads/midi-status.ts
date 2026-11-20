// What a hardware note became on its way into a drill, in words (lessons §2:
// "what was missing was any way to see, from the drill, what a hardware note
// became"). Pure: the same profile functions the runtime applies, so the line
// cannot disagree with what the drill actually received.
import type { DeviceProfile, Instrument } from "@repo/music-core";
import { noteName } from "@repo/music-core";
import { parseMidiMessage } from "@repo/music-core/io/midi-message";
import { detectInstrument, rewritePadNote } from "@repo/music-core/io/devices";
import { m } from "@repo/i18n/messages.js";
import { formatList } from "@repo/i18n/format";

export interface PortLike {
  id: string;
  name: string;
  manufacturer: string;
}

export const padLabel = (midi: number) => `A${String(midi - 35).padStart(2, "0")}`;
const inBankA = (midi: number) => midi >= 36 && midi <= 51;

export const instrumentOf = (port: PortLike, profile?: DeviceProfile): Instrument | undefined =>
  profile?.instrument ?? detectInstrument(port.name, port.manufacturer);

/**
 * One plain sentence about a raw note-on, or null for anything that is not a
 * note-on. The raw note number stays out of the sentence (a learner cannot act
 * on it) and comes back as `midi`, for a tooltip.
 */
export function explainNote(
  data: ArrayLike<number>,
  port: PortLike,
  profile?: DeviceProfile,
): { text: string; used: boolean; midi: number } | null {
  const e = parseMidiMessage(data, 0, port.id);
  if (!e || e.kind !== "noteon") return null;
  const name = profile?.alias ?? port.name;
  const said = (text: string, used: boolean) => ({ text, used, midi: e.midi });
  if (profile?.ignored) return said(m.music_winds_midi_dropped_hidden({ name }), false);
  if (profile?.channel && e.channel && e.channel !== profile.channel)
    return said(
      m.music_winds_midi_dropped_channel({ name, channel: e.channel, pinned: profile.channel }),
      false,
    );
  if (instrumentOf(port, profile) !== "mpc")
    return said(m.music_winds_midi_hearing_note({ name, note: noteName(e.midi) }), true);
  const mapped = rewritePadNote(e.midi, profile?.padNotes);
  if (profile?.padNotes && profile.padNotes.includes(e.midi))
    return said(m.music_winds_midi_hearing_pad({ name, pad: padLabel(mapped) }), true);
  if (inBankA(mapped))
    return said(
      (profile?.padNotes
        ? m.music_winds_midi_hearing_pad_unsaved
        : m.music_winds_midi_hearing_pad_default)({ name, pad: padLabel(mapped) }),
      true,
    );
  return said(m.music_winds_midi_outside_bank({ name }), true);
}

/** Why nothing is arriving yet, in the order the owner actually hit these. */
export function waitingReason(s: {
  supported: boolean;
  enabled: boolean;
  instrument: Instrument;
  inputs: readonly PortLike[];
  profiles: readonly DeviceProfile[];
  link: "off" | "no-sysex" | "no-output" | "linked";
}): string {
  if (!s.supported) return m.music_winds_midi_no_webmidi();
  if (!s.enabled) return m.music_winds_midi_off();
  const mine = s.inputs.filter(
    (p) =>
      instrumentOf(
        p,
        s.profiles.find((x) => x.id === p.id),
      ) === s.instrument,
  );
  const kind = s.instrument === "mpc" || s.instrument === "aerophone" ? s.instrument : "device";
  if (!mine.length)
    return {
      mpc: m.music_winds_midi_no_port_mpc,
      aerophone: m.music_winds_midi_no_port_aerophone,
      device: m.music_winds_midi_no_port_device,
    }[kind]();
  const live = mine.filter((p) => !s.profiles.find((x) => x.id === p.id)?.ignored);
  if (!live.length)
    return {
      mpc: m.music_winds_midi_all_ignored_mpc,
      aerophone: m.music_winds_midi_all_ignored_aerophone,
      device: m.music_winds_midi_all_ignored_device,
    }[kind]();
  if (s.instrument === "mpc") {
    if (s.link === "linked")
      return m.music_winds_midi_linked({ ports: live.map((p) => p.name).join(", ") });
    // The port is there (the top bar names it) and MIDI is on: what is missing is the link, without which a
    // standalone MPC keeps its pad notes to itself. Said as that, never as "not heard" (a hit that does arrive is).
    const waiting =
      s.link === "no-sysex"
        ? m.music_winds_midi_waiting_sysex
        : s.link === "no-output"
          ? m.music_winds_midi_waiting_output
          : m.music_winds_midi_waiting_link;
    return waiting({ ports: formatList(live.map((p) => p.name)), count: live.length });
  }
  return m.music_winds_midi_listening({ ports: live.map((p) => p.name).join(", ") });
}

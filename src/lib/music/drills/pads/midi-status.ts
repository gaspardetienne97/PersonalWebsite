// What a hardware note became on its way into a drill, in words (lessons §2:
// "what was missing was any way to see, from the drill, what a hardware note
// became"). Pure: the same profile functions the runtime applies, so the line
// cannot disagree with what the drill actually received.
import type { DeviceProfile, Instrument } from "@repo/music-core";
import { noteName } from "@repo/music-core";
import { parseMidiMessage } from "@repo/music-core/io/midi-message";
import { detectInstrument, rewritePadNote } from "@repo/music-core/io/devices";

export interface PortLike {
  id: string;
  name: string;
  manufacturer: string;
}

export const padLabel = (midi: number) => `A${String(midi - 35).padStart(2, "0")}`;
const inBankA = (midi: number) => midi >= 36 && midi <= 51;

export const instrumentOf = (port: PortLike, profile?: DeviceProfile): Instrument | undefined =>
  profile?.instrument ?? detectInstrument(port.name, port.manufacturer);

/** One sentence about a raw note-on, or null for anything that is not a note-on. */
export function explainNote(
  data: ArrayLike<number>,
  port: PortLike,
  profile?: DeviceProfile,
): { text: string; used: boolean } | null {
  const e = parseMidiMessage(data, 0, port.id);
  if (!e || e.kind !== "noteon") return null;
  const from = `Last note ${e.midi} from ${profile?.alias ?? port.name}`;
  if (profile?.ignored)
    return { text: `${from} was dropped: that port is ignored in Connect.`, used: false };
  if (profile?.channel && e.channel && e.channel !== profile.channel)
    return {
      text: `${from} was dropped: it came on channel ${e.channel}, the device is pinned to ${profile.channel}.`,
      used: false,
    };
  if (instrumentOf(port, profile) !== "mpc")
    return { text: `${from}, played as ${noteName(e.midi)}.`, used: true };
  const mapped = rewritePadNote(e.midi, profile?.padNotes);
  if (profile?.padNotes && profile.padNotes.includes(e.midi))
    return { text: `${from}, mapped to pad ${padLabel(mapped)}.`, used: true };
  if (inBankA(mapped))
    return {
      text: `${from}, read as pad ${padLabel(mapped)}${profile?.padNotes ? " (not in the saved map)" : " (no pad map saved, so chromatic from 36)"}.`,
      used: true,
    };
  return {
    text: `${from} is outside bank A, so no pad lights. Save the pad map that matches your drum program in Connect.`,
    used: true,
  };
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
  if (!s.supported)
    return "Web MIDI is unavailable in this browser. Use Chromium, or the on-screen surface.";
  if (!s.enabled) return "MIDI is off, so no hardware notes reach this drill.";
  const mine = s.inputs.filter(
    (p) =>
      instrumentOf(
        p,
        s.profiles.find((x) => x.id === p.id),
      ) === s.instrument,
  );
  const noun =
    s.instrument === "mpc" ? "MPC" : s.instrument === "aerophone" ? "Aerophone" : "device";
  if (!mine.length) return `No ${noun} port is connected. On-screen input works meanwhile.`;
  const live = mine.filter((p) => !s.profiles.find((x) => x.id === p.id)?.ignored);
  if (!live.length)
    return `Every ${noun} port is ignored in Connect, so none of its notes reach the drill.`;
  if (s.instrument === "mpc") {
    if (s.link === "no-sysex")
      return "No controller link: SysEx was not granted, and the MPC only sends pad notes while linked.";
    if (s.link === "no-output")
      return "No controller link: the linked MPC output is not connected.";
    if (s.link !== "linked")
      return "No controller link: the MPC only sends pad notes while the app keeps it linked. Link it in Connect.";
    return `Linked and listening on ${live.map((p) => p.name).join(", ")}. Hit a pad.`;
  }
  return `Listening on ${live.map((p) => p.name).join(", ")}. Play a note.`;
}

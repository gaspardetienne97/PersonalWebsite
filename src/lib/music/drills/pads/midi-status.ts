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
  if (profile?.ignored)
    return said(`A note from ${name} was dropped: that device is hidden in Connect.`, false);
  if (profile?.channel && e.channel && e.channel !== profile.channel)
    return said(
      `A note from ${name} was dropped: it came on channel ${e.channel}, and Connect pins the device to channel ${profile.channel}.`,
      false,
    );
  if (instrumentOf(port, profile) !== "mpc")
    return said(`Hearing ${name}. Last note: ${noteName(e.midi)}.`, true);
  const mapped = rewritePadNote(e.midi, profile?.padNotes);
  if (profile?.padNotes && profile.padNotes.includes(e.midi))
    return said(`Hearing ${name}. Last hit: pad ${padLabel(mapped)}.`, true);
  if (inBankA(mapped))
    return said(
      `Hearing ${name}. Last hit: pad ${padLabel(mapped)}${profile?.padNotes ? " (not in your saved pad map)" : ", using the default pad order"}.`,
      true,
    );
  return said(
    `${name} sent a pad outside bank A, so no pad lights. Save the pad map for your drum program in Connect.`,
    true,
  );
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
  if (!s.supported) return "This browser has no Web MIDI. Use Chrome or Edge, or play on screen.";
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
    if (s.link === "linked")
      return `Linked and listening on ${live.map((p) => p.name).join(", ")}. Hit a pad.`;
    // The port is there (the top bar names it) and MIDI is on: what is missing is the link, without which a
    // standalone MPC keeps its pad notes to itself. Said as that, never as "not heard" (a hit that does arrive is).
    const fix =
      s.link === "no-sysex"
        ? "allow SysEx, then link it in Connect."
        : s.link === "no-output"
          ? "its output isn't connected, so check the cable, then Connect."
          : "link it in Connect.";
    return `${live.map((p) => p.name).join(" and ")} ${live.length > 1 ? "are" : "is"} connected, but no pad hit has arrived yet. If the pads stay silent here, ${fix}`;
  }
  return `Listening on ${live.map((p) => p.name).join(", ")}. Play a note.`;
}

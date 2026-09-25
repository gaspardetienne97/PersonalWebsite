// Device profiles, detection and pad maps, applied once at the input boundary.
import type {
  ControlEvent,
  DeviceProfile,
  Instrument,
  NoteEvent,
  PreferredSurface,
} from "../types";

type ParsedMidiLike = NoteEvent | ControlEvent;

export const PAD_PRESETS = {
  "chromatic-36": {
    label: "Chromatic from 36 (C1)",
    notes: Array.from({ length: 16 }, (_, i) => 36 + i),
  },
  "akai-classic": {
    label: "Akai Classic MPC map",
    notes: [37, 36, 42, 82, 40, 38, 46, 44, 48, 47, 45, 43, 49, 55, 51, 53],
  },
  "chromatic-37": {
    label: "Chromatic from 37",
    notes: Array.from({ length: 16 }, (_, i) => 37 + i),
  },
} as const;
export type PadPresetId = keyof typeof PAD_PRESETS;

/** Exactly 16 distinct integers 0..127, or the map is rejected. */
export function isValidPadMap(notes: unknown): notes is number[] {
  return (
    Array.isArray(notes) &&
    notes.length === 16 &&
    notes.every((n) => Number.isInteger(n) && n >= 0 && n <= 127) &&
    new Set(notes).size === 16
  );
}

export function presetForMap(notes: number[] | undefined): PadPresetId | "learned" | undefined {
  if (!notes) return undefined;
  for (const [id, p] of Object.entries(PAD_PRESETS)) {
    if (p.notes.every((n, i) => n === notes[i])) return id as PadPresetId;
  }
  return "learned";
}

/** Note at index i of the map becomes 36 + i; notes not in the map pass through. */
export function rewritePadNote(midi: number, padNotes?: number[]): number {
  if (!padNotes) return midi;
  const i = padNotes.indexOf(midi);
  return i === -1 ? midi : 36 + i;
}

export function detectInstrument(name = "", manufacturer = ""): Instrument | undefined {
  const s = `${name} ${manufacturer}`.toLowerCase();
  if (s.includes("aerophone") || (s.includes("roland") && /ae-\d+/.test(s))) return "aerophone";
  if (/mpc|akai/.test(s)) return "mpc";
  if (
    /piano|keys|keyboard|fp-|digital|roland|yamaha|kawai|casio|nord|korg|arturia|novation|m-audio/.test(
      s,
    )
  )
    return "piano";
  return undefined;
}

/** Private port carries pad LED control; prefer it, then any MPC/Akai port, then the first. */
export function pickMpcOutput<
  T extends { id: string; name?: string | null; manufacturer?: string | null },
>(outputs: T[]): T | undefined {
  const text = (o: T) => `${o.name ?? ""} ${o.manufacturer ?? ""}`;
  return (
    outputs.find((o) => /mpc|akai/i.test(text(o)) && /private/i.test(o.name ?? "")) ??
    outputs.find((o) => /mpc|akai/i.test(text(o))) ??
    outputs[0]
  );
}

export const OFFSET_LIMIT_MS = 500;
export const sanitizeOffset = (ms: unknown): number | undefined =>
  typeof ms === "number" && Number.isFinite(ms) && Math.abs(ms) <= OFFSET_LIMIT_MS
    ? Math.round(ms)
    : undefined;

/** Keep every known field (the old `sanitizeProfile` dropped `ignored`). */
export function sanitizeProfile(raw: unknown): DeviceProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id) return null;
  const p: DeviceProfile = { id: r.id };
  if (typeof r.alias === "string" && r.alias.trim()) p.alias = r.alias.trim().slice(0, 60);
  if (typeof r.instrument === "string") p.instrument = r.instrument as Instrument;
  if (Number.isInteger(r.channel) && (r.channel as number) >= 1 && (r.channel as number) <= 16)
    p.channel = r.channel as number;
  if (r.ignored === true) p.ignored = true;
  if (isValidPadMap(r.padNotes)) p.padNotes = [...r.padNotes];
  const off = sanitizeOffset(r.inputOffsetMs);
  if (off !== undefined) p.inputOffsetMs = off;
  if (r.controllerLink === true) p.controllerLink = true;
  return p;
}

/**
 * Pure profile application. Returns null when the event must not reach drills
 * (ignored port, wrong channel). Control events keep their instrument swap too.
 */
export function applyProfile<E extends ParsedMidiLike>(
  event: E,
  profile?: DeviceProfile,
): E | null {
  if (!profile) return event;
  if (profile.ignored) return null;
  if (profile.channel && event.channel && event.channel !== profile.channel) return null;
  const out = { ...event };
  if (profile.instrument) out.instrument = profile.instrument;
  if ((out.kind === "noteon" || out.kind === "noteoff") && profile.padNotes) {
    (out as unknown as NoteEvent).midi = rewritePadNote(
      (out as unknown as NoteEvent).midi,
      profile.padNotes,
    );
  }
  return out;
}

export function defaultSurface(instrument: Instrument): PreferredSurface {
  return instrument === "guitar"
    ? "guitar"
    : instrument === "ukulele"
      ? "ukulele"
      : instrument === "mpc"
        ? "mpc"
        : "keyboard";
}

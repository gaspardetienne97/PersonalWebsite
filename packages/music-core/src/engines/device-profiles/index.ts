import type { InputSource, InstrumentId } from "@repo/music-core/domain";
import type { SettingsRecord } from "@repo/music-core/engines/store";

const INSTRUMENTS: readonly InstrumentId[] = [
  "piano",
  "guitar",
  "ukulele",
  "aerophone",
  "mpc",
  "voice",
];
const SOURCES: readonly InputSource[] = ["midi", "audio", "onscreen", "click"];

export function inputSourceLabel(source?: InputSource | "mixed"): string {
  return source
    ? {
        midi: "MIDI",
        audio: "Microphone",
        onscreen: "On-screen",
        click: "Answer buttons",
        mixed: "Mixed input",
      }[source]
    : "Not observed";
}

/** On-screen input surfaces the player can fall back to per instrument. */
export type InputSurfaceId = "keyboard" | "guitar" | "ukulele" | "mpc";

const SURFACES: readonly InputSurfaceId[] = ["keyboard", "guitar", "ukulele", "mpc"];

/** The surface that best matches an instrument when the user has not chosen one. */
export function defaultSurfaceForInstrument(instrument: InstrumentId): InputSurfaceId {
  switch (instrument) {
    case "guitar":
      return "guitar";
    case "ukulele":
      return "ukulele";
    case "mpc":
      return "mpc";
    default:
      return "keyboard";
  }
}

/** A persisted, user-editable profile for a connected (or known) input device. */
export interface DeviceProfile {
  /** Stable device id (Web MIDI port id) or a synthetic id. */
  id: string;
  /** Friendly alias the user assigns. */
  alias?: string;
  /** Which instrument this device plays. */
  instrument?: InstrumentId;
  /** Preferred MIDI channel (1-16), when fixed. */
  channel?: number;
  /** Drop this input's note events (e.g. an MPC control port that floods traffic). */
  ignored?: boolean;
  /**
   * The MIDI note each hardware pad sends, pad A01 (bottom-left) first, 16
   * entries. Exercises and the on-screen grid speak the canonical bank-A
   * layout (36..51), so an incoming note is rewritten to 36 + its pad index
   * before it reaches the router. Absent means the device already sends the
   * canonical chromatic map.
   */
  padNotes?: number[];
  /**
   * This port is an MPC's MIDI output in Controller Mode: keep the captured
   * init handshake and one-second heartbeat alive on it whenever MIDI is on,
   * because the MPC only sends pad notes while a host is talking to it.
   */
  controllerLink?: true;
}

/** Bank A as the app draws and grades it: pad A01 = 36 … A16 = 51. */
export const CANONICAL_PAD_NOTES: readonly number[] = Array.from({ length: 16 }, (_, i) => 36 + i);

export interface PadNotePreset {
  id: string;
  label: string;
  notes: readonly number[];
}

/**
 * Known MPC pad note maps. "Classic" is Akai's legacy default drum-program map
 * (pad A01 sends 37, A02 sends 36, A06 sends 38 …); newer firmware defaults to
 * chromatic from C1. A learned map from the Connect page overrides both.
 */
export const MPC_PAD_NOTE_PRESETS: readonly PadNotePreset[] = [
  { id: "chromatic-36", label: "Chromatic from 36 (C1)", notes: CANONICAL_PAD_NOTES },
  {
    id: "classic",
    label: "Akai Classic MPC map",
    notes: [37, 36, 42, 82, 40, 38, 46, 44, 48, 47, 45, 43, 49, 55, 51, 53],
  },
  {
    id: "chromatic-37",
    label: "Chromatic from 37",
    notes: Array.from({ length: 16 }, (_, i) => 37 + i),
  },
];

/** Which preset a saved map equals, or "custom" for a learned map. */
export function padNotePresetId(padNotes: readonly number[] | undefined): string {
  if (!padNotes) return MPC_PAD_NOTE_PRESETS[0]!.id;
  return (
    MPC_PAD_NOTE_PRESETS.find((preset) => preset.notes.every((note, i) => note === padNotes[i]))
      ?.id ?? "custom"
  );
}

/**
 * Translate a note the hardware sent into the canonical bank-A note the app
 * grades. Notes outside the map (other banks, keys) pass through unchanged.
 */
export function canonicalPadNote(padNotes: readonly number[] | undefined, note: number): number {
  if (!padNotes) return note;
  const index = padNotes.indexOf(note);
  return index >= 0 && index < 16 ? 36 + index : note;
}

/**
 * Apply what Connect saved for a device to one of its events: the assigned
 * instrument wins over port-name detection, and a hardware pad note becomes
 * the canonical bank-A note. Events from unknown devices pass through.
 */
export function applyDeviceProfile<E extends { deviceId?: string; instrument?: InstrumentId }>(
  event: E,
  profile: DeviceProfile | undefined,
): E {
  if (!profile) return event;
  let next = event;
  if (profile.instrument && profile.instrument !== next.instrument) {
    next = { ...next, instrument: profile.instrument };
  }
  const current = (next as { midiNote?: unknown }).midiNote;
  if (profile.padNotes && typeof current === "number") {
    const midiNote = canonicalPadNote(profile.padNotes, current);
    if (midiNote !== current) next = { ...next, midiNote } as E;
  }
  return next;
}

function sanitizePadNotes(value: unknown): number[] | undefined {
  if (!Array.isArray(value) || value.length !== 16) return undefined;
  const notes = value.map((note) => (typeof note === "number" ? Math.round(note) : NaN));
  if (notes.some((note) => !Number.isFinite(note) || note < 0 || note > 127)) return undefined;
  if (new Set(notes).size !== 16) return undefined;
  return notes;
}

export type InstrumentSourcePreferences = Partial<Record<InstrumentId, InputSource>>;
export type InstrumentSurfacePreferences = Partial<Record<InstrumentId, InputSurfaceId>>;

export interface DeviceProfilesState {
  profiles: DeviceProfile[];
  preferences: InstrumentSourcePreferences;
  /** Preferred on-screen input surface per instrument (overrides the default). */
  surfaces: InstrumentSurfacePreferences;
}

const STORE_ID = "music.device-profiles";

export interface DeviceProfileRepository {
  get(id: string): Promise<SettingsRecord | undefined>;
  put(record: SettingsRecord): Promise<void>;
}

export class DeviceProfileStore {
  #state: DeviceProfilesState = { profiles: [], preferences: {}, surfaces: {} };

  constructor(private readonly repository?: DeviceProfileRepository) {}

  get(): DeviceProfilesState {
    return {
      profiles: this.#state.profiles.map((p) => ({ ...p })),
      preferences: { ...this.#state.preferences },
      surfaces: { ...this.#state.surfaces },
    };
  }

  profile(id: string): DeviceProfile | undefined {
    const found = this.#state.profiles.find((profile) => profile.id === id);
    return found ? { ...found } : undefined;
  }

  preference(instrument: InstrumentId): InputSource | undefined {
    return this.#state.preferences[instrument];
  }

  /** The chosen on-screen surface, or the instrument's sensible default. */
  surface(instrument: InstrumentId): InputSurfaceId {
    return this.#state.surfaces[instrument] ?? defaultSurfaceForInstrument(instrument);
  }

  async load(): Promise<DeviceProfilesState> {
    const record = await this.repository?.get(STORE_ID);
    this.#state = parseState(record?.value);
    return this.get();
  }

  async saveProfile(profile: DeviceProfile): Promise<DeviceProfilesState> {
    const clean = sanitizeProfile(profile);
    if (!clean) throw new Error("A device profile needs a non-empty id");
    const next = this.#state.profiles.filter((existing) => existing.id !== clean.id);
    next.push(clean);
    this.#state = { ...this.#state, profiles: next };
    await this.#persist();
    return this.get();
  }

  async removeProfile(id: string): Promise<DeviceProfilesState> {
    this.#state = {
      ...this.#state,
      profiles: this.#state.profiles.filter((profile) => profile.id !== id),
    };
    await this.#persist();
    return this.get();
  }

  async setPreference(instrument: InstrumentId, source: InputSource): Promise<DeviceProfilesState> {
    this.#state = {
      ...this.#state,
      preferences: { ...this.#state.preferences, [instrument]: source },
    };
    await this.#persist();
    return this.get();
  }

  async setSurface(
    instrument: InstrumentId,
    surface: InputSurfaceId,
  ): Promise<DeviceProfilesState> {
    this.#state = {
      ...this.#state,
      surfaces: { ...this.#state.surfaces, [instrument]: surface },
    };
    await this.#persist();
    return this.get();
  }

  async #persist(): Promise<void> {
    await this.repository?.put({ id: STORE_ID, value: this.#state });
  }
}

function parseState(value: unknown): DeviceProfilesState {
  if (typeof value !== "object" || value === null)
    return { profiles: [], preferences: {}, surfaces: {} };
  const source = value as Partial<DeviceProfilesState>;
  const profiles = Array.isArray(source.profiles)
    ? source.profiles
        .map(sanitizeProfile)
        .filter((profile): profile is DeviceProfile => profile !== undefined)
    : [];
  const preferences: InstrumentSourcePreferences = {};
  if (typeof source.preferences === "object" && source.preferences !== null) {
    for (const instrument of INSTRUMENTS) {
      const pref = (source.preferences as Record<string, unknown>)[instrument];
      if (typeof pref === "string" && SOURCES.includes(pref as InputSource)) {
        preferences[instrument] = pref as InputSource;
      }
    }
  }
  const surfaces: InstrumentSurfacePreferences = {};
  if (typeof source.surfaces === "object" && source.surfaces !== null) {
    for (const instrument of INSTRUMENTS) {
      const surface = (source.surfaces as Record<string, unknown>)[instrument];
      if (typeof surface === "string" && SURFACES.includes(surface as InputSurfaceId)) {
        surfaces[instrument] = surface as InputSurfaceId;
      }
    }
  }
  return { profiles, preferences, surfaces };
}

function sanitizeProfile(value: unknown): DeviceProfile | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const source = value as Partial<DeviceProfile>;
  if (typeof source.id !== "string" || source.id.length === 0) return undefined;
  const profile: DeviceProfile = { id: source.id };
  if (typeof source.alias === "string" && source.alias.length > 0) profile.alias = source.alias;
  if (
    typeof source.instrument === "string" &&
    INSTRUMENTS.includes(source.instrument as InstrumentId)
  ) {
    profile.instrument = source.instrument as InstrumentId;
  }
  if (typeof source.channel === "number" && source.channel >= 1 && source.channel <= 16) {
    profile.channel = Math.round(source.channel);
  }
  if (source.ignored === true) profile.ignored = true;
  if (source.controllerLink === true) profile.controllerLink = true;
  const padNotes = sanitizePadNotes(source.padNotes);
  if (padNotes) profile.padNotes = padNotes;
  return profile;
}

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
}

export type InstrumentSourcePreferences = Partial<Record<InstrumentId, InputSource>>;

export interface DeviceProfilesState {
  profiles: DeviceProfile[];
  preferences: InstrumentSourcePreferences;
}

const STORE_ID = "music.device-profiles";

export interface DeviceProfileRepository {
  get(id: string): Promise<SettingsRecord | undefined>;
  put(record: SettingsRecord): Promise<void>;
}

export class DeviceProfileStore {
  #state: DeviceProfilesState = { profiles: [], preferences: {} };

  constructor(private readonly repository?: DeviceProfileRepository) {}

  get(): DeviceProfilesState {
    return {
      profiles: this.#state.profiles.map((p) => ({ ...p })),
      preferences: { ...this.#state.preferences },
    };
  }

  profile(id: string): DeviceProfile | undefined {
    const found = this.#state.profiles.find((profile) => profile.id === id);
    return found ? { ...found } : undefined;
  }

  preference(instrument: InstrumentId): InputSource | undefined {
    return this.#state.preferences[instrument];
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

  async #persist(): Promise<void> {
    await this.repository?.put({ id: STORE_ID, value: this.#state });
  }
}

function parseState(value: unknown): DeviceProfilesState {
  if (typeof value !== "object" || value === null) return { profiles: [], preferences: {} };
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
  return { profiles, preferences };
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
  return profile;
}

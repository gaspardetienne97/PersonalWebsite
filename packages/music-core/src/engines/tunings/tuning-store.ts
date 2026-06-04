import type { SettingsRecord } from "@repo/music-core/engines/store";

import {
  validateTuning,
  type StringInstrumentId,
  type TuningProfile,
} from "@repo/music-core/engines/tunings";

const CUSTOM_TUNINGS_ID = "music.custom-tunings";

export interface TuningSettingsRepository {
  get(id: string): Promise<SettingsRecord | undefined>;
  put(record: SettingsRecord): Promise<void>;
}

export class CustomTuningStore {
  constructor(private readonly settings: TuningSettingsRepository) {}

  async list(instrument?: StringInstrumentId): Promise<TuningProfile[]> {
    const profiles = await this.#load();
    return profiles.filter(
      (profile) => instrument === undefined || profile.instrument === instrument,
    );
  }

  async save(profile: TuningProfile): Promise<void> {
    if (profile.source !== "custom") throw new Error("Only custom tunings can be saved");
    const validation = validateTuning(profile);
    const error = Object.values(validation.errors)[0];
    if (error) throw new Error(error);

    const profiles = await this.#load();
    const next = profiles.filter(({ id }) => id !== profile.id);
    next.push(structuredClone(profile));
    await this.#persist(next);
  }

  async delete(id: string): Promise<void> {
    if (!id.startsWith("custom.")) throw new Error("Curated tunings cannot be deleted");
    const profiles = await this.#load();
    await this.#persist(profiles.filter((profile) => profile.id !== id));
  }

  async #load(): Promise<TuningProfile[]> {
    const record = await this.settings.get(CUSTOM_TUNINGS_ID);
    if (!record || !Array.isArray(record.value)) return [];

    return record.value
      .filter(isTuningProfile)
      .filter((profile) => profile.source === "custom" && validateTuning(profile).valid)
      .map((profile) => structuredClone(profile));
  }

  async #persist(profiles: TuningProfile[]): Promise<void> {
    await this.settings.put({ id: CUSTOM_TUNINGS_ID, value: profiles });
  }
}

function isTuningProfile(value: unknown): value is TuningProfile {
  if (typeof value !== "object" || value === null) return false;
  const profile = value as Partial<TuningProfile>;
  return (
    typeof profile.id === "string" &&
    typeof profile.name === "string" &&
    (profile.instrument === "guitar" || profile.instrument === "ukulele") &&
    Array.isArray(profile.openStrings) &&
    typeof profile.fretCount === "number" &&
    typeof profile.notationTransposition === "number" &&
    (profile.source === "curated" || profile.source === "custom")
  );
}

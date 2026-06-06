import type { SettingsRecord } from "@repo/music-core/engines/store";

/**
 * Local, client-side Music app settings. Persisted as a single key/value row in
 * {@link SettingsRecord} (no server, no migration). Theme is intentionally NOT
 * here — the parent site owns light/dark; these are Music-specific preferences.
 */
export interface MusicSettings {
  /** Disable browser audio processing for accurate pitch detection. */
  echoCancellation: boolean;
  /** Minimise animations and glow pulses. */
  reduceMotion: boolean;
  /** Tint UI by the active instrument. */
  instrumentColorCoding: boolean;
  /** Sound set used for prompt playback. */
  defaultSoundSet: string;
  /** Human label for the chosen audio input. */
  audioInputLabel: string;
  /** Latency-calibration offsets (ms). */
  audioOffsetMs: number;
  midiOffsetMs: number;
}

export const DEFAULT_MUSIC_SETTINGS: MusicSettings = {
  echoCancellation: false,
  reduceMotion: false,
  instrumentColorCoding: true,
  defaultSoundSet: "Salamander Piano",
  audioInputLabel: "Default input",
  audioOffsetMs: 0,
  midiOffsetMs: 0,
};

const SETTINGS_ID = "music.settings";

export interface MusicSettingsRepository {
  get(id: string): Promise<SettingsRecord | undefined>;
  put(record: SettingsRecord): Promise<void>;
}

export class MusicSettingsStore {
  #settings: MusicSettings = { ...DEFAULT_MUSIC_SETTINGS };

  constructor(private readonly repository?: MusicSettingsRepository) {}

  /** Current in-memory settings (call {@link load} first to hydrate). */
  get(): MusicSettings {
    return { ...this.#settings };
  }

  async load(): Promise<MusicSettings> {
    const record = await this.repository?.get(SETTINGS_ID);
    this.#settings = mergeSettings(record?.value);
    return this.get();
  }

  async update(patch: Partial<MusicSettings>): Promise<MusicSettings> {
    this.#settings = mergeSettings({ ...this.#settings, ...patch });
    await this.repository?.put({ id: SETTINGS_ID, value: this.#settings });
    return this.get();
  }
}

function mergeSettings(value: unknown): MusicSettings {
  if (typeof value !== "object" || value === null) return { ...DEFAULT_MUSIC_SETTINGS };
  const source = value as Partial<MusicSettings>;
  return {
    echoCancellation: bool(source.echoCancellation, DEFAULT_MUSIC_SETTINGS.echoCancellation),
    reduceMotion: bool(source.reduceMotion, DEFAULT_MUSIC_SETTINGS.reduceMotion),
    instrumentColorCoding: bool(
      source.instrumentColorCoding,
      DEFAULT_MUSIC_SETTINGS.instrumentColorCoding,
    ),
    defaultSoundSet: str(source.defaultSoundSet, DEFAULT_MUSIC_SETTINGS.defaultSoundSet),
    audioInputLabel: str(source.audioInputLabel, DEFAULT_MUSIC_SETTINGS.audioInputLabel),
    audioOffsetMs: num(source.audioOffsetMs, DEFAULT_MUSIC_SETTINGS.audioOffsetMs),
    midiOffsetMs: num(source.midiOffsetMs, DEFAULT_MUSIC_SETTINGS.midiOffsetMs),
  };
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function str(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

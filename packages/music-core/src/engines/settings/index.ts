import type { InstrumentId } from "@repo/music-core/domain";
import type { SettingsRecord } from "@repo/music-core/engines/store";

export const PLAYBACK_SOUND_IDS = [
  "salamander-piano",
  "warm-synth",
  "synth",
  "e-piano",
  "square",
  "saw",
] as const;

export type PlaybackSoundId = (typeof PLAYBACK_SOUND_IDS)[number];

export const PLAYBACK_SOUND_LABELS: Record<PlaybackSoundId, string> = {
  "salamander-piano": "Sampled Piano",
  "warm-synth": "Warm Synth",
  synth: "Synth",
  "e-piano": "E-Piano",
  square: "Square",
  saw: "Saw",
};

export interface MusicSettings {
  echoCancellation: boolean;
  reduceMotion: boolean;
  instrumentColorCoding: boolean;
  audioInputLabel: string;
  audioOffsetMs: number;
  midiOffsetMs: number;
  preferredPlaybackSound: PlaybackSoundId;
  playbackLevel: number;
  metronomeLevel: number;
  masterLevel: number;
  muted: boolean;
  metronomeEnabled: boolean;
  countInBars: 0 | 1 | 2;
  activeInstrument: InstrumentId;
  tempoByVariant: Record<string, number>;
}

export const DEFAULT_MUSIC_SETTINGS: MusicSettings = {
  echoCancellation: false,
  reduceMotion: false,
  instrumentColorCoding: true,
  audioInputLabel: "Default input",
  audioOffsetMs: 0,
  midiOffsetMs: 0,
  preferredPlaybackSound: "salamander-piano",
  playbackLevel: 0.8,
  metronomeLevel: 0.7,
  masterLevel: 1.0,
  muted: false,
  metronomeEnabled: true,
  countInBars: 1,
  activeInstrument: "piano",
  tempoByVariant: {},
};

const SETTINGS_ID = "music.settings";
const BPM_MIN = 20;
const BPM_MAX = 300;
const TEMPO_MAP_MAX = 200;

export function v1TempoKey(raw: string): string {
  return raw.startsWith("v1:") ? raw : `v1:${raw}`;
}

export function isV1TempoKey(key: string): boolean {
  return key.startsWith("v1:");
}

export function updateTempoByVariant(
  map: Record<string, number>,
  rawKey: string,
  bpm: number,
): Record<string, number> {
  const key = v1TempoKey(rawKey);
  const clamped = Math.round(Math.max(BPM_MIN, Math.min(BPM_MAX, bpm)));
  const next: Record<string, number> = {};
  for (const [k, v] of Object.entries(map)) {
    if (k !== key) next[k] = v;
  }
  next[key] = clamped;
  const entries = Object.entries(next);
  if (entries.length <= TEMPO_MAP_MAX) return next;
  const pruned: Record<string, number> = {};
  for (let i = entries.length - TEMPO_MAP_MAX; i < entries.length; i++) {
    pruned[entries[i][0]] = entries[i][1];
  }
  return pruned;
}

export function lookupTempoByVariant(
  map: Record<string, number>,
  rawKey: string,
): number | undefined {
  return map[v1TempoKey(rawKey)];
}

export function pruneInvalidTempoKeys(map: Record<string, number>): Record<string, number> {
  const valid: Record<string, number> = {};
  for (const [key, value] of Object.entries(map)) {
    if (isV1TempoKey(key) && Number.isFinite(value) && value >= BPM_MIN && value <= BPM_MAX) {
      valid[key] = Math.round(value);
    }
  }
  return valid;
}

export interface MusicSettingsRepository {
  get(id: string): Promise<SettingsRecord | undefined>;
  put(record: SettingsRecord): Promise<void>;
}

const LEGACY_SOUND_MAP: Record<string, PlaybackSoundId> = {
  "Salamander Piano": "salamander-piano",
  "Warm Synth": "warm-synth",
  Synth: "synth",
  "E-Piano": "e-piano",
  Square: "square",
  Saw: "saw",
};

export class MusicSettingsStore {
  #settings: MusicSettings = { ...DEFAULT_MUSIC_SETTINGS };
  #earlyPatches: Array<Partial<MusicSettings>> = [];
  #loaded = false;
  #loadPromise: Promise<void> | undefined;
  #writeTail: Promise<void> = Promise.resolve();

  constructor(private readonly repository?: MusicSettingsRepository) {}

  get loaded(): boolean {
    return this.#loaded;
  }

  get(): MusicSettings {
    return { ...this.#settings };
  }

  async load(): Promise<MusicSettings> {
    if (!this.#loadPromise) {
      this.#loadPromise = this.#doLoad();
    }
    return this.#loadPromise.then(() => this.get());
  }

  get ready(): Promise<void> {
    return (
      this.#loadPromise?.catch((error: unknown) => {
        if (!this.#loaded) throw error;
      }) ?? Promise.resolve()
    );
  }

  /** Apply a patch immediately. Returns the new merged settings. */
  async update(patch: Partial<MusicSettings>): Promise<MusicSettings> {
    if (!this.#loaded) {
      this.#earlyPatches.push(patch);
      this.#settings = mergeSettingsWithPatches(this.#settings, this.#earlyPatches);
      return this.get();
    }
    this.#settings = mergeSettings({ ...this.#settings, ...patch });
    await this.#persist();
    return this.get();
  }

  async #doLoad(): Promise<void> {
    const record = await this.repository?.get(SETTINGS_ID);
    const raw = record?.value as Record<string, unknown> | undefined;
    this.#settings = mergeSettings(raw ?? {});
    this.#loaded = true;
    if (this.#earlyPatches.length > 0) {
      this.#settings = mergeSettingsWithPatches(this.#settings, this.#earlyPatches);
      this.#earlyPatches = [];
      await this.#persist();
    }
  }

  async #persist(): Promise<void> {
    const snapshot: MusicSettings = {
      ...this.#settings,
      tempoByVariant: { ...this.#settings.tempoByVariant },
    };
    const write = this.#writeTail.then(() =>
      this.repository?.put({ id: SETTINGS_ID, value: snapshot }),
    );
    this.#writeTail = write.catch(() => undefined);
    await write;
  }
}

function mergeSettingsWithPatches(
  base: MusicSettings,
  patches: Array<Partial<MusicSettings>>,
): MusicSettings {
  let result = { ...base };
  for (const patch of patches) {
    result = mergeSettings({ ...result, ...patch });
  }
  return result;
}

function mergeSettings(value: Record<string, unknown>): MusicSettings {
  return {
    echoCancellation: bool(value.echoCancellation, DEFAULT_MUSIC_SETTINGS.echoCancellation),
    reduceMotion: bool(value.reduceMotion, DEFAULT_MUSIC_SETTINGS.reduceMotion),
    instrumentColorCoding: bool(
      value.instrumentColorCoding,
      DEFAULT_MUSIC_SETTINGS.instrumentColorCoding,
    ),
    audioInputLabel: str(value.audioInputLabel) ?? DEFAULT_MUSIC_SETTINGS.audioInputLabel,
    audioOffsetMs: num(value.audioOffsetMs, DEFAULT_MUSIC_SETTINGS.audioOffsetMs),
    midiOffsetMs: num(value.midiOffsetMs, DEFAULT_MUSIC_SETTINGS.midiOffsetMs),
    preferredPlaybackSound: playbackSound(
      value.preferredPlaybackSound,
      legacyPlaybackSound(value.defaultSoundSet),
      DEFAULT_MUSIC_SETTINGS.preferredPlaybackSound,
    ),
    playbackLevel: clampLevel(value.playbackLevel, DEFAULT_MUSIC_SETTINGS.playbackLevel),
    metronomeLevel: clampLevel(value.metronomeLevel, DEFAULT_MUSIC_SETTINGS.metronomeLevel),
    masterLevel: clampLevel(value.masterLevel, DEFAULT_MUSIC_SETTINGS.masterLevel),
    muted: bool(value.muted, DEFAULT_MUSIC_SETTINGS.muted),
    metronomeEnabled: bool(value.metronomeEnabled, DEFAULT_MUSIC_SETTINGS.metronomeEnabled),
    countInBars: countIn(value.countInBars, DEFAULT_MUSIC_SETTINGS.countInBars),
    activeInstrument: instrumentId(value.activeInstrument, DEFAULT_MUSIC_SETTINGS.activeInstrument),
    tempoByVariant: pruneInvalidTempoKeys(toRecord(value.tempoByVariant)),
  };
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
}

function clampLevel(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, Math.round(value * 100) / 100));
}

function countIn(value: unknown, fallback: 0 | 1 | 2): 0 | 1 | 2 {
  if (value === 0 || value === "0") return 0;
  if (value === 1 || value === "1") return 1;
  if (value === 2 || value === "2") return 2;
  return fallback;
}

function instrumentId(value: unknown, fallback: InstrumentId): InstrumentId {
  const valid: readonly InstrumentId[] = [
    "piano",
    "guitar",
    "ukulele",
    "aerophone",
    "mpc",
    "voice",
  ];
  if (typeof value === "string" && (valid as readonly string[]).includes(value)) {
    return value as InstrumentId;
  }
  return fallback;
}

function playbackSound(
  preferred: unknown,
  legacy: PlaybackSoundId | undefined,
  fallback: PlaybackSoundId,
): PlaybackSoundId {
  if (
    typeof preferred === "string" &&
    preferred.length > 0 &&
    (PLAYBACK_SOUND_IDS as readonly string[]).includes(preferred)
  ) {
    return preferred as PlaybackSoundId;
  }
  if (legacy !== undefined) return legacy;
  return fallback;
}

function legacyPlaybackSound(value: unknown): PlaybackSoundId | undefined {
  if (typeof value !== "string") return undefined;
  return LEGACY_SOUND_MAP[value];
}

function toRecord(value: unknown): Record<string, number> {
  if (typeof value !== "object" || value === null) return {};
  const record: Record<string, number> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "number" && Number.isFinite(v)) {
      record[k] = v;
    }
  }
  return record;
}

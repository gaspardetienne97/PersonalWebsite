import type { SettingsRecord } from "@repo/music-core/engines/store";
import type {
  ScaleHands,
  ScaleMotion,
  ScalePatternKind,
  ScaleSpan,
} from "@repo/music-core/exercises/scale-pattern";

/** Settings row holding every unlocked rung, keyed by variant. */
export const TEMPO_LADDER_SETTINGS_ID = "technique.tempo-ladder.v1";

/** Where a variant's ladder starts before anything is unlocked. */
export const TEMPO_LADDER_BASE_BPM = 100;

/** The slice of the practice store the ladder needs (PracticeStore#settings). */
export interface TempoLadderStore {
  get(id: string): Promise<SettingsRecord | undefined>;
  put(record: SettingsRecord): Promise<void>;
}

export interface ScaleLadderVariant {
  scale: ScalePatternKind;
  tonic: string;
  motion: ScaleMotion;
  span: ScaleSpan;
  hands: ScaleHands;
}

/** The ladder key for a scale setup: one rung per distinct drill. */
export function scaleLadderVariantKey(variant: ScaleLadderVariant): string {
  return `${variant.scale}:${variant.tonic}:${variant.motion}:${variant.span}:${variant.hands}`;
}

/**
 * The tempo ladder, persisted per (exercise, variant). The rung a player has
 * earned is progress, not session state: it has to survive a reload, so it
 * lives in the practice store rather than in the technique session.
 */
export class TempoLadder {
  #rungs = new Map<string, number>();
  #loaded?: Promise<void>;

  constructor(
    private readonly store?: TempoLadderStore,
    private readonly baseBpm = TEMPO_LADDER_BASE_BPM,
  ) {}

  /** The highest unlocked tempo for a variant, or the caller's base tempo. */
  async readLadder(variantKey: string, fallbackBpm = this.baseBpm): Promise<number> {
    await this.#load();
    return this.#rungs.get(variantKey) ?? fallbackBpm;
  }

  /** Record an unlocked tempo. A rung never drops. */
  async writeLadder(variantKey: string, bpm: number): Promise<void> {
    await this.#load();
    if (!Number.isFinite(bpm) || bpm <= (this.#rungs.get(variantKey) ?? this.baseBpm)) return;
    this.#rungs.set(variantKey, Math.round(bpm));
    // Another tab may have unlocked a different variant since we loaded: the row
    // is rewritten whole, so merge the stored rungs back in before putting it.
    await this.#read();
    await this.store?.put({
      id: TEMPO_LADDER_SETTINGS_ID,
      value: Object.fromEntries(this.#rungs),
    });
  }

  #load(): Promise<void> {
    this.#loaded ??= this.#read();
    return this.#loaded;
  }

  /** Merge the stored row into the in-memory rungs, keeping the higher of each. */
  async #read(): Promise<void> {
    try {
      const record = await this.store?.get(TEMPO_LADDER_SETTINGS_ID);
      const value = record?.value;
      if (typeof value !== "object" || value === null) return;
      for (const [key, bpm] of Object.entries(value as Record<string, unknown>)) {
        if (typeof bpm === "number" && bpm >= 1) {
          this.#rungs.set(key, Math.max(bpm, this.#rungs.get(key) ?? 0));
        }
      }
    } catch {
      // An unreadable ladder is a base ladder, never a dead Start button. The
      // failure is not cached, so a later read retries the store.
      this.#loaded = undefined;
    }
  }
}

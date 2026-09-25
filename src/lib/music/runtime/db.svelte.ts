// Dexie database `woodshed` (scoring rules 14, TASKS.md storage decision).
// A .svelte.ts file so `plain` can use the real `$state.snapshot`.
import Dexie, { type EntityTable } from "dexie";
import type {
  Instrument,
  PracticeSession,
  ScoringEvent,
  Skill,
  SkillMastery,
  SkillRelationship,
} from "@repo/music-core";

/** Rows the runtime does not own the shape of carry their indexed fields plus anything else. */
type Row<K extends string, T> = { [P in K]: T } & { [key: string]: unknown };

export type ChordLibraryRow = Row<"id" | "symbol", string>;
export type SongRow = { id: string; title: string; createdAt: number; updatedAt: number } & {
  [key: string]: unknown;
};
export type BackingTrackRow = { id: string; name: string; createdAt: number } & {
  [key: string]: unknown;
};
export type AudioTakeRow = {
  id: string;
  createdAt: number;
  instrument?: Instrument;
  backingTrackId?: string;
  gainDb?: number;
  note?: string;
} & { [key: string]: unknown };
export type MidiTakeRow = { id: string; createdAt: number } & { [key: string]: unknown };
export type SettingRow = { id: string; value: unknown };

export type WoodshedDb = Dexie & {
  sessions: EntityTable<PracticeSession, "id">;
  scoringEvents: EntityTable<ScoringEvent, "id">;
  skillMastery: EntityTable<SkillMastery, "skillId">;
  skills: EntityTable<Skill, "id">;
  skillRelationships: EntityTable<SkillRelationship & { id?: number }, "id">;
  chordLibrary: EntityTable<ChordLibraryRow, "id">;
  songs: EntityTable<SongRow, "id">;
  settings: EntityTable<SettingRow, "id">;
  backingTracks: EntityTable<BackingTrackRow, "id">;
  audioTakes: EntityTable<AudioTakeRow, "id">;
  midiTakes: EntityTable<MidiTakeRow, "id">;
};

/**
 * Turn Svelte `$state` proxies into plain data. IndexedDB's structured clone
 * throws on proxies, which is how the old app silently lost MIDI takes.
 */
export function plain<T>(value: T): T {
  return $state.snapshot(value) as T;
}

export const db = new Dexie("woodshed") as WoodshedDb;
db.version(1).stores({
  sessions: "id, startTime, endTime, instrument, source",
  scoringEvents: "id, sessionId, exerciseId, at",
  skillMastery: "skillId, lastPracticed",
  skills: "id, capability",
  skillRelationships: "++id, from, to, kind",
  chordLibrary: "id, symbol",
  songs: "id, title, createdAt, updatedAt",
  settings: "id",
  backingTracks: "id, name, createdAt",
  audioTakes: "id, createdAt, instrument, backingTrackId",
  midiTakes: "id, createdAt",
});

// The choke point: every add/put/update on every table goes through plain(),
// so no caller can hand a proxy to IndexedDB even if it forgets to.
db.use({
  stack: "dbcore",
  name: "plain-values",
  create: (down) => ({
    ...down,
    table(name) {
      const table = down.table(name);
      return {
        ...table,
        mutate(req) {
          if (req.type !== "add" && req.type !== "put") return table.mutate(req);
          const values = req.values.map((v) => plain(v));
          if (req.type === "put" && req.changeSpec)
            return table.mutate({ ...req, values, changeSpec: plain(req.changeSpec) });
          return table.mutate({ ...req, values });
        },
      };
    },
  }),
});

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row === undefined ? fallback : (row.value as T);
}

export async function putSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ id: key, value: plain(value) });
}

import Dexie, { type Table } from "dexie";

import type {
  ChordEvent,
  InstrumentId,
  PracticeSession,
  Score,
  ScoringEvent,
  Skill,
  SkillMastery,
  SkillRelationship,
  UnixMs,
} from "@repo/music-core/domain";

export interface SettingsRecord {
  id: string;
  value: unknown;
}

export type SkillRelationshipRow = SkillRelationship & { id: string };

export interface ChordLibraryRow {
  id: string;
  symbol: string;
  event?: ChordEvent;
  notes?: string[];
  tags?: string[];
  createdAt?: number;
}

export interface SongRow {
  id: string;
  title: string;
  score?: Score;
  createdAt?: number;
  updatedAt?: number;
}

export interface ImportedBackingTrackRow {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  durationMs: number;
  createdAt: UnixMs;
}

export interface AudioTakeRow {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  durationMs: number;
  createdAt: UnixMs;
  instrument: InstrumentId;
  backingTrackId?: string;
  backingKind?: "generated" | "imported";
  backingOffsetMs: number;
  generatedBacking?: {
    progressionId: string;
    bpm: number;
    loop: boolean;
  };
}

interface IterableFileSystemDirectoryHandle extends FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
}

const LOCAL_BINARY_STORAGE_UNAVAILABLE = "Local binary storage is unavailable.";

const VERSION_1_STORES = {
  sessions: "id, startTime, endTime, instrument, source",
  scoringEvents: "id, sessionId, exerciseId, at",
  skillMastery: "skillId, lastPracticed",
  skills: "id, capability",
  skillRelationships: "id, from, to, kind",
  chordLibrary: "id, symbol",
  songs: "id, title, createdAt, updatedAt",
  settings: "id",
};

export class PracticeDatabase extends Dexie {
  sessions!: Table<PracticeSession, string>;
  scoringEvents!: Table<ScoringEvent, string>;
  skillMastery!: Table<SkillMastery, string>;
  skills!: Table<Skill, string>;
  skillRelationships!: Table<SkillRelationshipRow, string>;
  chordLibrary!: Table<ChordLibraryRow, string>;
  songs!: Table<SongRow, string>;
  settings!: Table<SettingsRecord, string>;
  backingTracks!: Table<ImportedBackingTrackRow, string>;
  audioTakes!: Table<AudioTakeRow, string>;

  constructor(name = "musicianship-os") {
    super(name);
    this.version(1).stores(VERSION_1_STORES);
    this.version(2).stores({
      ...VERSION_1_STORES,
      backingTracks: "id, name, createdAt",
      audioTakes: "id, createdAt, instrument, backingTrackId",
    });
  }
}

export class DexieRepository<T> {
  constructor(private readonly table: Table<T, string>) {}

  async put(row: T): Promise<void> {
    await this.table.put(structuredClone(row));
  }

  async get(id: string): Promise<T | undefined> {
    const row = await this.table.get(id);
    return row === undefined ? undefined : structuredClone(row);
  }

  async all(): Promise<T[]> {
    const rows = await this.table.toArray();
    return rows.map((row) => structuredClone(row));
  }

  async delete(id: string): Promise<void> {
    await this.table.delete(id);
  }
}

export class PracticeStore {
  readonly sessions: DexieRepository<PracticeSession>;
  readonly scoringEvents: DexieRepository<ScoringEvent>;
  readonly skills: DexieRepository<Skill>;
  readonly skillMastery: DexieRepository<SkillMastery>;
  readonly skillRelationships: DexieRepository<SkillRelationshipRow>;
  readonly chordLibrary: DexieRepository<ChordLibraryRow>;
  readonly songs: DexieRepository<SongRow>;
  readonly settings: DexieRepository<SettingsRecord>;
  readonly backingTracks: DexieRepository<ImportedBackingTrackRow>;
  readonly audioTakes: DexieRepository<AudioTakeRow>;

  constructor(readonly database = new PracticeDatabase()) {
    this.sessions = new DexieRepository(database.sessions);
    this.scoringEvents = new DexieRepository(database.scoringEvents);
    this.skills = new DexieRepository(database.skills);
    this.skillMastery = new DexieRepository(database.skillMastery);
    this.skillRelationships = new DexieRepository(database.skillRelationships);
    this.chordLibrary = new DexieRepository(database.chordLibrary);
    this.songs = new DexieRepository(database.songs);
    this.settings = new DexieRepository(database.settings);
    this.backingTracks = new DexieRepository(database.backingTracks);
    this.audioTakes = new DexieRepository(database.audioTakes);
  }
}

export function skillRelationshipRow(relationship: SkillRelationship): SkillRelationshipRow {
  return {
    id: `${relationship.from}:${relationship.kind}:${relationship.to}`,
    ...relationship,
  };
}

export async function putBinary(key: string, blob: Blob): Promise<void> {
  const root = await getOpfsRoot();
  if (!root) throw new Error(LOCAL_BINARY_STORAGE_UNAVAILABLE);
  const handle = await root.getFileHandle(key, { create: true });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

export async function deleteBinary(key: string): Promise<void> {
  const root = await getOpfsRoot();
  if (!root) throw new Error(LOCAL_BINARY_STORAGE_UNAVAILABLE);
  try {
    await root.removeEntry(key);
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return;
    throw error;
  }
}

export async function getBinary(key: string): Promise<Blob | undefined> {
  const root = await getOpfsRoot();
  if (!root) return undefined;
  try {
    return await (await root.getFileHandle(key)).getFile();
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return undefined;
    throw error;
  }
}

export async function list(prefix = ""): Promise<string[]> {
  const root = await getOpfsRoot();
  if (!root) return [];
  const keys: string[] = [];
  for await (const [name] of (root as IterableFileSystemDirectoryHandle).entries()) {
    if (name.startsWith(prefix)) keys.push(name);
  }
  return keys.sort();
}

export async function storageEstimate(): Promise<StorageEstimate> {
  if (typeof navigator === "undefined") return {};
  return (await navigator.storage?.estimate?.()) ?? {};
}

async function getOpfsRoot(): Promise<FileSystemDirectoryHandle | undefined> {
  if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) return undefined;
  return navigator.storage.getDirectory();
}

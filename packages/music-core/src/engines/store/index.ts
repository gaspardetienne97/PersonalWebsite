import Dexie, { type Table } from "dexie";

import type {
  ChordEvent,
  PracticeSession,
  Score,
  ScoringEvent,
  Skill,
  SkillMastery,
  SkillRelationship,
} from "@repo/music-core/domain";

export interface SettingsRecord {
  id: string;
  value: unknown;
}

export type SkillMasteryRow = SkillMastery & { id: string };
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

interface IterableFileSystemDirectoryHandle extends FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
}

export class PracticeDatabase extends Dexie {
  sessions!: Table<PracticeSession, string>;
  scoringEvents!: Table<ScoringEvent, string>;
  skillMastery!: Table<SkillMasteryRow, string>;
  skills!: Table<Skill, string>;
  skillRelationships!: Table<SkillRelationshipRow, string>;
  chordLibrary!: Table<ChordLibraryRow, string>;
  songs!: Table<SongRow, string>;
  settings!: Table<SettingsRecord, string>;

  constructor(name = "musicianship-os") {
    super(name);
    this.version(1).stores({
      sessions: "id, startTime, endTime, instrument, source",
      scoringEvents: "id, sessionId, exerciseId, at",
      skillMastery: "id, skillId, lastPracticed",
      skills: "id, capability",
      skillRelationships: "id, from, to, kind",
      chordLibrary: "id, symbol",
      songs: "id, title, createdAt, updatedAt",
      settings: "id",
    });
  }
}

export class DexieRepository<T extends { id: string }> {
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
  readonly skillMastery: DexieRepository<SkillMasteryRow>;
  readonly skillRelationships: DexieRepository<SkillRelationshipRow>;
  readonly chordLibrary: DexieRepository<ChordLibraryRow>;
  readonly songs: DexieRepository<SongRow>;
  readonly settings: DexieRepository<SettingsRecord>;

  constructor(readonly database = new PracticeDatabase()) {
    this.sessions = new DexieRepository(database.sessions);
    this.scoringEvents = new DexieRepository(database.scoringEvents);
    this.skills = new DexieRepository(database.skills);
    this.skillMastery = new DexieRepository(database.skillMastery);
    this.skillRelationships = new DexieRepository(database.skillRelationships);
    this.chordLibrary = new DexieRepository(database.chordLibrary);
    this.songs = new DexieRepository(database.songs);
    this.settings = new DexieRepository(database.settings);
  }
}

export function skillMasteryRow(mastery: SkillMastery): SkillMasteryRow {
  return { id: mastery.skillId, ...mastery };
}

export function skillRelationshipRow(relationship: SkillRelationship): SkillRelationshipRow {
  return {
    id: `${relationship.from}:${relationship.kind}:${relationship.to}`,
    ...relationship,
  };
}

export async function putBinary(key: string, blob: Blob): Promise<void> {
  const root = await getOpfsRoot();
  if (!root) {
    console.warn("OPFS unavailable; binary write skipped", key);
    return;
  }
  const handle = await root.getFileHandle(key, { create: true });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

export async function getBinary(key: string): Promise<Blob | undefined> {
  const root = await getOpfsRoot();
  if (!root) return undefined;
  try {
    return await (await root.getFileHandle(key)).getFile();
  } catch {
    return undefined;
  }
}

export async function listBinary(prefix = ""): Promise<string[]> {
  const root = await getOpfsRoot();
  if (!root) return [];
  const keys: string[] = [];
  for await (const [name] of (root as IterableFileSystemDirectoryHandle).entries()) {
    if (name.startsWith(prefix)) keys.push(name);
  }
  return keys.sort();
}

async function getOpfsRoot(): Promise<FileSystemDirectoryHandle | undefined> {
  if (!("storage" in navigator) || !navigator.storage.getDirectory) return undefined;
  return navigator.storage.getDirectory();
}

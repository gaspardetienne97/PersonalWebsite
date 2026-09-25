// Data backup (JSON) and full backup (ZIP with media) per scoring rules §14.
// Pure: the runtime reads Dexie/OPFS, hands rows and blobs in, and restores what
// comes back. It also owns "never overwrite a differing file": every restored
// asset carries its sha256 for that comparison.
import JSZip from "jszip";

export const DATA_BACKUP_FORMAT = "woodshed-data-backup";
export const FULL_BACKUP_FORMAT = "woodshed-full-backup";
export const BACKUP_VERSION = 1;
/** Older formats that still restore: format -> accepted versions. */
const ACCEPTED_DATA: Record<string, number[]> = {
  [DATA_BACKUP_FORMAT]: [1],
  "practice-os-data-backup": [1, 2],
};
const ACCEPTED_FULL: Record<string, number[]> = {
  [FULL_BACKUP_FORMAT]: [1],
  "practice-os-full-backup": [1, 2],
};
const MiB = 1024 * 1024;
export const DATA_BACKUP_LIMIT = 50 * MiB;
export const FULL_BACKUP_LIMIT = 250 * MiB;
export const FULL_BACKUP_MAX_FILES = 10000;

export const BACKUP_TABLES = [
  "sessions",
  "scoringEvents",
  "skillMastery",
  "skills",
  "skillRelationships",
  "chordLibrary",
  "songs",
  "settings",
  "backingTracks",
  "audioTakes",
  "midiTakes",
] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];
export type Row = Record<string, unknown>;

export interface MediaCounts {
  backingTracks: number;
  audioTakes: number;
  samples: number;
}
export interface DataBackup {
  format: typeof DATA_BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  tables: Record<BackupTable, Row[]>;
  /** Media files are never inside a data backup; these count what was left out. */
  media: { included: false } & MediaCounts;
}
export interface BackupIssue {
  path: string;
  message: string;
}
export type BackupRead<T> =
  | { ok: true; value: T; legacy: boolean }
  | { ok: false; errors: BackupIssue[] };

// Required fields are the Dexie primary key and indexes (§14); the rest are
// type-checked when present. "?" = may be absent.
type Kind = "string" | "number" | "boolean" | "array" | "object" | "key";
const SCHEMA: Record<BackupTable, { key: string; fields: Record<string, `${Kind}${"" | "?"}`> }> = {
  sessions: {
    key: "id",
    fields: {
      id: "string",
      startTime: "number",
      endTime: "number?",
      instrument: "string?",
      source: "string",
      runs: "array?",
      eventIds: "array?",
      xp: "number?",
      tags: "array?",
    },
  },
  scoringEvents: {
    key: "id",
    fields: {
      id: "string",
      sessionId: "string",
      exerciseId: "string",
      at: "number",
      correct: "boolean?",
      partialCredit: "number?",
      skillIds: "array?",
      metrics: "array?",
      assistance: "string?",
    },
  },
  skillMastery: {
    key: "skillId",
    fields: {
      skillId: "string",
      lastPracticed: "number",
      mastery: "number?",
      confidence: "number?",
    },
  },
  skills: {
    key: "id",
    fields: { id: "string", capability: "string", name: "string?", tags: "array?" },
  },
  skillRelationships: {
    key: "id",
    fields: { id: "key", from: "string", to: "string", kind: "string" },
  },
  chordLibrary: { key: "id", fields: { id: "string", symbol: "string" } },
  songs: {
    key: "id",
    fields: {
      id: "string",
      title: "string",
      createdAt: "number",
      updatedAt: "number",
      score: "object?",
    },
  },
  settings: { key: "id", fields: { id: "string" } },
  backingTracks: { key: "id", fields: { id: "string", name: "string", createdAt: "number" } },
  audioTakes: {
    key: "id",
    fields: {
      id: "string",
      createdAt: "number",
      instrument: "string?",
      backingTrackId: "string?",
      gainDb: "number?",
      note: "string?",
    },
  },
  midiTakes: { key: "id", fields: { id: "string", createdAt: "number" } },
};

const isObj = (v: unknown): v is Row => typeof v === "object" && v !== null && !Array.isArray(v);
const kindOf = (v: unknown): Kind | "other" =>
  Array.isArray(v)
    ? "array"
    : isObj(v)
      ? "object"
      : typeof v === "number"
        ? Number.isFinite(v)
          ? "number"
          : "other"
        : typeof v === "string"
          ? "string"
          : typeof v === "boolean"
            ? "boolean"
            : "other";
const isCount = (v: unknown) => Number.isInteger(v) && (v as number) >= 0;
const utf8Length = (s: string) => new TextEncoder().encode(s).length;

function checkTables(
  tables: unknown,
  path: string,
  allowMissing: BackupTable[],
  errors: BackupIssue[],
) {
  if (!isObj(tables)) return void errors.push({ path, message: "must be an object of tables" });
  for (const table of BACKUP_TABLES) {
    const rows = tables[table];
    const at = `${path}.${table}`;
    if (rows === undefined && allowMissing.includes(table)) continue;
    if (!Array.isArray(rows)) {
      errors.push({ path: at, message: "must be an array of rows" });
      continue;
    }
    const { key, fields } = SCHEMA[table];
    const seen = new Set<unknown>();
    rows.forEach((row, i) => {
      const rp = `${at}[${i}]`;
      if (!isObj(row)) return void errors.push({ path: rp, message: "must be an object" });
      for (const [field, spec] of Object.entries(fields)) {
        const optional = spec.endsWith("?");
        const want = spec.replace("?", "") as Kind;
        const v = row[field];
        if (v === undefined || (optional && v === null)) {
          if (!optional)
            errors.push({ path: `${rp}.${field}`, message: `is missing (expected ${want})` });
        } else if (
          want === "key" ? !["string", "number"].includes(kindOf(v)) : kindOf(v) !== want
        ) {
          errors.push({
            path: `${rp}.${field}`,
            message:
              want === "key"
                ? "must be a string or number key"
                : `must be ${want === "array" ? "an" : "a"} ${want}`,
          });
        }
      }
      if (seen.has(row[key]))
        errors.push({ path: `${rp}.${key}`, message: `duplicates an earlier ${key}` });
      seen.add(row[key]);
    });
  }
}

/** Validate a parsed data backup (current or legacy) and return it in the current shape. */
export function validateDataBackup(input: unknown, path = "backup"): BackupRead<DataBackup> {
  const errors: BackupIssue[] = [];
  if (!isObj(input)) return { ok: false, errors: [{ path, message: "is not a backup object" }] };
  const versions = ACCEPTED_DATA[input.format as string];
  if (!versions)
    return {
      ok: false,
      errors: [{ path: `${path}.format`, message: "is not a Woodshed data backup" }],
    };
  if (!versions.includes(input.version as number))
    errors.push({
      path: `${path}.version`,
      message: `version ${String(input.version)} is not supported`,
    });
  const legacy = input.format !== DATA_BACKUP_FORMAT;
  if (typeof input.exportedAt !== "string" || Number.isNaN(Date.parse(input.exportedAt)))
    errors.push({ path: `${path}.exportedAt`, message: "must be an ISO date" });
  checkTables(input.tables, `${path}.tables`, legacy ? ["midiTakes"] : [], errors);
  const media = input.media;
  if (!isObj(media)) errors.push({ path: `${path}.media`, message: "must be an object" });
  else {
    if (media.included !== false)
      errors.push({
        path: `${path}.media.included`,
        message: "must be false: a data backup holds no media",
      });
    for (const k of ["backingTracks", "audioTakes", "samples"] as const)
      if (!isCount(media[k]))
        errors.push({ path: `${path}.media.${k}`, message: "must be a whole number ≥ 0" });
  }
  if (errors.length) return { ok: false, errors };
  const t = input.tables as Record<string, Row[]>;
  const m = media as Row;
  return {
    ok: true,
    legacy,
    value: {
      format: DATA_BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: input.exportedAt as string,
      tables: Object.fromEntries(BACKUP_TABLES.map((k) => [k, t[k] ?? []])) as DataBackup["tables"],
      media: {
        included: false,
        backingTracks: m.backingTracks as number,
        audioTakes: m.audioTakes as number,
        samples: m.samples as number,
      },
    },
  };
}

export class BackupError extends Error {
  constructor(
    message: string,
    readonly issues: BackupIssue[] = [],
  ) {
    super(message);
  }
}

export const tableCounts = (b: DataBackup) =>
  Object.fromEntries(BACKUP_TABLES.map((t) => [t, b.tables[t].length])) as Record<
    BackupTable,
    number
  >;

/**
 * Build a data backup from table rows. Validates the rows first (a bad backup
 * is worse than none) and enforces the 50 MiB limit. Throws BackupError.
 */
export function buildDataBackup(
  tables: Partial<Record<BackupTable, Row[]>>,
  excluded: MediaCounts,
  exportedAt = new Date(),
): {
  backup: DataBackup;
  json: string;
  bytes: number;
  counts: Record<BackupTable, number>;
  totalRows: number;
} {
  const backup: DataBackup = {
    format: DATA_BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: exportedAt.toISOString(),
    tables: Object.fromEntries(
      BACKUP_TABLES.map((t) => [t, tables[t] ?? []]),
    ) as DataBackup["tables"],
    media: { included: false, ...excluded },
  };
  const check = validateDataBackup(backup);
  if (!check.ok)
    throw new BackupError("Some saved data is malformed, so no backup was made.", check.errors);
  const json = JSON.stringify(backup);
  const bytes = utf8Length(json);
  if (bytes > DATA_BACKUP_LIMIT)
    throw new BackupError(`The backup is ${(bytes / MiB).toFixed(1)} MiB, over the 50 MiB limit.`);
  const counts = tableCounts(backup);
  return {
    backup,
    json,
    bytes,
    counts,
    totalRows: Object.values(counts).reduce((a, b) => a + b, 0),
  };
}

/** Parse and validate a data backup file (text or bytes). */
export function readDataBackup(input: string | Uint8Array): BackupRead<DataBackup> {
  const size = typeof input === "string" ? utf8Length(input) : input.length;
  if (size > DATA_BACKUP_LIMIT)
    return { ok: false, errors: [{ path: "file", message: "is over the 50 MiB limit" }] };
  try {
    return validateDataBackup(
      JSON.parse(typeof input === "string" ? input : new TextDecoder().decode(input)),
    );
  } catch {
    return { ok: false, errors: [{ path: "file", message: "is not valid JSON" }] };
  }
}

// ---------------------------------------------------------------------------
// Full backup

export interface AssetEntry {
  /** The OPFS key the file is restored to. */
  key: string;
  /** Exactly `media/<index>`. */
  path: string;
  size: number;
  mimeType: string;
  sha256: string;
}
export interface FullBackupManifest {
  format: typeof FULL_BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  /** The data backup verbatim. */
  data: DataBackup;
  assets: AssetEntry[];
}
export interface RestoredAsset extends AssetEntry {
  blob: Blob;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>),
  );
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** ZIP with manifest.json and media/<index>, STORE compression. Throws BackupError. */
export async function buildFullBackup(
  data: DataBackup,
  assets: { key: string; blob: Blob }[],
): Promise<Uint8Array> {
  if (assets.length > FULL_BACKUP_MAX_FILES)
    throw new BackupError(
      `${assets.length} media files is over the ${FULL_BACKUP_MAX_FILES} file limit.`,
    );
  const keys = new Set<string>();
  const zip = new JSZip();
  const entries: AssetEntry[] = [];
  let total = 0;
  for (const [i, a] of assets.entries()) {
    if (!a.key || keys.has(a.key))
      throw new BackupError(`Media key "${a.key}" is empty or repeated.`);
    keys.add(a.key);
    const bytes = new Uint8Array(await a.blob.arrayBuffer());
    total += bytes.length;
    if (total > FULL_BACKUP_LIMIT)
      throw new BackupError("The media is over the 250 MiB full-backup limit.");
    const path = `media/${i}`;
    zip.file(path, bytes, { createFolders: false });
    entries.push({
      key: a.key,
      path,
      size: bytes.length,
      mimeType: a.blob.type || "application/octet-stream",
      sha256: await sha256(bytes),
    });
  }
  const manifest: FullBackupManifest = {
    format: FULL_BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: data.exportedAt,
    data,
    assets: entries,
  };
  const json = JSON.stringify(manifest);
  if (utf8Length(json) > DATA_BACKUP_LIMIT)
    throw new BackupError("The manifest is over the 50 MiB limit.");
  zip.file("manifest.json", json);
  const out = await zip.generateAsync({ type: "uint8array", compression: "STORE" });
  if (out.length > FULL_BACKUP_LIMIT)
    throw new BackupError("The full backup is over the 250 MiB limit.");
  return out;
}

/** The ZIP central directory: name -> uncompressed size. Null when unreadable. */
function zipDirectory(bytes: Uint8Array): { names: string[]; sizes: Map<string, number> } | null {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--)
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) return null;
  const count = v.getUint16(eocd + 10, true);
  let at = v.getUint32(eocd + 16, true);
  const names: string[] = [];
  const sizes = new Map<string, number>();
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (at + 46 > bytes.length || v.getUint32(at, true) !== 0x02014b50) return null;
    const nameLen = v.getUint16(at + 28, true);
    const name = dec.decode(bytes.subarray(at + 46, at + 46 + nameLen));
    names.push(name);
    sizes.set(name, v.getUint32(at + 24, true));
    at += 46 + nameLen + v.getUint16(at + 30, true) + v.getUint16(at + 32, true);
  }
  return { names, sizes };
}

/**
 * Validate and unpack a full backup. The ZIP directory is checked against the
 * manifest before any media is read; a missing file, a size or hash mismatch,
 * or an unexpected file aborts the whole restore.
 */
export async function readFullBackup(
  bytes: Uint8Array,
): Promise<BackupRead<{ data: DataBackup; assets: RestoredAsset[] }>> {
  const fail = (path: string, message: string) => ({
    ok: false as const,
    errors: [{ path, message }],
  });
  if (bytes.length > FULL_BACKUP_LIMIT) return fail("file", "is over the 250 MiB limit");
  const dir = zipDirectory(bytes);
  if (!dir) return fail("file", "is not a readable ZIP");
  if (dir.names.length > FULL_BACKUP_MAX_FILES + 1)
    return fail("file", `holds more than ${FULL_BACKUP_MAX_FILES} media files`);
  if (new Set(dir.names).size !== dir.names.length) return fail("file", "lists a file twice");
  const manifestSize = dir.sizes.get("manifest.json");
  if (manifestSize === undefined) return fail("manifest.json", "is missing");
  if (manifestSize > DATA_BACKUP_LIMIT) return fail("manifest.json", "is over the 50 MiB limit");

  let zip: JSZip;
  let manifest: unknown;
  try {
    zip = await JSZip.loadAsync(bytes);
    manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
  } catch {
    return fail("manifest.json", "could not be read as JSON");
  }
  if (!isObj(manifest) || !ACCEPTED_FULL[manifest.format as string])
    return fail("manifest.format", "is not a Woodshed full backup");
  const errors: BackupIssue[] = [];
  if (!ACCEPTED_FULL[manifest.format as string].includes(manifest.version as number))
    errors.push({
      path: "manifest.version",
      message: `version ${String(manifest.version)} is not supported`,
    });
  const data = validateDataBackup(manifest.data, "manifest.data");
  if (!data.ok) errors.push(...data.errors);
  const assets = manifest.assets;
  if (!Array.isArray(assets)) errors.push({ path: "manifest.assets", message: "must be an array" });
  else {
    const keys = new Set<string>();
    assets.forEach((a, i) => {
      const p = `manifest.assets[${i}]`;
      if (!isObj(a)) return void errors.push({ path: p, message: "must be an object" });
      if (typeof a.key !== "string" || !a.key)
        errors.push({ path: `${p}.key`, message: "must be a non-empty string" });
      else if (keys.has(a.key))
        errors.push({ path: `${p}.key`, message: "duplicates an earlier key" });
      else keys.add(a.key);
      if (a.path !== `media/${i}`)
        errors.push({ path: `${p}.path`, message: `must be media/${i}` });
      if (!isCount(a.size))
        errors.push({ path: `${p}.size`, message: "must be a whole number ≥ 0" });
      if (typeof a.mimeType !== "string")
        errors.push({ path: `${p}.mimeType`, message: "must be a string" });
      if (typeof a.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(a.sha256))
        errors.push({ path: `${p}.sha256`, message: "must be a hex SHA-256" });
      const listed = dir.sizes.get(`media/${i}`);
      if (listed === undefined)
        errors.push({ path: `${p}.path`, message: `media/${i} is missing from the archive` });
      else if (listed !== a.size)
        errors.push({
          path: `${p}.size`,
          message: `says ${String(a.size)} bytes but the archive holds ${listed}`,
        });
    });
    const expected = new Set(["manifest.json", ...assets.map((_, i) => `media/${i}`)]);
    for (const name of dir.names)
      if (!expected.has(name) && !name.endsWith("/"))
        errors.push({ path: name, message: "is in the archive but not in the manifest" });
  }
  if (errors.length || !data.ok) return { ok: false, errors };

  const restored: RestoredAsset[] = [];
  for (const a of assets as AssetEntry[]) {
    const file = await zip.file(a.path)!.async("uint8array");
    if (file.length !== a.size) return fail(a.path, `is ${file.length} bytes, expected ${a.size}`);
    if ((await sha256(file)) !== a.sha256)
      return fail(a.path, "does not match its SHA-256; the file is damaged");
    restored.push({
      ...a,
      blob: new Blob([file as Uint8Array<ArrayBuffer>], { type: a.mimeType }),
    });
  }
  return {
    ok: true,
    legacy: data.legacy || manifest.format !== FULL_BACKUP_FORMAT,
    value: { data: data.value, assets: restored },
  };
}

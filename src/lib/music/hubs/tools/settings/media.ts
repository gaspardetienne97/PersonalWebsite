// Media bookkeeping for backups and reset: which OPFS files the tables point at,
// and a restore that never overwrites a file that differs from the backup.
import type { BackupTable, MediaCounts, Row } from "@repo/music-core/io/backup";

export const KITS_KEY = "music.sample-kits";

type Tables = Partial<Record<BackupTable, Row[]>>;

/** OPFS paths of the sample files the `music.sample-kits` setting lists. */
export function samplePaths(tables: Tables): string[] {
  const kits = tables.settings?.find((r) => r.id === KITS_KEY)?.value;
  if (!Array.isArray(kits)) return [];
  return kits.flatMap((k) =>
    Array.isArray(k?.samples)
      ? k.samples
          .map((s: { path?: unknown }) => s?.path)
          .filter((p: unknown) => typeof p === "string" && p)
      : [],
  );
}

/** Every OPFS key the tables reference (backing tracks, takes, kit samples). */
export function mediaKeys(tables: Tables): string[] {
  return [
    ...new Set([
      ...(tables.backingTracks ?? []).map((r) => `music-backing-${String(r.id)}`),
      ...(tables.audioTakes ?? []).map((r) => `music-take-${String(r.id)}`),
      ...samplePaths(tables),
    ]),
  ];
}

export const mediaCounts = (tables: Tables): MediaCounts => ({
  backingTracks: tables.backingTracks?.length ?? 0,
  audioTakes: tables.audioTakes?.length ?? 0,
  samples: samplePaths(tables).length,
});

export async function sha256Hex(blob: Blob): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface BinaryStore {
  get(key: string): Promise<Blob | undefined>;
  put(key: string, blob: Blob): Promise<void>;
  del(key: string): Promise<void>;
}

/**
 * Write the backup's files that are missing here. An identical existing file is
 * skipped; a differing one aborts before anything is written. If a write fails,
 * the files this call already wrote are deleted again. Returns what it wrote,
 * so a later failure (the table write) can undo it with `undoWrites`.
 */
export async function restoreAssets(
  assets: { key: string; sha256: string; blob: Blob }[],
  store: BinaryStore,
): Promise<{ written: string[]; skipped: number }> {
  const missing: typeof assets = [];
  let skipped = 0;
  for (const a of assets) {
    const have = await store.get(a.key);
    if (!have) missing.push(a);
    else if ((await sha256Hex(have)) === a.sha256) skipped++;
    else
      throw new Error(
        `"${a.key}" already exists here with different contents, so nothing was restored. Remove that recording or sample first if you want the backup's copy.`,
      );
  }
  const written: string[] = [];
  try {
    for (const a of missing) {
      await store.put(a.key, a.blob);
      written.push(a.key);
    }
  } catch (e) {
    await undoWrites(written, store);
    throw e;
  }
  return { written, skipped };
}

export async function undoWrites(keys: string[], store: BinaryStore) {
  for (const k of keys) await store.del(k).catch(() => {});
}

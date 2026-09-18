import JSZip from "jszip";
import {
  backingBinaryKey,
  takeBinaryKey,
  withMediaLibraryMutationLock,
} from "../media-library/index";
import { SAMPLE_KITS_SETTINGS_ID, sampleBinaryKey, type SampleKit } from "../sample-kit/index";
import { getBinary, putBinary, deleteBinary, type PracticeStore } from "./index";
import {
  MUSIC_DATA_BACKUP_MAX_BYTES,
  prepareMusicDataBackup,
  restoreMusicDataBackup,
  validateMusicDataBackup,
  type MusicDataBackupV1,
} from "./data-backup";

export const MUSIC_FULL_BACKUP_MAX_BYTES = 250 * 1024 * 1024;
const MAX_FILES = 10000;
const LIMIT_ERROR = "Full backups have an in-memory 250 MiB limit (50 MiB for the manifest).";

export interface MusicFullBackupAsset {
  key: string;
  path: string;
  size: number;
  mimeType: string;
  sha256: string;
}
export interface MusicFullBackupManifest {
  format: "practice-os-full-backup";
  version: 1;
  data: MusicDataBackupV1;
  assets: MusicFullBackupAsset[];
}
export interface ParsedMusicFullBackup {
  manifest: MusicFullBackupManifest;
  files: Map<string, Blob>;
}
export interface PreparedMusicFullBackup {
  manifest: MusicFullBackupManifest;
  blob: Blob;
  byteSize: number;
}
export interface MusicFullBackupOptions {
  getBinary?(key: string): Promise<Blob | undefined>;
  putBinary?(key: string, blob: Blob): Promise<void>;
  deleteBinary?(key: string): Promise<void>;
  withMutationLock?<T>(operation: () => Promise<T>): Promise<T>;
}

export async function prepareMusicFullBackup(
  store: PracticeStore,
  options: MusicFullBackupOptions = {},
): Promise<PreparedMusicFullBackup> {
  return (options.withMutationLock ?? withMediaLibraryMutationLock)(async () => {
    const { backup: data } = await prepareMusicDataBackup(store);
    const references = assetReferences(data);
    const zip = new JSZip();
    const assets: MusicFullBackupAsset[] = [];
    for (const [index, reference] of references.entries()) {
      const blob = await (options.getBinary ?? getBinary)(reference.key);
      if (!blob) throw new Error(`Referenced media file is missing: ${reference.key}.`);
      if (blob.size !== reference.size)
        throw new Error(`Media size does not match metadata: ${reference.key}.`);
      const bytes = await blob.arrayBuffer();
      const asset = { ...reference, path: `media/${index}`, sha256: await digest(bytes) };
      assets.push(asset);
      zip.file(asset.path, bytes, { createFolders: false });
    }
    const manifest = validateManifest({
      format: "practice-os-full-backup",
      version: 1,
      data,
      assets,
    });
    zip.file("manifest.json", JSON.stringify(manifest));
    // ponytail: bounded in-memory ZIP; use a streaming archive writer if collections exceed 250 MiB.
    const blob = await zip.generateAsync({
      type: "blob",
      compression: "STORE",
      mimeType: "application/zip",
    });
    if (blob.size > MUSIC_FULL_BACKUP_MAX_BYTES) throw new Error(LIMIT_ERROR);
    return { manifest, blob, byteSize: blob.size };
  });
}

export async function parseMusicFullBackup(file: Blob): Promise<ParsedMusicFullBackup> {
  if (file.size > MUSIC_FULL_BACKUP_MAX_BYTES) throw new Error(LIMIT_ERROR);
  const bytes = await file.arrayBuffer();
  const directoryPaths = validateZipDirectory(bytes);
  const zip = await JSZip.loadAsync(bytes, { createFolders: false });
  const entries = Object.values(zip.files);
  if (
    entries.length !== directoryPaths.size ||
    entries.some((entry) => !directoryPaths.has(entry.name))
  )
    throw new Error("ZIP paths changed during decoding.");
  for (const entry of entries) {
    if (entry.unsafeOriginalName !== undefined && entry.unsafeOriginalName !== entry.name)
      throw new Error("Unsafe archive path.");
    if (!archivePath(entry.name)) throw new Error("Unsupported archive path.");
  }
  const manifestEntry = zip.file("manifest.json");
  if (!manifestEntry) throw new Error("Full backup manifest is missing.");
  const budget = { remaining: MUSIC_FULL_BACKUP_MAX_BYTES };
  const manifestBlob = await extractBounded(manifestEntry, MUSIC_DATA_BACKUP_MAX_BYTES, budget);
  const manifest = validateManifest(JSON.parse(await manifestBlob.text()));
  const expectedPaths = new Set(["manifest.json", ...manifest.assets.map((asset) => asset.path)]);
  if (
    entries.length !== expectedPaths.size ||
    entries.some((entry) => entry.dir || !expectedPaths.has(entry.name))
  )
    throw new Error("Archive contains missing or extra entries.");
  const files = new Map<string, Blob>();
  for (const asset of manifest.assets) {
    const entry = zip.file(asset.path);
    if (!entry) throw new Error(`Archive media is missing: ${asset.path}.`);
    const blob = await extractBounded(entry, asset.size, budget, asset.mimeType);
    await verifyFile(asset, blob);
    files.set(asset.key, blob);
  }
  return { manifest, files };
}

export async function restoreMusicFullBackup(
  store: PracticeStore,
  parsed: ParsedMusicFullBackup,
  options: MusicFullBackupOptions = {},
): Promise<void> {
  // Capture caller-owned containers before the lock or any asynchronous file checks.
  const manifest = validateManifest(structuredClone(parsed.manifest));
  const files = new Map(parsed.files);
  if (
    files.size !== manifest.assets.length ||
    manifest.assets.some((asset) => !(files.get(asset.key) instanceof Blob))
  )
    throw new Error("Full backup files do not match its manifest.");
  const read = options.getBinary ?? getBinary;
  const put = options.putBinary ?? putBinary;
  const remove = options.deleteBinary ?? deleteBinary;
  await (options.withMutationLock ?? withMediaLibraryMutationLock)(async () => {
    const missing: MusicFullBackupAsset[] = [];
    for (const asset of manifest.assets) {
      await verifyFile(asset, files.get(asset.key)!);
      const existing = await read(asset.key);
      if (existing) {
        if (
          existing.size !== asset.size ||
          (await digest(await existing.arrayBuffer())) !== asset.sha256
        )
          throw new Error(
            `Local file has different bytes: ${asset.key}. Restore cannot overwrite it.`,
          );
      } else missing.push(asset);
    }
    const attempted: string[] = [];
    try {
      for (const asset of missing) {
        attempted.push(asset.key);
        await put(asset.key, files.get(asset.key)!);
      }
      await restoreMusicDataBackup(store, manifest.data, {
        withMutationLock: (operation) => operation(),
        getBinary: async (key) => (files.has(key) ? undefined : read(key)),
      });
    } catch (error) {
      const failures: string[] = [];
      for (const key of attempted) {
        try {
          await remove(key);
        } catch (cleanupError) {
          failures.push(`${key}: ${String(cleanupError)}`);
        }
      }
      if (failures.length)
        throw new Error(`${String(error)} Cleanup failed for ${failures.join("; ")}`, {
          cause: error,
        });
      throw error;
    }
  });
}

function assetReferences(
  data: MusicDataBackupV1,
): Array<Pick<MusicFullBackupAsset, "key" | "size" | "mimeType">> {
  const assets = [
    ...data.tables.backingTracks.map((row) => ({
      key: backingBinaryKey(row.id),
      size: row.size,
      mimeType: row.mimeType,
    })),
    ...data.tables.audioTakes.map((row) => ({
      key: takeBinaryKey(row.id),
      size: row.size,
      mimeType: row.mimeType,
    })),
  ];
  for (const asset of assets)
    if (!safeSegments(asset.key) || asset.key.includes("/"))
      throw new Error("Invalid media binary key.");
  const kits = data.tables.settings.find((row) => row.id === SAMPLE_KITS_SETTINGS_ID)?.value as
    | SampleKit[]
    | undefined;
  for (const kit of kits ?? []) {
    if (!safeSegments(kit.id) || kit.id.includes("/")) throw new Error("Invalid sample kit key.");
    for (const sample of kit.samples) {
      if (
        !safeSegments(sample.binaryKey) ||
        sample.binaryKey.split("/").length !== 3 ||
        sample.binaryKey !== sampleBinaryKey(kit.id, sample.id, sample.fileName)
      )
        throw new Error("Invalid sample binary key.");
      assets.push({ key: sample.binaryKey, size: sample.size, mimeType: sample.mimeType });
    }
  }
  if (assets.length + 1 > MAX_FILES) throw new Error("Full backups support at most 10000 files.");
  if (new Set(assets.map((asset) => asset.key)).size !== assets.length)
    throw new Error("Duplicate media binary key.");
  if (assets.some((asset) => !Number.isSafeInteger(asset.size) || asset.size < 0))
    throw new Error("Invalid media size.");
  if (assets.reduce((sum, asset) => sum + asset.size, 0) > MUSIC_FULL_BACKUP_MAX_BYTES)
    throw new Error(LIMIT_ERROR);
  return assets;
}

function validateManifest(input: unknown): MusicFullBackupManifest {
  if (!input || typeof input !== "object") throw new Error("Invalid full backup manifest.");
  const manifest = input as MusicFullBackupManifest;
  if (manifest.format !== "practice-os-full-backup" || manifest.version !== 1)
    throw new Error("Unsupported full backup format or version.");
  const data = validateMusicDataBackup(manifest.data);
  const expected = assetReferences(data);
  if (!Array.isArray(manifest.assets) || manifest.assets.length !== expected.length)
    throw new Error("Manifest asset inventory does not match metadata.");
  for (const [index, asset] of manifest.assets.entries()) {
    const reference = expected[index]!;
    if (
      !asset ||
      asset.key !== reference.key ||
      asset.path !== `media/${index}` ||
      asset.size !== reference.size ||
      asset.mimeType !== reference.mimeType ||
      typeof asset.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(asset.sha256)
    )
      throw new Error("Invalid manifest asset key, path, MIME, size or SHA-256.");
  }
  const result = {
    format: "practice-os-full-backup" as const,
    version: 1 as const,
    data,
    assets: structuredClone(manifest.assets),
  };
  const size = new TextEncoder().encode(JSON.stringify(result)).byteLength;
  if (
    size > MUSIC_DATA_BACKUP_MAX_BYTES ||
    size + expected.reduce((sum, asset) => sum + asset.size, 0) > MUSIC_FULL_BACKUP_MAX_BYTES
  )
    throw new Error(LIMIT_ERROR);
  return result;
}
function safeSegments(path: string): boolean {
  return (
    !path.includes("\\") &&
    !path.includes("\0") &&
    path.split("/").every((part) => part !== "" && part !== "." && part !== "..")
  );
}
function archivePath(path: string): boolean {
  return path === "manifest.json" || /^media\/(0|[1-9]\d*)$/.test(path);
}
async function digest(bytes: ArrayBuffer): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
async function verifyFile(asset: MusicFullBackupAsset, blob: Blob): Promise<void> {
  if (blob.size !== asset.size) throw new Error(`Archive media size mismatch: ${asset.key}.`);
  if ((await digest(await blob.arrayBuffer())) !== asset.sha256)
    throw new Error(`Archive media SHA-256 mismatch: ${asset.key}.`);
}

function extractBounded(
  entry: JSZip.JSZipObject,
  limit: number,
  budget: { remaining: number },
  mimeType = "application/json",
): Promise<Blob> {
  // JSZip 3.10 exposes this public streaming method but omits it from its bundled types.
  const stream = (
    entry as JSZip.JSZipObject & {
      internalStream(type: "uint8array"): JSZip.JSZipStreamHelper<Uint8Array<ArrayBuffer>>;
    }
  ).internalStream("uint8array");
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    let failed = false;
    stream
      .on("data", (chunk) => {
        if (failed) return;
        size += chunk.byteLength;
        budget.remaining -= chunk.byteLength;
        if (size > limit || budget.remaining < 0) {
          failed = true;
          stream.pause();
          chunks.length = 0;
          reject(new Error(LIMIT_ERROR));
        } else chunks.push(chunk);
      })
      .on("error", reject)
      .on("end", () => {
        if (!failed) resolve(new Blob(chunks, { type: mimeType }));
      })
      .resume();
  });
}

// Inspect the classic ZIP directory before JSZip normalizes paths or merges duplicate names.
function validateZipDirectory(buffer: ArrayBuffer): Set<string> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let end = bytes.length - 22;
  for (; end >= Math.max(0, bytes.length - 65557); end--) {
    if (
      view.getUint32(end, true) === 0x06054b50 &&
      end + 22 + view.getUint16(end + 20, true) === bytes.length
    )
      break;
  }
  if (end < 0 || end < bytes.length - 65557) throw new Error("Invalid ZIP directory.");
  const count = view.getUint16(end + 10, true);
  if (count > MAX_FILES) throw new Error("Full backups support at most 10000 files.");
  if (
    view.getUint16(end + 4, true) !== 0 ||
    view.getUint16(end + 6, true) !== 0 ||
    view.getUint16(end + 8, true) !== count
  )
    throw new Error("Unsupported multipart ZIP.");
  let position = view.getUint32(end + 16, true);
  const directoryEnd = position + view.getUint32(end + 12, true);
  if (directoryEnd !== end) throw new Error("Unsupported ZIP directory layout.");
  const seen = new Set<string>();
  for (let index = 0; index < count; index++) {
    if (position + 46 > end || view.getUint32(position, true) !== 0x02014b50)
      throw new Error("Invalid ZIP entry.");
    const nameLength = view.getUint16(position + 28, true);
    const next =
      position +
      46 +
      nameLength +
      view.getUint16(position + 30, true) +
      view.getUint16(position + 32, true);
    if (next > end) throw new Error("Invalid ZIP entry length.");
    const name = new TextDecoder("utf-8", { fatal: true }).decode(
      bytes.subarray(position + 46, position + 46 + nameLength),
    );
    if (!archivePath(name) || seen.has(name))
      throw new Error("Unsafe, duplicate or unsupported ZIP path.");
    seen.add(name);
    position = next;
  }
  if (position !== directoryEnd) throw new Error("Invalid ZIP entry count.");
  return seen;
}

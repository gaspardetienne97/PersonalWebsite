// Binaries in the Origin Private File System (scoring rules 14).
// Keys: music-backing-<id>, music-take-<id>, music.sample-kits/<kitId>/<sampleId>-<safeFileName>.
// ponytail: needs FileSystemFileHandle.createWritable (Chromium, Firefox); Safari
// main-thread writes would need a worker with createSyncAccessHandle.

import { m } from "@repo/i18n/messages.js";

const UNAVAILABLE = () => m.music_runtime_storage_unavailable();

async function root(): Promise<FileSystemDirectoryHandle> {
  if (typeof navigator === "undefined" || !navigator.storage?.getDirectory)
    throw new Error(UNAVAILABLE());
  try {
    return await navigator.storage.getDirectory();
  } catch (e) {
    throw new Error(`${UNAVAILABLE()}: ${(e as Error).message}`);
  }
}

const parts = (path: string) => {
  const p = path.split("/").filter(Boolean);
  if (!p.length) throw new Error(`Invalid binary path "${path}"`);
  return p;
};

/** Directory chain from the root to the file's parent. */
async function walk(dirs: string[], create: boolean) {
  const chain = [await root()];
  for (const d of dirs) chain.push(await chain.at(-1)!.getDirectoryHandle(d, { create }));
  return chain;
}

const isNotFound = (e: unknown) =>
  e instanceof DOMException && (e.name === "NotFoundError" || e.name === "TypeMismatchError");

export async function putBinary(path: string, blob: Blob): Promise<void> {
  const p = parts(path);
  const name = p.pop()!;
  const dir = (await walk(p, true)).at(-1)!;
  const file = await dir.getFileHandle(name, { create: true });
  if (!("createWritable" in file)) throw new Error(UNAVAILABLE());
  const w = await file.createWritable();
  await w.write(blob);
  await w.close();
}

export async function getBinary(path: string): Promise<Blob | undefined> {
  const p = parts(path);
  const name = p.pop()!;
  try {
    const dir = (await walk(p, false)).at(-1)!;
    return await (await dir.getFileHandle(name)).getFile();
  } catch (e) {
    if (isNotFound(e)) return undefined;
    throw e;
  }
}

/** Deletes the file, then removes each parent directory that is now empty. */
export async function deleteBinary(path: string): Promise<void> {
  const p = parts(path);
  const name = p.pop()!;
  let chain: FileSystemDirectoryHandle[];
  try {
    chain = await walk(p, false);
    await chain.at(-1)!.removeEntry(name);
  } catch (e) {
    if (isNotFound(e)) return;
    throw e;
  }
  // A non-recursive removeEntry refuses a non-empty directory: that is the stop.
  for (let i = p.length - 1; i >= 0; i--) {
    try {
      await chain[i].removeEntry(p[i]);
    } catch {
      return;
    }
  }
}

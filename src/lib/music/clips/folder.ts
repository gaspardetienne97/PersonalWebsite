// The recordings folder: WAV files at `<input-slug>/<NN>-<clip-slug>.wav`, with
// `manifest.json` (one entry per file) and `notes.json` at its root. Written
// through the File System Access API to a folder the player picks; nothing
// goes to the app's database.

export interface TakeEntry {
  /** Path from the folder root: `logitech-brio/05-guitar-g.wav`. */
  file: string;
  clip: number;
  title: string;
  inputLabel: string;
  inputSlug: string;
  sampleRate: number;
  channels: number;
  durationSec: number;
  peakDbfs: number;
  /** ISO time the take was kept. */
  recordedAt: string;
}
export interface Manifest {
  version: 1;
  updatedAt: string;
  takes: TakeEntry[];
}
export interface ClipNotes {
  micPosition: string;
  pianoModel: string;
  aerophone: string;
  /** What was played differently, by clip number ("05"). */
  clips: Record<string, string>;
}
export const emptyNotes = (): ClipNotes => ({
  micPosition: "",
  pianoModel: "",
  aerophone: "",
  clips: {},
});

/** The manifest with these takes added, each replacing an older entry for the same file. */
export function mergeManifest(
  old: Manifest | null,
  takes: TakeEntry[],
  now = new Date(),
): Manifest {
  const files = new Set(takes.map((t) => t.file));
  const kept = (old?.takes ?? []).filter((t) => !files.has(t.file));
  return {
    version: 1,
    updatedAt: now.toISOString(),
    takes: [...kept, ...takes].sort(
      (a, b) => a.clip - b.clip || a.inputSlug.localeCompare(b.inputSlug),
    ),
  };
}

type Dir = FileSystemDirectoryHandle & {
  values(): AsyncIterable<FileSystemHandle>;
  queryPermission?(o: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission?(o: { mode: "readwrite" }): Promise<PermissionState>;
};
export type FolderHandle = FileSystemDirectoryHandle;

export const canPickFolder = () => typeof window !== "undefined" && "showDirectoryPicker" in window;

/** Opens the folder picker; null when the player closes it. */
export async function pickFolder(): Promise<FolderHandle | null> {
  const pick = (window as unknown as { showDirectoryPicker(o: object): Promise<FolderHandle> })
    .showDirectoryPicker;
  try {
    return await pick.call(window, { id: "woodshed-clips", mode: "readwrite" });
  } catch (e) {
    if ((e as DOMException).name === "AbortError") return null;
    throw e;
  }
}

async function readJson<T>(dir: FolderHandle, name: string): Promise<T | null> {
  try {
    const file = await (await dir.getFileHandle(name)).getFile();
    return JSON.parse(await file.text()) as T;
  } catch {
    return null;
  }
}

async function write(dir: FolderHandle, name: string, data: BlobPart) {
  const handle = await dir.getFileHandle(name, { create: true });
  const out = await handle.createWritable();
  await out.write(data);
  await out.close();
}

export const writeJson = (dir: FolderHandle, name: string, value: unknown) =>
  write(dir, name, JSON.stringify(value, null, 2) + "\n");

export async function writeTake(dir: FolderHandle, slug: string, file: string, bytes: Uint8Array) {
  const sub = await dir.getDirectoryHandle(slug, { create: true });
  await write(sub, file, bytes as Uint8Array<ArrayBuffer>);
}

export async function readTake(dir: FolderHandle, slug: string, file: string): Promise<Blob> {
  const sub = await dir.getDirectoryHandle(slug);
  return (await sub.getFileHandle(file)).getFile();
}

export interface FolderState {
  manifest: Manifest | null;
  notes: ClipNotes | null;
  /** Clip numbers with a WAV on disk, by input folder. */
  found: Record<string, number[]>;
}

/** What the folder holds now: the files on disk decide which takes exist, the manifest describes them. */
export async function scanFolder(dir: FolderHandle): Promise<FolderState> {
  const found: Record<string, number[]> = {};
  for await (const entry of (dir as Dir).values()) {
    if (entry.kind !== "directory") continue;
    const clips: number[] = [];
    for await (const f of (entry as Dir).values()) {
      const m = f.kind === "file" ? /^(\d\d)-.+\.wav$/.exec(f.name) : null;
      if (m) clips.push(Number(m[1]));
    }
    if (clips.length) found[entry.name] = clips.sort((a, b) => a - b);
  }
  return {
    manifest: await readJson<Manifest>(dir, "manifest.json"),
    notes: await readJson<ClipNotes>(dir, "notes.json"),
    found,
  };
}

/** True when the page may write to the folder; `ask` shows the browser's prompt (from a click). */
export async function canWrite(dir: FolderHandle, ask: boolean): Promise<boolean> {
  const d = dir as Dir;
  if (!d.queryPermission) return true;
  if ((await d.queryPermission({ mode: "readwrite" })) === "granted") return true;
  return (
    ask && !!d.requestPermission && (await d.requestPermission({ mode: "readwrite" })) === "granted"
  );
}

// The chosen folder's handle is remembered in its own small IndexedDB store (a
// handle can't go in localStorage), apart from the app's database.
const DB = "woodshed-clips";
const STORE = "handles";
function store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onsuccess = () => resolve(open.result.transaction(STORE, mode).objectStore(STORE));
    open.onerror = () => reject(open.error);
  });
}
export async function rememberFolder(dir: FolderHandle | null) {
  try {
    const s = await store("readwrite");
    if (dir) s.put(dir, "folder");
    else s.delete("folder");
  } catch {
    // not remembered: the player picks the folder again
  }
}
export async function rememberedFolder(): Promise<FolderHandle | null> {
  try {
    const s = await store("readonly");
    return await new Promise((resolve) => {
      const get = s.get("folder");
      get.onsuccess = () => resolve((get.result as FolderHandle | undefined) ?? null);
      get.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/** The fallback where no folder can be picked: the file lands in Downloads. */
export function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

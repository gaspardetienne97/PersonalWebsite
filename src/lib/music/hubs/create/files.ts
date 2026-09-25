// Getting files out of the browser: a download, or a folder the user picks.
import type { KitFile } from "@repo/music-core/io/mpc-kit";

export function download(
  data: Blob | Uint8Array | string,
  name: string,
  type = "application/octet-stream",
) {
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

type DirPicker = (opts?: { mode?: "readwrite"; id?: string }) => Promise<FileSystemDirectoryHandle>;
export const canPickFolder = () =>
  typeof window !== "undefined" && window.isSecureContext && "showDirectoryPicker" in window;

/** Write kit files (paths like `Kit/Samples/036-kick.wav`) into a folder the user picks. */
export async function writeToFolder(files: KitFile[]): Promise<string> {
  const root = await (window as unknown as { showDirectoryPicker: DirPicker }).showDirectoryPicker({
    mode: "readwrite",
    id: "woodshed-mpc",
  });
  for (const f of files) {
    const parts = f.path.split("/");
    const name = parts.pop()!;
    let dir = root;
    for (const p of parts) dir = await dir.getDirectoryHandle(p, { create: true });
    const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
    await w.write(typeof f.data === "string" ? f.data : (f.data as Uint8Array<ArrayBuffer>));
    await w.close();
  }
  return root.name;
}

/**
 * Browser export adapters for MPC kits: write the generated file list to a
 * user-selected directory (File System Access API) or build a ZIP (JSZip). The
 * low-level writer propagates permission/write errors; the UI layer converts
 * cancellation into a friendly result.
 */

import JSZip from "jszip";

import type { MpcKitExport } from "./mpc-export";

export interface DirectoryExportResult {
  kind: "directory";
  folderName: string;
}

export interface ZipExportResult {
  kind: "zip";
  fileName: string;
  blob: Blob;
}

export function canExportToDirectory(
  scope: (Window & typeof globalThis) | undefined = typeof window === "undefined"
    ? undefined
    : window,
): boolean {
  if (!scope) return false;
  const picker = (scope as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  return scope.isSecureContext === true && typeof picker === "function";
}

export async function writeMpcKitToDirectory(
  exportKit: MpcKitExport,
  root: FileSystemDirectoryHandle,
): Promise<DirectoryExportResult> {
  const kitDirectory = await root.getDirectoryHandle(exportKit.folderName, { create: true });

  for (const file of exportKit.files) {
    const parts = file.relativePath.split("/").filter(Boolean);
    const fileName = parts.pop()!;
    let directory = kitDirectory;
    for (const part of parts) {
      directory = await directory.getDirectoryHandle(part, { create: true });
    }
    const handle = await directory.getFileHandle(fileName, { create: true });
    const writable = await handle.createWritable();
    try {
      await writable.write(file.content);
    } finally {
      await writable.close();
    }
  }

  return { kind: "directory", folderName: exportKit.folderName };
}

export async function buildMpcKitZip(exportKit: MpcKitExport): Promise<ZipExportResult> {
  const zip = new JSZip();
  const folder = zip.folder(exportKit.folderName);
  if (!folder) throw new Error("The MPC export could not be packaged.");
  for (const file of exportKit.files) {
    folder.file(file.relativePath, file.content);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  return { kind: "zip", fileName: `${exportKit.folderName}-mpc.zip`, blob };
}

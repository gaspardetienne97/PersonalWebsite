import JSZip from "jszip";
import { describe, expect, test } from "vitest";

import { buildMpcKitZip, canExportToDirectory, writeMpcKitToDirectory } from "./browser-export";
import type { MpcKitExport } from "./mpc-export";

function exportFixture(): MpcKitExport {
  return {
    folderName: "My-Kit",
    programFileName: "My-Kit.xpm",
    files: [
      {
        relativePath: "My-Kit.xpm",
        content: new Blob(["<MPCVObject></MPCVObject>"], { type: "application/xml" }),
      },
      { relativePath: "Samples/036-Kick.wav", content: new Blob(["kick"], { type: "audio/wav" }) },
    ],
  };
}

function fakeDirectory() {
  const files = new Map<string, string>();
  function makeDir(prefix: string): FileSystemDirectoryHandle {
    return {
      kind: "directory",
      getDirectoryHandle: async (name: string) => makeDir(`${prefix}${name}/`),
      getFileHandle: async (name: string) => ({
        kind: "file",
        createWritable: async () => {
          let buffer = "";
          return {
            write: async (data: Blob | string) => {
              buffer += typeof data === "string" ? data : await data.text();
            },
            close: async () => {
              files.set(`${prefix}${name}`, buffer);
            },
          };
        },
      }),
    } as unknown as FileSystemDirectoryHandle;
  }
  return { handle: makeDir(""), text: (path: string) => files.get(path) };
}

describe("browser-export", () => {
  test("writes the program and Samples directory to the selected root", async () => {
    const root = fakeDirectory();
    const result = await writeMpcKitToDirectory(exportFixture(), root.handle);
    expect(result).toEqual({ kind: "directory", folderName: "My-Kit" });
    expect(root.text("My-Kit/My-Kit.xpm")).toContain("<MPCVObject>");
    expect(root.text("My-Kit/Samples/036-Kick.wav")).toBe("kick");
  });

  test("creates a ZIP with the identical folder structure", async () => {
    const result = await buildMpcKitZip(exportFixture());
    expect(result.fileName).toBe("My-Kit-mpc.zip");
    const archive = await JSZip.loadAsync(await result.blob.arrayBuffer());
    expect(Object.keys(archive.files).sort()).toEqual([
      "My-Kit/",
      "My-Kit/My-Kit.xpm",
      "My-Kit/Samples/",
      "My-Kit/Samples/036-Kick.wav",
    ]);
  });

  test("reports directory capability only in a secure context with the picker", () => {
    expect(
      canExportToDirectory({
        isSecureContext: true,
        showDirectoryPicker: () => undefined,
      } as unknown as Window & typeof globalThis),
    ).toBe(true);
    expect(
      canExportToDirectory({
        isSecureContext: false,
        showDirectoryPicker: () => undefined,
      } as unknown as Window & typeof globalThis),
    ).toBe(false);
    expect(
      canExportToDirectory({ isSecureContext: true } as unknown as Window & typeof globalThis),
    ).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { mediaCounts, mediaKeys, restoreAssets, sha256Hex, type BinaryStore } from "./media";

const tables = {
  backingTracks: [{ id: "b1", name: "x", createdAt: 1 }],
  audioTakes: [{ id: "t1", createdAt: 1 }],
  settings: [
    {
      id: "music.sample-kits",
      value: [
        {
          id: "k",
          samples: [{ id: "s", fileName: "kick.wav", path: "music.sample-kits/k/s-kick.wav" }],
        },
      ],
    },
  ],
};

function memStore(init: Record<string, Blob> = {}, failOn?: string) {
  const files = new Map(Object.entries(init));
  const store: BinaryStore = {
    get: async (k) => files.get(k),
    put: async (k, b) => {
      if (k === failOn) throw new Error("disk full");
      files.set(k, b);
    },
    del: async (k) => void files.delete(k),
  };
  return { files, store };
}

const asset = async (key: string, bytes: number[]) => {
  const blob = new Blob([new Uint8Array(bytes)]);
  return { key, blob, sha256: await sha256Hex(blob) };
};

describe("media", () => {
  it("lists every referenced file and counts them", () => {
    expect(mediaKeys(tables)).toEqual([
      "music-backing-b1",
      "music-take-t1",
      "music.sample-kits/k/s-kick.wav",
    ]);
    expect(mediaCounts(tables)).toEqual({ backingTracks: 1, audioTakes: 1, samples: 1 });
  });

  it("writes missing files and skips identical ones", async () => {
    const same = await asset("a", [1, 2]);
    const { files, store } = memStore({ a: new Blob([new Uint8Array([1, 2])]) });
    const r = await restoreAssets([same, await asset("b", [3])], store);
    expect(r).toEqual({ written: ["b"], skipped: 1 });
    expect(files.has("b")).toBe(true);
  });

  it("never overwrites a differing file and writes nothing", async () => {
    const { files, store } = memStore({ a: new Blob([new Uint8Array([9])]) });
    await expect(
      restoreAssets([await asset("b", [3]), await asset("a", [1])], store),
    ).rejects.toThrow(/different contents/);
    expect(files.has("b")).toBe(false);
    expect(new Uint8Array(await files.get("a")!.arrayBuffer())).toEqual(new Uint8Array([9]));
  });

  it("removes its own new files when a write fails", async () => {
    const { files, store } = memStore({}, "c");
    await expect(
      restoreAssets([await asset("b", [3]), await asset("c", [4])], store),
    ).rejects.toThrow("disk full");
    expect(files.size).toBe(0);
  });
});

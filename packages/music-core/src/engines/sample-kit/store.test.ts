import { describe, expect, test } from "vitest";

import type { SettingsRecord } from "@repo/music-core/engines/store";

import { SAMPLE_KITS_SETTINGS_ID } from "./index";
import { SampleKitStore, type SampleBinaryStore } from "./store";

function fakeRepository(seed?: SettingsRecord) {
  const map = new Map<string, SettingsRecord>();
  if (seed) map.set(seed.id, seed);
  return {
    map,
    get: async (id: string) => map.get(id),
    put: async (record: SettingsRecord) => {
      map.set(record.id, structuredClone(record));
    },
  };
}

function fakeBinaries(options: { failPutAt?: number; failDelete?: string } = {}) {
  const store = new Map<string, Blob>();
  let puts = 0;
  const adapter: SampleBinaryStore & { keys: () => string[]; store: Map<string, Blob> } = {
    store,
    keys: () => [...store.keys()],
    put: async (key: string, blob: Blob) => {
      puts += 1;
      if (options.failPutAt && puts === options.failPutAt) throw new Error("write failed");
      store.set(key, blob);
    },
    get: async (key: string) => store.get(key),
    delete: async (key: string) => {
      if (options.failDelete && key === options.failDelete) throw new Error("delete failed");
      store.delete(key);
    },
  };
  return adapter;
}

function audioFile(name: string, content = "audio"): File {
  return new File([content], name, { type: "audio/wav" });
}

let idCounter = 0;
function makeStore(
  overrides: {
    binaries?: ReturnType<typeof fakeBinaries>;
    repository?: ReturnType<typeof fakeRepository>;
  } = {},
) {
  idCounter = 0;
  const repository = overrides.repository ?? fakeRepository();
  const binaries = overrides.binaries ?? fakeBinaries();
  const store = new SampleKitStore({
    repository,
    binaries,
    createId: () => `id-${(idCounter += 1)}`,
    now: () => 1000,
  });
  return { store, repository, binaries };
}

describe("SampleKitStore", () => {
  test("creates, renames, and loads kits", async () => {
    const { store } = makeStore();
    const kit = await store.create("House");
    expect(kit).toMatchObject({ name: "House", samples: [], assignments: [] });
    const renamed = await store.rename(kit.id, "Techno");
    expect(renamed.name).toBe("Techno");
    expect((await store.load()).map((k) => k.name)).toEqual(["Techno"]);
  });

  test("rejects empty kit names and unknown kit/sample ids", async () => {
    const { store } = makeStore();
    await expect(store.create("  ")).rejects.toThrow();
    const kit = await store.create("House");
    await expect(store.rename(kit.id, "")).rejects.toThrow();
    await expect(store.rename("ghost", "x")).rejects.toThrow("Sample kit not found: ghost.");
    await expect(store.assign("ghost", "s", 36)).rejects.toThrow("Sample kit not found: ghost.");
    await expect(store.deleteSample(kit.id, "ghost")).rejects.toThrow("Sample not found: ghost.");
  });

  test("rejects empty imports", async () => {
    const { store } = makeStore();
    const kit = await store.create("House");
    await expect(store.importFiles(kit.id, [])).rejects.toThrow(
      "Choose at least one audio sample.",
    );
  });

  test("rolls back every blob when an import write fails", async () => {
    const binaries = fakeBinaries({ failPutAt: 2 });
    const { store } = makeStore({ binaries });
    const kit = await store.create("Rollback");
    await expect(
      store.importFiles(kit.id, [audioFile("kick.wav"), audioFile("snare.wav")]),
    ).rejects.toThrow("write failed");
    expect(await store.load()).toEqual([kit]);
    expect(binaries.keys()).toEqual([]);
  });

  test("rolls back blobs when metadata persistence fails after writes", async () => {
    const binaries = fakeBinaries();
    const repository = fakeRepository();
    const { store } = makeStore({ binaries, repository });
    const kit = await store.create("Persist");
    repository.put = async () => {
      throw new Error("metadata failed");
    };
    await expect(store.importFiles(kit.id, [audioFile("kick.wav")])).rejects.toThrow(
      "metadata failed",
    );
    expect(binaries.keys()).toEqual([]);
  });

  test("translates unavailable storage to a feature message", async () => {
    const binaries = fakeBinaries();
    binaries.put = async () => {
      throw new Error("Local binary storage is unavailable.");
    };
    const { store } = makeStore({ binaries });
    const kit = await store.create("Unavailable");
    await expect(store.importFiles(kit.id, [audioFile("kick.wav")])).rejects.toThrow(
      "Sample storage is unavailable in this browser.",
    );
  });

  test("auto-maps imports and replaces pad assignments and deleted blobs", async () => {
    const { store, binaries } = makeStore();
    const kit = await store.create("House");
    const imported = await store.importFiles(kit.id, [
      audioFile("kick.wav"),
      audioFile("snare.wav"),
    ]);
    expect(imported.assignments.map((a) => a.midiNote)).toEqual([36, 38]);

    const moved = await store.assign(imported.id, imported.samples[1]!.id, 36);
    expect(moved.assignments).toEqual([
      expect.objectContaining({ midiNote: 36, sampleId: imported.samples[1]!.id }),
    ]);

    const removedKey = imported.samples[0]!.binaryKey;
    const next = await store.deleteSample(moved.id, imported.samples[0]!.id);
    expect(next.samples).toHaveLength(1);
    expect(binaries.keys()).not.toContain(removedKey);
  });

  test("returns clones and marks missing playback blobs", async () => {
    const binaries = fakeBinaries();
    const { store } = makeStore({ binaries });
    const kit = await store.create("Missing");
    const imported = await store.importFiles(kit.id, [audioFile("kick.wav")]);
    await binaries.delete(imported.samples[0]!.binaryKey);

    const resolved = await store.resolvePlayback(imported.id);
    expect(resolved.samples[0]?.status).toBe("missing");
    resolved.kit.name = "mutated";
    await expect(store.load()).resolves.toEqual([expect.objectContaining({ name: "Missing" })]);
  });

  test("deletes a kit and tolerates already-missing blobs", async () => {
    const { store, binaries } = makeStore();
    const kit = await store.create("Doomed");
    const imported = await store.importFiles(kit.id, [audioFile("kick.wav")]);
    await binaries.delete(imported.samples[0]!.binaryKey);
    await expect(store.deleteKit(imported.id)).resolves.toBeUndefined();
    expect(await store.load()).toEqual([]);
  });

  test("keeps metadata deleted even when blob cleanup fails", async () => {
    const seed = makeStore();
    const kit = await seed.store.create("Partial");
    const imported = await seed.store.importFiles(kit.id, [audioFile("kick.wav")]);

    // a delete-failing binary adapter over the same persisted metadata
    const binaries = fakeBinaries({ failDelete: imported.samples[0]!.binaryKey });
    const store = new SampleKitStore({
      repository: seed.repository,
      binaries,
      createId: () => "x",
      now: () => 1,
    });
    await expect(store.deleteSample(imported.id, imported.samples[0]!.id)).rejects.toThrow();
    // the metadata change persisted despite the cleanup failure
    expect((await store.load())[0]!.samples).toHaveLength(0);
  });

  test("dedupes duplicate kit ids and binary keys on load", async () => {
    const dupeSample = {
      id: "s1",
      fileName: "kick.wav",
      displayName: "kick",
      mimeType: "audio/wav",
      size: 1,
      binaryKey: "music.sample-kits/k1/s1-kick.wav",
    };
    const repository = fakeRepository({
      id: SAMPLE_KITS_SETTINGS_ID,
      value: [
        {
          id: "k1",
          name: "First",
          createdAt: 1,
          updatedAt: 1,
          samples: [dupeSample, { ...dupeSample }],
          assignments: [],
        },
        { id: "k1", name: "Duplicate", createdAt: 2, updatedAt: 2, samples: [], assignments: [] },
      ],
    });
    const { store } = makeStore({ repository });
    const kits = await store.load();
    expect(kits).toHaveLength(1);
    expect(kits[0]!.name).toBe("First");
    expect(kits[0]!.samples).toHaveLength(1);
  });
});

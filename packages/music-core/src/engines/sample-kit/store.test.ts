import { describe, expect, test } from "vitest";

import type { SettingsRecord } from "@repo/music-core/engines/store";

import { withMediaLibraryMutationLock } from "../media-library/index";

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

  test("persists velocity layers on a pad", async () => {
    const { store } = makeStore();
    const kit = await store.create("Layered");
    const imported = await store.importFiles(kit.id, [
      audioFile("kick-soft.wav"),
      audioFile("kick-hard.wav"),
    ]);

    const layered = await store.setVelocityLayers(imported.id, 36, [
      { sampleId: imported.samples[0]!.id, minVelocity: 0, maxVelocity: 0.49 },
      { sampleId: imported.samples[1]!.id, minVelocity: 0.5, maxVelocity: 1 },
    ]);

    expect(layered.assignments[0]?.velocityLayers).toEqual([
      expect.objectContaining({ sampleId: imported.samples[0]!.id, minVelocity: 0 }),
      expect.objectContaining({ sampleId: imported.samples[1]!.id, maxVelocity: 1 }),
    ]);
    await expect(store.load()).resolves.toEqual([
      expect.objectContaining({
        assignments: [
          expect.objectContaining({
            midiNote: 36,
            velocityLayers: [
              expect.objectContaining({ sampleId: imported.samples[0]!.id }),
              expect.objectContaining({ sampleId: imported.samples[1]!.id }),
            ],
          }),
        ],
      }),
    ]);
  });

  test("renames sample display names and keeps pad labels in sync", async () => {
    const { store } = makeStore();
    const kit = await store.create("Editable");
    const imported = await store.importFiles(kit.id, [audioFile("kick.wav")]);

    const renamed = await store.renameSample(imported.id, imported.samples[0]!.id, "Sub Kick");

    expect(renamed.samples[0]?.displayName).toBe("Sub Kick");
    expect(renamed.assignments[0]).toMatchObject({ label: "Sub Kick" });
    await expect(store.load()).resolves.toEqual([
      expect.objectContaining({
        samples: [expect.objectContaining({ displayName: "Sub Kick" })],
        assignments: [expect.objectContaining({ label: "Sub Kick" })],
      }),
    ]);
  });

  test("deleting a velocity-layer sample collapses the pad to remaining layers", async () => {
    const { store } = makeStore();
    const kit = await store.create("Editable Layers");
    const imported = await store.importFiles(kit.id, [
      audioFile("kick-soft.wav"),
      audioFile("kick-hard.wav"),
    ]);
    const layered = await store.setVelocityLayers(imported.id, 36, [
      { sampleId: imported.samples[0]!.id, minVelocity: 0, maxVelocity: 0.49 },
      { sampleId: imported.samples[1]!.id, minVelocity: 0.5, maxVelocity: 1 },
    ]);

    const edited = await store.deleteSample(layered.id, imported.samples[1]!.id);

    expect(edited.assignments).toEqual([
      expect.objectContaining({
        midiNote: 36,
        sampleId: imported.samples[0]!.id,
      }),
    ]);
    expect(edited.assignments[0]?.velocityLayers).toBeUndefined();
  });

  test("persists choke groups on pads", async () => {
    const { store } = makeStore();
    const kit = await store.create("Choked");
    const imported = await store.importFiles(kit.id, [
      audioFile("closed-hat.wav"),
      audioFile("open-hat.wav"),
    ]);

    await store.setChokeGroup(imported.id, 42, 1);
    const grouped = await store.setChokeGroup(imported.id, 46, 1);

    expect(grouped.assignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ midiNote: 42, chokeGroup: 1 }),
        expect.objectContaining({ midiNote: 46, chokeGroup: 1 }),
      ]),
    );
    await expect(store.load()).resolves.toEqual([
      expect.objectContaining({
        assignments: expect.arrayContaining([
          expect.objectContaining({ midiNote: 42, chokeGroup: 1 }),
          expect.objectContaining({ midiNote: 46, chokeGroup: 1 }),
        ]),
      }),
    ]);
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

test("sample mutations wait for the shared media lock", async () => {
  const { store, repository, binaries } = makeStore();
  const kit = await store.create("Original");
  let release!: () => void;
  let entered!: () => void;
  const enteredPromise = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const held = withMediaLibraryMutationLock(async () => {
    entered();
    await new Promise<void>((resolve) => {
      release = resolve;
    });
  });
  await enteredPromise;
  const rename = store.rename(kit.id, "Renamed");
  const importing = store.importFiles(kit.id, [audioFile("kick.wav")]);
  await new Promise((resolve) => setTimeout(resolve, 10));
  const before = structuredClone(repository.map.get(SAMPLE_KITS_SETTINGS_ID));
  const written = binaries.keys();
  release();
  await Promise.all([held, rename, importing]);
  expect(((before?.value ?? []) as { name: string }[])[0]?.name).toBe("Original");
  expect(written).toEqual([]);
  expect((await store.load())[0]).toMatchObject({
    name: "Renamed",
    samples: [expect.objectContaining({ fileName: "kick.wav" })],
  });
});

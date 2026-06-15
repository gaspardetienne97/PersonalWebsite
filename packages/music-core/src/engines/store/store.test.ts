import { afterEach, describe, expect, test, vi } from "vitest";

import { initialMastery, unixMs, type PracticeSession } from "@repo/music-core/domain";

import {
  PracticeDatabase,
  PracticeStore,
  deleteBinary,
  getBinary,
  list,
  putBinary,
  storageEstimate,
  type AudioTakeRow,
  type ImportedBackingTrackRow,
} from "./index";

const databases: PracticeDatabase[] = [];
const unavailableMessage = "Local binary storage is unavailable.";

afterEach(async () => {
  await Promise.all(databases.map((database) => database.delete()));
  databases.length = 0;
});

function createStore(): PracticeStore {
  const database = new PracticeDatabase(`practice-store-${crypto.randomUUID()}`);
  databases.push(database);
  return new PracticeStore(database);
}

async function withStorage<T>(
  storage: StorageManager | undefined,
  run: () => Promise<T>,
): Promise<T> {
  const descriptor = Object.getOwnPropertyDescriptor(navigator, "storage");
  Object.defineProperty(navigator, "storage", {
    configurable: true,
    value: storage,
  });
  try {
    return await run();
  } finally {
    if (descriptor) {
      Object.defineProperty(navigator, "storage", descriptor);
    } else {
      Reflect.deleteProperty(navigator, "storage");
    }
  }
}

describe("music-core/store", () => {
  test("round-trips sessions and skill mastery through Dexie repositories", async () => {
    const store = createStore();
    const session: PracticeSession = {
      id: "session-1",
      startTime: unixMs(Date.UTC(2026, 0, 2)),
      endTime: unixMs(Date.UTC(2026, 0, 2, 0, 5)),
      source: "daily-routine",
      instrument: "piano",
      runs: [],
      scoringEvents: [],
      xpEarned: 25,
      tags: ["morning"],
    };
    const mastery = {
      ...initialMastery("pitch.interval.m6"),
      mastery: 0.42,
      confidence: 0.25,
      observations: 3,
    };

    await store.sessions.put(session);
    await store.skillMastery.put(mastery);

    await expect(store.sessions.get(session.id)).resolves.toEqual(session);
    await expect(store.skillMastery.get(mastery.skillId)).resolves.toEqual(mastery);
  });

  test("round-trips imported backing track metadata", async () => {
    const store = createStore();
    const backingTrack: ImportedBackingTrackRow = {
      id: "backing-track-1",
      name: "Autumn Changes.wav",
      mimeType: "audio/wav",
      size: 1_024,
      durationMs: 45_000,
      createdAt: unixMs(Date.UTC(2026, 5, 15)),
    };

    await store.backingTracks.put(backingTrack);

    await expect(store.backingTracks.get(backingTrack.id)).resolves.toEqual(backingTrack);
    await expect(store.backingTracks.all()).resolves.toEqual([backingTrack]);
  });

  test("round-trips audio take metadata", async () => {
    const store = createStore();
    const audioTake: AudioTakeRow = {
      id: "audio-take-1",
      name: "Take 1.webm",
      mimeType: "audio/webm",
      size: 2_048,
      durationMs: 32_000,
      createdAt: unixMs(Date.UTC(2026, 5, 15, 0, 1)),
      instrument: "guitar",
      backingTrackId: "backing-track-1",
      backingKind: "generated",
      backingOffsetMs: 250,
      generatedBacking: {
        progressionId: "ii-v-i",
        bpm: 120,
        loop: true,
      },
    };

    await store.audioTakes.put(audioTake);

    await expect(store.audioTakes.get(audioTake.id)).resolves.toEqual(audioTake);
    await expect(store.audioTakes.all()).resolves.toEqual([audioTake]);
  });

  test("uses the exact media metadata indexes", async () => {
    const store = createStore();
    await store.database.open();

    try {
      expect(store.database.backingTracks.schema.indexes.map((index) => index.name)).toEqual([
        "name",
        "createdAt",
      ]);
      expect(store.database.audioTakes.schema.indexes.map((index) => index.name)).toEqual([
        "createdAt",
        "instrument",
        "backingTrackId",
      ]);
    } finally {
      store.database.close();
    }
  });

  test("stores and lists OPFS binaries when the browser supports OPFS", async () => {
    if (!("storage" in navigator) || !navigator.storage.getDirectory) return;

    const key = `store-test-${crypto.randomUUID()}.txt`;
    try {
      await putBinary(key, new Blob(["hello"], { type: "text/plain" }));

      await expect(getBinary(key).then((blob) => blob?.text())).resolves.toBe("hello");
      await expect(list("store-test-")).resolves.toContain(key);
    } finally {
      await deleteBinary(key);
    }

    await expect(getBinary(key)).resolves.toBeUndefined();
    await expect(list("store-test-")).resolves.not.toContain(key);
  });

  test("rejects binary writes and deletes when OPFS is unavailable", async () => {
    await withStorage(undefined, async () => {
      await expect(putBinary("unavailable", new Blob())).rejects.toThrow(unavailableMessage);
      await expect(deleteBinary("unavailable")).rejects.toThrow(unavailableMessage);
      await expect(getBinary("unavailable")).resolves.toBeUndefined();
      await expect(list("unavailable")).resolves.toEqual([]);
      await expect(storageEstimate()).resolves.toEqual({});
    });
  });

  test("treats an inaccessible OPFS root as unavailable", async () => {
    const storage = {
      getDirectory: vi.fn().mockRejectedValue(new DOMException("Denied", "SecurityError")),
    } as unknown as StorageManager;

    await withStorage(storage, async () => {
      await expect(putBinary("inaccessible", new Blob())).rejects.toThrow(unavailableMessage);
      await expect(deleteBinary("inaccessible")).rejects.toThrow(unavailableMessage);
      await expect(getBinary("inaccessible")).resolves.toBeUndefined();
      await expect(list("inaccessible")).resolves.toEqual([]);
    });
  });

  test("returns the browser storage estimate", async () => {
    const estimate = { quota: 8_192, usage: 1_024 };
    const estimateMock = vi.fn().mockResolvedValue(estimate);

    await withStorage({ estimate: estimateMock } as unknown as StorageManager, async () => {
      await expect(storageEstimate()).resolves.toEqual(estimate);
      expect(estimateMock).toHaveBeenCalledOnce();
    });
  });

  test("returns an empty estimate when the browser resolves a nullish result", async () => {
    const estimateMock = vi.fn().mockResolvedValue(undefined);

    await withStorage({ estimate: estimateMock } as unknown as StorageManager, async () => {
      await expect(storageEstimate()).resolves.toEqual({});
      expect(estimateMock).toHaveBeenCalledOnce();
    });
  });

  test("deleteBinary ignores only missing OPFS entries", async () => {
    const removeEntry = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("Missing", "NotFoundError"))
      .mockRejectedValueOnce(new DOMException("Denied", "SecurityError"));
    const storage = {
      getDirectory: vi.fn().mockResolvedValue({ removeEntry }),
    } as unknown as StorageManager;

    await withStorage(storage, async () => {
      await expect(deleteBinary("missing")).resolves.toBeUndefined();
      await expect(deleteBinary("denied")).rejects.toMatchObject({ name: "SecurityError" });
    });
  });
});

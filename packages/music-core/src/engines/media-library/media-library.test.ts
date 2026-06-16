import { describe, expect, test } from "vitest";

import { unixMs } from "@repo/music-core/domain";
import type {
  AudioTakeRow,
  ImportedBackingTrackRow,
  PracticeStore,
} from "@repo/music-core/engines/store";

import {
  DEFAULT_MEDIA_LIMITS,
  MediaLibrary,
  createMediaLibrary,
  downloadName,
  extensionForMimeType,
  type MediaLibraryOptions,
} from "./index";

class MemoryRepository<T extends { id: string }> {
  readonly rows = new Map<string, T>();
  failNextPutAfterWrite = false;
  failNextDeleteAfterDelete = false;

  constructor(
    initial: T[] = [],
    private readonly event?: (operation: string) => void,
  ) {
    initial.forEach((row) => this.rows.set(row.id, structuredClone(row)));
  }

  async put(row: T): Promise<void> {
    this.event?.("metadata:put");
    this.rows.set(row.id, structuredClone(row));
    if (this.failNextPutAfterWrite) {
      this.failNextPutAfterWrite = false;
      throw new Error("metadata put failed");
    }
  }

  async get(id: string): Promise<T | undefined> {
    const row = this.rows.get(id);
    return row === undefined ? undefined : structuredClone(row);
  }

  async all(): Promise<T[]> {
    return [...this.rows.values()].map((row) => structuredClone(row));
  }

  async delete(id: string): Promise<void> {
    this.event?.("metadata:delete");
    this.rows.delete(id);
    if (this.failNextDeleteAfterDelete) {
      this.failNextDeleteAfterDelete = false;
      throw new Error("metadata delete failed");
    }
  }
}

function backing(overrides: Partial<ImportedBackingTrackRow> = {}): ImportedBackingTrackRow {
  return {
    id: "backing-1",
    name: "Practice Track.wav",
    mimeType: "audio/wav",
    size: 5,
    durationMs: 60_000,
    createdAt: unixMs(Date.UTC(2026, 5, 15)),
    ...overrides,
  };
}

function take(overrides: Partial<AudioTakeRow> = {}): AudioTakeRow {
  return {
    id: "take-1",
    name: "Take 1.webm",
    mimeType: "audio/webm",
    size: 4,
    durationMs: 30_000,
    createdAt: unixMs(Date.UTC(2026, 5, 15, 0, 1)),
    instrument: "piano",
    backingOffsetMs: 0,
    ...overrides,
  };
}

function makeBlob(size: number, type: string): Blob {
  return new Blob(["x".repeat(size)], { type });
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function createHarness(
  overrides: Partial<MediaLibraryOptions> = {},
  estimate: StorageEstimate = {},
) {
  const events: string[] = [];
  const backingRepository = new MemoryRepository<ImportedBackingTrackRow>([], (event) =>
    events.push(`backing:${event}`),
  );
  const takeRepository = new MemoryRepository<AudioTakeRow>([], (event) =>
    events.push(`take:${event}`),
  );
  const binaries = new Map<string, Blob>();
  let nextBinaryPutPause:
    | {
        started: ReturnType<typeof deferred>;
        release: ReturnType<typeof deferred>;
      }
    | undefined;
  let failNextBinaryPutAfterWrite = false;
  let failNextBinaryRead = false;
  let failNextBinaryDelete = false;
  const library = new MediaLibrary({
    backingRepository,
    takeRepository,
    putBinary: async (key, blob) => {
      events.push(`binary:put:${key}`);
      binaries.set(key, blob);
      const pause = nextBinaryPutPause;
      nextBinaryPutPause = undefined;
      if (pause) {
        pause.started.resolve();
        await pause.release.promise;
      }
      if (failNextBinaryPutAfterWrite) {
        failNextBinaryPutAfterWrite = false;
        throw new Error("binary put failed");
      }
    },
    getBinary: async (key) => {
      if (failNextBinaryRead) {
        failNextBinaryRead = false;
        throw new Error("binary read failed");
      }
      return binaries.get(key);
    },
    listBinary: async (prefix = "") =>
      [...binaries.keys()].filter((key) => key.startsWith(prefix)).sort(),
    deleteBinary: async (key) => {
      events.push(`binary:delete:${key}`);
      if (failNextBinaryDelete) {
        failNextBinaryDelete = false;
        throw new Error("binary delete failed");
      }
      binaries.delete(key);
    },
    storageEstimate: async () => estimate,
    ...overrides,
  });

  return {
    library,
    backingRepository,
    takeRepository,
    binaries,
    events,
    pauseNextBinaryPutAfterWrite() {
      const pause = { started: deferred(), release: deferred() };
      nextBinaryPutPause = pause;
      return {
        started: pause.started.promise,
        release: pause.release.resolve,
      };
    },
    failNextBinaryPutAfterWrite() {
      failNextBinaryPutAfterWrite = true;
    },
    failNextBinaryRead() {
      failNextBinaryRead = true;
    },
    failNextBinaryDelete() {
      failNextBinaryDelete = true;
    },
  };
}

function createSharedLock(): NonNullable<MediaLibraryOptions["withMutationLock"]> {
  let queue: Promise<void> = Promise.resolve();
  return (operation) => {
    const result = queue.then(operation, operation);
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}

function createSharedHarness(
  overrides: Partial<MediaLibraryOptions> = {},
  estimate: StorageEstimate = {},
) {
  const events: string[] = [];
  const backingRepository = new MemoryRepository<ImportedBackingTrackRow>([], (event) =>
    events.push(`backing:${event}`),
  );
  const takeRepository = new MemoryRepository<AudioTakeRow>([], (event) =>
    events.push(`take:${event}`),
  );
  const binaries = new Map<string, Blob>();
  const withMutationLock = createSharedLock();
  const baseOptions = {
    backingRepository,
    takeRepository,
    putBinary: async (key: string, blob: Blob) => {
      events.push(`binary:put:${key}`);
      binaries.set(key, blob);
    },
    getBinary: async (key: string) => binaries.get(key),
    listBinary: async (prefix = "") =>
      [...binaries.keys()].filter((key) => key.startsWith(prefix)).sort(),
    deleteBinary: async (key: string) => {
      events.push(`binary:delete:${key}`);
      binaries.delete(key);
    },
    storageEstimate: async () => estimate,
    withMutationLock,
    ...overrides,
  } satisfies MediaLibraryOptions;

  return {
    first: new MediaLibrary(baseOptions),
    second: new MediaLibrary(baseOptions),
    backingRepository,
    takeRepository,
    binaries,
    events,
  };
}

describe("music-core/media-library", () => {
  test("exports the default media limits", () => {
    expect(DEFAULT_MEDIA_LIMITS).toEqual({
      maxTakeDurationMs: 3_600_000,
      maxImportedTrackBytes: 250 * 1024 * 1024,
      maxApplicationBytes: 1024 * 1024 * 1024,
      quotaFraction: 0.8,
    });
  });

  test("rejects invalid media limits at construction", () => {
    const invalidLimits: Array<Partial<MediaLibraryOptions["limits"]>> = [
      { maxTakeDurationMs: Number.NaN },
      { maxImportedTrackBytes: -1 },
      { maxApplicationBytes: Number.POSITIVE_INFINITY },
      { quotaFraction: -0.1 },
      { quotaFraction: 1.1 },
    ];

    for (const limits of invalidLimits) {
      expect(() => createHarness({ limits })).toThrow(/limit|quota/i);
    }
  });

  test("saves, lists, loads, and references media with exact binary keys", async () => {
    const { library, binaries, events } = createHarness();
    const backingRow = backing();
    const takeRow = take({
      backingKind: "imported",
      backingTrackId: backingRow.id,
    });
    const backingData = makeBlob(backingRow.size, backingRow.mimeType);
    const takeData = makeBlob(takeRow.size, takeRow.mimeType);

    await library.saveBacking(backingRow, backingData);
    await library.saveTake(takeRow, takeData);

    await expect(library.listBackings()).resolves.toEqual([backingRow]);
    await expect(library.listTakes()).resolves.toEqual([takeRow]);
    await expect(library.backingBlob(backingRow.id)).resolves.toBe(backingData);
    await expect(library.takeBlob(takeRow.id)).resolves.toBe(takeData);
    await expect(library.references(backingRow.id)).resolves.toEqual([takeRow.id]);
    expect([...binaries.keys()]).toEqual([
      `music-backing-${backingRow.id}`,
      `music-take-${takeRow.id}`,
    ]);
    expect(events.slice(0, 2)).toEqual([
      `binary:put:music-backing-${backingRow.id}`,
      "backing:metadata:put",
    ]);
  });

  test("serializes concurrent same-id saves into one matching metadata/blob pair", async () => {
    const { library, pauseNextBinaryPutAfterWrite } = createHarness();
    const first = backing({ name: "First.wav" });
    const second = backing({ name: "Second.wav", size: 6 });
    const pause = pauseNextBinaryPutAfterWrite();
    const firstSave = library.saveBacking(first, new Blob(["first"], { type: first.mimeType }));
    await pause.started;
    const secondSave = library.saveBacking(second, new Blob(["second"], { type: second.mimeType }));
    await flushAsync();
    pause.release();

    await expect(Promise.all([firstSave, secondSave])).resolves.toEqual([undefined, undefined]);
    await expect(library.listBackings()).resolves.toEqual([second]);
    await expect(library.backingBlob(second.id).then((blob) => blob?.text())).resolves.toBe(
      "second",
    );
  });

  test("serializes concurrent saves before applying the global media budget", async () => {
    const { library, pauseNextBinaryPutAfterWrite } = createHarness({
      limits: { maxApplicationBytes: 6 },
    });
    const first = backing({ id: "first", name: "First.wav", size: 4 });
    const second = backing({ id: "second", name: "Second.wav", size: 4 });
    const pause = pauseNextBinaryPutAfterWrite();
    const firstSave = library.saveBacking(first, makeBlob(first.size, first.mimeType));
    await pause.started;
    const secondSave = library.saveBacking(second, makeBlob(second.size, second.mimeType));
    await flushAsync();
    pause.release();

    await expect(firstSave).resolves.toBeUndefined();
    await expect(secondSave).rejects.toThrow(/budget/i);
    await expect(library.listBackings()).resolves.toEqual([first]);
    await expect(library.usage()).resolves.toMatchObject({ totalBytes: 4 });
  });

  test("serializes backing deletion behind a take save that creates a reference", async () => {
    const { library, pauseNextBinaryPutAfterWrite } = createHarness();
    const backingRow = backing();
    await library.saveBacking(backingRow, makeBlob(backingRow.size, backingRow.mimeType));
    const referencedTake = take({
      backingKind: "imported",
      backingTrackId: backingRow.id,
    });
    const pause = pauseNextBinaryPutAfterWrite();
    const takeSave = library.saveTake(
      referencedTake,
      makeBlob(referencedTake.size, referencedTake.mimeType),
    );
    await pause.started;
    const backingDelete = library.deleteBacking(backingRow.id);
    await flushAsync();
    pause.release();

    await expect(takeSave).resolves.toBeUndefined();
    await expect(backingDelete).rejects.toThrow(/referenced/i);
    await expect(library.listBackings()).resolves.toEqual([backingRow]);
    await expect(library.references(backingRow.id)).resolves.toEqual([referencedTake.id]);
  });

  test("coordinates concurrent same-id saves across library instances", async () => {
    const { first, second } = createSharedHarness();
    const firstRow = backing({ name: "First.wav" });
    const secondRow = backing({ name: "Second.wav", size: 6 });

    await expect(
      Promise.all([
        first.saveBacking(firstRow, new Blob(["first"], { type: firstRow.mimeType })),
        second.saveBacking(secondRow, new Blob(["second"], { type: secondRow.mimeType })),
      ]),
    ).resolves.toEqual([undefined, undefined]);

    const [storedRow] = await first.listBackings();
    const storedBlobText = await first.backingBlob(firstRow.id).then((blob) => blob?.text());
    expect(storedRow).toBeDefined();
    expect(storedBlobText).toBe(storedRow?.name === firstRow.name ? "first" : "second");
  });

  test("coordinates concurrent cross-instance saves before applying the global budget", async () => {
    const { first, second } = createSharedHarness({
      limits: { maxApplicationBytes: 6 },
    });
    const firstRow = backing({ id: "first", name: "First.wav", size: 4 });
    const secondRow = backing({ id: "second", name: "Second.wav", size: 4 });

    const results = await Promise.allSettled([
      first.saveBacking(firstRow, makeBlob(firstRow.size, firstRow.mimeType)),
      second.saveBacking(secondRow, makeBlob(secondRow.size, secondRow.mimeType)),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    await expect(first.usage()).resolves.toMatchObject({ totalBytes: 4 });
  });

  test("coordinates concurrent backing deletion and imported take save across instances", async () => {
    const { first, second } = createSharedHarness();
    const backingRow = backing();
    const importedTake = take({
      backingKind: "imported",
      backingTrackId: backingRow.id,
    });
    await first.saveBacking(backingRow, makeBlob(backingRow.size, backingRow.mimeType));

    await Promise.allSettled([
      first.deleteBacking(backingRow.id, { orphanTakes: true }),
      second.saveTake(importedTake, makeBlob(importedTake.size, importedTake.mimeType)),
    ]);

    const backings = await first.listBackings();
    const takes = await first.listTakes();
    expect(
      takes.some(
        (row) =>
          row.backingKind === "imported" &&
          row.backingTrackId === backingRow.id &&
          !backings.some((backingRow) => backingRow.id === row.backingTrackId),
      ),
    ).toBe(false);
  });

  test("accepts MP3 and WAV backing MIME types", async () => {
    const { library } = createHarness();
    const mimeTypes = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav"];

    for (const [index, mimeType] of mimeTypes.entries()) {
      const row = backing({ id: `backing-${index}`, mimeType });
      await library.saveBacking(row, makeBlob(row.size, mimeType));
    }

    await expect(library.listBackings()).resolves.toHaveLength(mimeTypes.length);
  });

  test("rejects invalid backing metadata before writing", async () => {
    const { library, binaries } = createHarness({
      limits: { maxImportedTrackBytes: 5 },
    });

    const cases: Array<[string, ImportedBackingTrackRow, Blob]> = [
      ["MIME", backing({ mimeType: "audio/ogg" }), makeBlob(5, "audio/ogg")],
      ["size", backing({ size: 4 }), makeBlob(5, "audio/wav")],
      ["duration", backing({ durationMs: Number.NaN }), makeBlob(5, "audio/wav")],
      ["duration", backing({ durationMs: -1 }), makeBlob(5, "audio/wav")],
      ["limit", backing({ size: 6 }), makeBlob(6, "audio/wav")],
    ];

    for (const [message, row, blob] of cases) {
      await expect(library.saveBacking(row, blob)).rejects.toThrow(new RegExp(message, "i"));
    }
    expect(binaries.size).toBe(0);
  });

  test("validates backing identity, name, and timestamp before writing", async () => {
    const { library, binaries } = createHarness();
    const invalidRows = [
      backing({ id: "" }),
      backing({ id: " " }),
      backing({ id: "bad/id" }),
      backing({ id: "bad\\id" }),
      backing({ id: "bad\0id" }),
      backing({ name: " " }),
      backing({ createdAt: unixMs(Number.NaN) }),
    ];

    for (const row of invalidRows) {
      await expect(library.saveBacking(row, makeBlob(row.size, row.mimeType))).rejects.toThrow();
    }
    expect(binaries.size).toBe(0);
  });

  test("validates take MIME, size, and duration before writing", async () => {
    const { library, binaries } = createHarness({
      limits: { maxTakeDurationMs: 100 },
    });
    const cases: Array<[string, AudioTakeRow, Blob]> = [
      ["MIME", take({ mimeType: "" }), makeBlob(4, "")],
      ["MIME", take(), makeBlob(4, "audio/ogg")],
      ["MIME", take({ mimeType: "audio/flac", durationMs: 100 }), makeBlob(4, "audio/flac")],
      ["size", take({ size: 3 }), makeBlob(4, "audio/webm")],
      ["duration", take({ durationMs: Number.NaN }), makeBlob(4, "audio/webm")],
      ["duration", take({ durationMs: -1 }), makeBlob(4, "audio/webm")],
      ["duration", take({ durationMs: 101 }), makeBlob(4, "audio/webm")],
    ];

    for (const [message, row, blob] of cases) {
      await expect(library.saveTake(row, blob)).rejects.toThrow(new RegExp(message, "i"));
    }

    const untypedBlobTake = take({ id: "untyped", durationMs: 100 });
    await library.saveTake(untypedBlobTake, makeBlob(untypedBlobTake.size, ""));
    expect(binaries.has("music-take-untyped")).toBe(true);
  });

  test("accepts take MIME families supported by downloads", async () => {
    const { library } = createHarness();
    const mimeTypes = [
      "audio/webm;codecs=opus",
      "audio/ogg",
      "audio/mp4",
      "audio/wav",
      "audio/x-wav",
      "audio/mpeg",
      "audio/mp3",
    ];

    for (const [index, mimeType] of mimeTypes.entries()) {
      const row = take({ id: `take-${index}`, mimeType });
      await library.saveTake(row, makeBlob(row.size, mimeType));
    }

    await expect(library.listTakes()).resolves.toHaveLength(mimeTypes.length);
  });

  test("validates take identity, timestamps, offsets, and generated backing fields", async () => {
    const { library, binaries } = createHarness();
    const generated = { progressionId: "ii-v-i", bpm: 120, loop: true };
    const invalidRows = [
      take({ id: "" }),
      take({ id: "bad/id" }),
      take({ name: " " }),
      take({ createdAt: unixMs(Number.POSITIVE_INFINITY) }),
      take({ instrument: "banjo" as AudioTakeRow["instrument"] }),
      take({ backingOffsetMs: Number.NaN }),
      take({ backingOffsetMs: -1 }),
      take({
        backingKind: "generated",
        generatedBacking: { ...generated, progressionId: " " },
      }),
      take({
        backingKind: "generated",
        generatedBacking: { ...generated, bpm: 0 },
      }),
      take({
        backingKind: "generated",
        generatedBacking: { ...generated, bpm: Number.NaN },
      }),
      take({
        backingKind: "generated",
        generatedBacking: { ...generated, loop: "yes" as unknown as boolean },
      }),
    ];

    for (const row of invalidRows) {
      await expect(library.saveTake(row, makeBlob(row.size, row.mimeType))).rejects.toThrow();
    }
    expect(binaries.size).toBe(0);
  });

  test("removes a partial new blob when binary persistence mutates then fails", async () => {
    const { library, backingRepository, binaries, failNextBinaryPutAfterWrite } = createHarness();
    const row = backing();
    failNextBinaryPutAfterWrite();

    await expect(library.saveBacking(row, makeBlob(row.size, row.mimeType))).rejects.toThrow(
      "binary put failed",
    );

    expect(backingRepository.rows.size).toBe(0);
    expect(binaries.has(`music-backing-${row.id}`)).toBe(false);
  });

  test("restores the previous blob when replacement binary persistence mutates then fails", async () => {
    const { library, backingRepository, failNextBinaryPutAfterWrite } = createHarness();
    const original = backing({ name: "Original.wav" });
    const originalBlob = new Blob(["old!!"], { type: original.mimeType });
    await library.saveBacking(original, originalBlob);
    const replacement = backing({ name: "Replacement.wav", size: 4 });
    failNextBinaryPutAfterWrite();

    await expect(
      library.saveBacking(replacement, new Blob(["new!"], { type: replacement.mimeType })),
    ).rejects.toThrow("binary put failed");

    await expect(library.listBackings()).resolves.toEqual([original]);
    await expect(library.backingBlob(original.id).then((blob) => blob?.text())).resolves.toBe(
      "old!!",
    );
    expect(backingRepository.rows.get(original.id)).toEqual(original);
  });

  test("enforces imported, generated, and no-backing invariants", async () => {
    const { library } = createHarness();
    const backingRow = backing();
    await library.saveBacking(backingRow, makeBlob(backingRow.size, backingRow.mimeType));
    const generatedBacking = { progressionId: "ii-v-i", bpm: 120, loop: true };

    const validRows = [
      take({
        id: "imported",
        backingKind: "imported",
        backingTrackId: backingRow.id,
      }),
      take({
        id: "generated",
        backingKind: "generated",
        generatedBacking,
      }),
      take({ id: "dry" }),
    ];
    for (const row of validRows) {
      await library.saveTake(row, makeBlob(row.size, row.mimeType));
    }

    const invalidRows = [
      take({ id: "missing-kind", backingTrackId: backingRow.id }),
      take({ id: "missing-import", backingKind: "imported" }),
      take({
        id: "imported-generated",
        backingKind: "imported",
        backingTrackId: backingRow.id,
        generatedBacking,
      }),
      take({ id: "missing-generated", backingKind: "generated" }),
      take({
        id: "generated-imported",
        backingKind: "generated",
        backingTrackId: backingRow.id,
        generatedBacking,
      }),
      take({ id: "unknown-import", backingKind: "imported", backingTrackId: "missing" }),
      take({ id: "kind-only", backingKind: "imported" }),
      take({ id: "generated-only", generatedBacking }),
      take({ id: "unknown-kind", backingKind: "unknown" as "imported" }),
    ];
    for (const row of invalidRows) {
      await expect(library.saveTake(row, makeBlob(row.size, row.mimeType))).rejects.toThrow(
        /backing/i,
      );
    }
  });

  test("reports usage and applies the effective quota budget", async () => {
    const { library } = createHarness(
      {
        limits: {
          maxApplicationBytes: 100,
          quotaFraction: 0.8,
        },
      },
      { quota: 20 },
    );
    const backingRow = backing();
    const takeRow = take();

    await library.saveBacking(backingRow, makeBlob(backingRow.size, backingRow.mimeType));
    await library.saveTake(takeRow, makeBlob(takeRow.size, takeRow.mimeType));

    await expect(library.usage()).resolves.toEqual({
      backingBytes: 5,
      takeBytes: 4,
      totalBytes: 9,
      effectiveBudgetBytes: 16,
      remainingBytes: 7,
    });
  });

  test("falls back to the application budget when browser quota is absent", async () => {
    const { library } = createHarness({
      limits: { maxApplicationBytes: 12 },
    });

    await expect(library.usage()).resolves.toMatchObject({
      effectiveBudgetBytes: 12,
      remainingBytes: 12,
    });
  });

  test("enforces budget and accounts for replacement blobs only once", async () => {
    const { library } = createHarness({
      limits: { maxApplicationBytes: 8 },
    });
    const backingRow = backing();
    const takeRow = take({ size: 3 });
    await library.saveBacking(backingRow, makeBlob(backingRow.size, backingRow.mimeType));
    await library.saveTake(takeRow, makeBlob(takeRow.size, takeRow.mimeType));

    const smallerReplacement = backing({ size: 4 });
    await expect(
      library.saveBacking(
        smallerReplacement,
        makeBlob(smallerReplacement.size, smallerReplacement.mimeType),
      ),
    ).resolves.toBeUndefined();

    const oversizedReplacement = backing({ size: 6 });
    await expect(
      library.saveBacking(
        oversizedReplacement,
        makeBlob(oversizedReplacement.size, oversizedReplacement.mimeType),
      ),
    ).rejects.toThrow(/budget/i);

    await expect(library.listBackings()).resolves.toEqual([smallerReplacement]);
  });

  test("uses previous metadata size for replacement budget accounting", async () => {
    const { library, binaries } = createHarness({
      limits: { maxApplicationBytes: 8 },
    });
    const backingRow = backing();
    const takeRow = take({ size: 3 });
    await library.saveBacking(backingRow, makeBlob(backingRow.size, backingRow.mimeType));
    await library.saveTake(takeRow, makeBlob(takeRow.size, takeRow.mimeType));
    binaries.set(`music-backing-${backingRow.id}`, makeBlob(1, backingRow.mimeType));

    const replacement = backing({ name: "Replacement.wav" });
    await expect(
      library.saveBacking(replacement, makeBlob(replacement.size, replacement.mimeType)),
    ).resolves.toBeUndefined();
    await expect(library.usage()).resolves.toMatchObject({ totalBytes: 8 });
  });

  test("reconciles orphan binary blobs before reporting usage", async () => {
    const { library, binaries, events } = createHarness();
    const row = take();
    binaries.set("music-take-orphan", makeBlob(7, row.mimeType));
    await library.saveTake(row, makeBlob(row.size, row.mimeType));

    await expect(library.usage()).resolves.toMatchObject({ totalBytes: row.size });
    expect(binaries.has("music-take-orphan")).toBe(false);
    expect(events).toContain("binary:delete:music-take-orphan");
  });

  test("aborts replacement when the previous blob cannot be read", async () => {
    const { library, backingRepository, binaries, failNextBinaryRead } = createHarness();
    const original = backing({ name: "Original.wav" });
    const originalBlob = makeBlob(original.size, original.mimeType);
    await library.saveBacking(original, originalBlob);
    failNextBinaryRead();
    const replacement = backing({ name: "Replacement.wav", size: 4 });

    await expect(
      library.saveBacking(replacement, makeBlob(replacement.size, replacement.mimeType)),
    ).rejects.toThrow("binary read failed");

    expect(backingRepository.rows.get(original.id)).toEqual(original);
    expect(binaries.get(`music-backing-${original.id}`)).toBe(originalBlob);
  });

  test("removes a new blob and metadata when metadata persistence fails", async () => {
    const { library, backingRepository, binaries } = createHarness();
    backingRepository.failNextPutAfterWrite = true;
    const row = backing();

    await expect(library.saveBacking(row, makeBlob(row.size, row.mimeType))).rejects.toThrow(
      "metadata put failed",
    );

    expect(backingRepository.rows.size).toBe(0);
    expect(binaries.has(`music-backing-${row.id}`)).toBe(false);
  });

  test("restores the previous blob and metadata when replacement metadata fails", async () => {
    const { library, backingRepository } = createHarness();
    const original = backing({ name: "Original.wav" });
    const originalBlob = makeBlob(original.size, original.mimeType);
    await library.saveBacking(original, originalBlob);
    backingRepository.failNextPutAfterWrite = true;
    const replacement = backing({ name: "Replacement.wav", size: 4 });

    await expect(
      library.saveBacking(replacement, makeBlob(replacement.size, replacement.mimeType)),
    ).rejects.toThrow("metadata put failed");

    await expect(library.listBackings()).resolves.toEqual([original]);
    await expect(library.backingBlob(original.id).then((blob) => blob?.size)).resolves.toBe(
      originalBlob.size,
    );
  });

  test("deletes take metadata before its blob and restores metadata on failure", async () => {
    const { library, takeRepository, events } = createHarness();
    const row = take();
    const blob = makeBlob(row.size, row.mimeType);
    await library.saveTake(row, blob);
    events.length = 0;

    takeRepository.failNextDeleteAfterDelete = true;
    await expect(library.deleteTake(row.id)).rejects.toThrow("metadata delete failed");
    expect(events).toEqual(["take:metadata:delete", "take:metadata:put"]);
    await expect(library.listTakes()).resolves.toEqual([row]);
    await expect(library.takeBlob(row.id).then((stored) => stored?.size)).resolves.toBe(blob.size);

    await library.deleteTake(row.id);
    await expect(library.listTakes()).resolves.toEqual([]);
    await expect(library.takeBlob(row.id)).resolves.toBeUndefined();
  });

  test("leaves take metadata and blob intact when binary deletion fails", async () => {
    const { library, events, failNextBinaryDelete } = createHarness();
    const row = take();
    await library.saveTake(row, makeBlob(row.size, row.mimeType));
    events.length = 0;
    failNextBinaryDelete();

    await expect(library.deleteTake(row.id)).rejects.toThrow("binary delete failed");
    expect(events.slice(0, 3)).toEqual([
      "take:metadata:delete",
      `binary:delete:music-take-${row.id}`,
      `binary:put:music-take-${row.id}`,
    ]);
    await expect(library.listTakes()).resolves.toEqual([row]);
    await expect(library.takeBlob(row.id)).resolves.toBeDefined();
  });

  test("rejects referenced backing deletion unless takes are orphaned", async () => {
    const { library } = createHarness();
    const backingRow = backing();
    const importedTake = take({
      backingKind: "imported",
      backingTrackId: backingRow.id,
    });
    const dryTake = take({ id: "dry-take", name: "Dry Take.webm" });
    await library.saveBacking(backingRow, makeBlob(backingRow.size, backingRow.mimeType));
    await library.saveTake(importedTake, makeBlob(importedTake.size, importedTake.mimeType));
    await library.saveTake(dryTake, makeBlob(dryTake.size, dryTake.mimeType));

    await expect(library.deleteBacking(backingRow.id)).rejects.toThrow(/referenced/i);
    await library.deleteBacking(backingRow.id, { orphanTakes: true });

    await expect(library.listBackings()).resolves.toEqual([]);
    await expect(library.backingBlob(backingRow.id)).resolves.toBeUndefined();
    await expect(library.listTakes()).resolves.toEqual([
      {
        ...importedTake,
        backingKind: undefined,
        backingTrackId: undefined,
      },
      dryTake,
    ]);
    await expect(library.takeBlob(importedTake.id)).resolves.toBeDefined();
    await expect(library.takeBlob(dryTake.id)).resolves.toBeDefined();
  });

  test("rolls orphaned takes back when backing deletion fails", async () => {
    const { library, backingRepository } = createHarness();
    const backingRow = backing();
    const importedTake = take({
      backingKind: "imported",
      backingTrackId: backingRow.id,
    });
    await library.saveBacking(backingRow, makeBlob(backingRow.size, backingRow.mimeType));
    await library.saveTake(importedTake, makeBlob(importedTake.size, importedTake.mimeType));
    backingRepository.failNextDeleteAfterDelete = true;

    await expect(library.deleteBacking(backingRow.id, { orphanTakes: true })).rejects.toThrow(
      "metadata delete failed",
    );

    await expect(library.listBackings()).resolves.toEqual([backingRow]);
    await expect(library.backingBlob(backingRow.id)).resolves.toBeDefined();
    await expect(library.listTakes()).resolves.toEqual([importedTake]);
  });

  test("restores backing and take metadata when backing blob deletion fails", async () => {
    const { library, failNextBinaryDelete } = createHarness();
    const backingRow = backing();
    const importedTake = take({
      backingKind: "imported",
      backingTrackId: backingRow.id,
    });
    await library.saveBacking(backingRow, makeBlob(backingRow.size, backingRow.mimeType));
    await library.saveTake(importedTake, makeBlob(importedTake.size, importedTake.mimeType));
    failNextBinaryDelete();

    await expect(library.deleteBacking(backingRow.id, { orphanTakes: true })).rejects.toThrow(
      "binary delete failed",
    );

    await expect(library.listBackings()).resolves.toEqual([backingRow]);
    await expect(library.listTakes()).resolves.toEqual([importedTake]);
    await expect(library.backingBlob(backingRow.id)).resolves.toBeDefined();
  });

  test("reports rollback failures and continues processing later queued mutations", async () => {
    const { library, takeRepository, failNextBinaryDelete } = createHarness();
    const first = take();
    await library.saveTake(first, makeBlob(first.size, first.mimeType));
    failNextBinaryDelete();
    takeRepository.failNextPutAfterWrite = true;

    const error = await library.deleteTake(first.id).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toHaveLength(2);

    const second = take({ id: "take-2", name: "Take 2.webm" });
    await expect(
      library.saveTake(second, makeBlob(second.size, second.mimeType)),
    ).resolves.toBeUndefined();
    await expect(library.listTakes()).resolves.toContainEqual(second);
  });

  test("creates a library from PracticeStore repositories", async () => {
    const backingRepository = new MemoryRepository<ImportedBackingTrackRow>([backing()]);
    const takeRepository = new MemoryRepository<AudioTakeRow>([take()]);
    const store = { backingTracks: backingRepository, audioTakes: takeRepository };
    const library = createMediaLibrary(store as unknown as PracticeStore);

    await expect(library.listBackings()).resolves.toEqual([backing()]);
    await expect(library.listTakes()).resolves.toEqual([take()]);
  });

  test("derives supported extensions and avoids duplicate download extensions", () => {
    expect(extensionForMimeType("audio/webm;codecs=opus")).toBe("webm");
    expect(extensionForMimeType("audio/ogg")).toBe("ogg");
    expect(extensionForMimeType("audio/mp4")).toBe("mp4");
    expect(extensionForMimeType("audio/x-wav")).toBe("wav");
    expect(extensionForMimeType("audio/mpeg")).toBe("mp3");
    expect(() => extensionForMimeType("audio/flac")).toThrow(/unsupported/i);
    expect(downloadName("Take 1", "audio/webm")).toBe("Take 1.webm");
    expect(downloadName("Take 1.WEBM", "audio/webm")).toBe("Take 1.WEBM");
  });
});

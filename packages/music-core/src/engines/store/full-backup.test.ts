import JSZip from "jszip";
import { unixMs } from "@repo/music-core/domain";
import { afterEach, describe, expect, test, vi } from "vitest";
import { PracticeDatabase, PracticeStore } from "./index";
import {
  prepareMusicFullBackup,
  parseMusicFullBackup,
  restoreMusicFullBackup,
  MUSIC_FULL_BACKUP_MAX_BYTES,
  type MusicFullBackupManifest,
} from "./full-backup";

const databases: PracticeDatabase[] = [];
afterEach(async () => {
  await Promise.all(databases.splice(0).map((db) => db.delete()));
});
function store() {
  const db = new PracticeDatabase(`full-backup-${crypto.randomUUID()}`);
  databases.push(db);
  return new PracticeStore(db);
}
function binaries() {
  const files = new Map<string, Blob>();
  return {
    files,
    getBinary: vi.fn(async (key: string) => files.get(key)),
    putBinary: vi.fn(async (key: string, blob: Blob) => {
      files.set(key, blob);
    }),
    deleteBinary: vi.fn(async (key: string) => {
      files.delete(key);
    }),
  };
}
async function fixture() {
  const source = store();
  const io = binaries();
  const media = {
    name: "Audio",
    mimeType: "audio/wav",
    size: 4,
    durationMs: 10,
    createdAt: unixMs(1),
  };
  await source.database.backingTracks.put({ id: "back", ...media });
  await source.database.audioTakes.put({
    id: "take",
    ...media,
    instrument: "piano",
    backingOffsetMs: 0,
    backingKind: "imported",
    backingTrackId: "back",
  });
  await source.settings.put({
    id: "music.sample-kits",
    value: [
      {
        id: "kit",
        name: "Kit",
        createdAt: 1,
        updatedAt: 1,
        assignments: [],
        samples: [
          {
            id: "sample",
            fileName: "kick.wav",
            displayName: "Kick",
            mimeType: "audio/wav",
            size: 4,
            binaryKey: "music.sample-kits/kit/sample-kick.wav",
          },
        ],
      },
    ],
  });
  await source.settings.put({ id: "music.settings", value: { bpm: 120 } });
  await source.settings.put({
    id: "music.recording.midi-takes",
    value: [
      {
        id: "midi",
        name: "MIDI take",
        source: "midi",
        durationMs: 500,
        notes: [{ midi: 60, atMs: 0, velocity: 0.7 }],
      },
    ],
  });
  await source.songs.put({
    id: "score",
    title: "Score",
    score: {
      id: "score",
      origin: "midi",
      tempoMap: [{ atBeat: 0, bpm: 120 }],
      timeSignatures: [{ atBeat: 0, numerator: 4, denominator: 4 }],
      voices: [{ id: "piano", name: "Piano", role: "melody" }],
      notes: [{ midiNote: 60, startBeat: 0, durationBeats: 1, velocity: 0.7, voiceId: "piano" }],
      chords: [],
      sections: [],
      markers: [],
    },
    source: { format: "musicxml", content: "<score-partwise/>" },
  });
  for (const key of [
    "music-backing-back",
    "music-take-take",
    "music.sample-kits/kit/sample-kick.wav",
  ])
    io.files.set(key, new Blob(["wave"]));
  const prepared = await prepareMusicFullBackup(source, io);
  return { source, io, prepared, parsed: await parseMusicFullBackup(prepared.blob) };
}
async function archive(manifest: MusicFullBackupManifest, mutate?: (zip: JSZip) => void) {
  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(manifest));
  for (const asset of manifest.assets) zip.file(asset.path, "wave", { createFolders: false });
  mutate?.(zip);
  return new Blob([await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" })]);
}

describe("full collection backup", () => {
  test("round trips all binary categories including unassigned samples and saved settings/source", async () => {
    const { prepared, parsed } = await fixture();
    expect(prepared.byteSize).toBe(prepared.blob.size);
    expect(parsed.manifest.assets).toHaveLength(3);
    const destination = store();
    const io = binaries();
    await restoreMusicFullBackup(destination, parsed, io);
    expect(io.files.size).toBe(3);
    expect(await destination.songs.get("score")).toMatchObject({
      source: { content: "<score-partwise/>" },
    });
    expect(await destination.settings.get("music.settings")).toMatchObject({ value: { bpm: 120 } });
    expect(await destination.settings.get("music.recording.midi-takes")).toMatchObject({
      value: [
        expect.objectContaining({ id: "midi", notes: [expect.objectContaining({ midi: 60 })] }),
      ],
    });
    expect(await destination.songs.get("score")).toMatchObject({
      score: { notes: [expect.objectContaining({ midiNote: 60 })] },
    });
    for (const blob of io.files.values()) {
      expect(await blob.text()).toBe("wave");
      expect(blob.type).toBe("audio/wav");
    }
  });
  test("writes version 2 archives and still restores a version 1 archive", async () => {
    const { parsed } = await fixture();
    expect(parsed.manifest.version).toBe(2);

    const legacy = structuredClone(parsed.manifest);
    Object.assign(legacy, { version: 1 });
    Object.assign(legacy.data, { version: 1 });
    const restored = await parseMusicFullBackup(await archive(legacy));

    expect(restored.manifest.version).toBe(1);
    const destination = store();
    const io = binaries();
    await restoreMusicFullBackup(destination, restored, io);
    expect(await destination.audioTakes.get("take")).not.toHaveProperty("gainDb");
  });

  test("fails export for missing or metadata-sized-mismatched referenced files", async () => {
    const { source, io } = await fixture();
    io.files.delete("music-backing-back");
    await expect(prepareMusicFullBackup(source, io)).rejects.toThrow(/missing/i);
    io.files.set("music-backing-back", new Blob(["wrong"]));
    await expect(prepareMusicFullBackup(source, io)).rejects.toThrow(/size/i);
  });
  test.each([
    "version",
    "key",
    "mime",
    "size",
    "hash",
    "duplicate",
    "path",
    "extra",
    "missing",
    "traversal",
  ])("rejects %s archive", async (kind) => {
    const { parsed } = await fixture();
    const manifest = structuredClone(parsed.manifest);
    if (kind === "version") Object.assign(manifest, { version: 3 });
    if (kind === "key") manifest.assets[0]!.key = "pdf/private";
    if (kind === "mime") manifest.assets[0]!.mimeType = "text/plain";
    if (kind === "size") manifest.assets[0]!.size = 3;
    if (kind === "hash") manifest.assets[0]!.sha256 = "0".repeat(64);
    if (kind === "duplicate") manifest.assets.push(manifest.assets[0]!);
    if (kind === "path") manifest.assets[0]!.path = "../manifest.json";
    const blob = await archive(manifest, (zip) => {
      if (kind === "extra") zip.file("other", "extra");
      if (kind === "missing") zip.remove("media/0");
      if (kind === "traversal") {
        zip.remove("media/0");
        zip.file("media/../media/0", "wave", { createFolders: false });
      }
    });
    await expect(parseMusicFullBackup(blob)).rejects.toThrow();
  });
  test("bounds decompression of an oversized compressed manifest", async () => {
    const zip = new JSZip().file("manifest.json", " ".repeat(50 * 1024 * 1024 + 1));
    const blob = new Blob([
      await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" }),
    ]);
    expect(blob.size).toBeLessThan(1024 * 1024);
    await expect(parseMusicFullBackup(blob)).rejects.toThrow(/limit|MiB/i);
  }, 15000);
  test("rejects manifest inventory over total limit before reading files", async () => {
    const { parsed } = await fixture();
    parsed.manifest.assets[0]!.size = MUSIC_FULL_BACKUP_MAX_BYTES;
    parsed.manifest.data.tables.backingTracks[0]!.size = MUSIC_FULL_BACKUP_MAX_BYTES;
    const io = binaries();
    await expect(restoreMusicFullBackup(store(), parsed, io)).rejects.toThrow(/250 MiB/);
    expect(io.getBinary).not.toHaveBeenCalled();
  });
  test("reuses identical existing bytes, aborts differing orphan bytes before any write", async () => {
    const { parsed } = await fixture();
    const io = binaries();
    const destination = store();
    io.files.set("music-take-take", new Blob(["evil"]));
    await expect(restoreMusicFullBackup(destination, parsed, io)).rejects.toThrow(
      /different|collision/i,
    );
    expect(io.putBinary).not.toHaveBeenCalled();
    io.files.set("music-take-take", new Blob(["wave"]));
    await restoreMusicFullBackup(destination, parsed, io);
    expect(io.putBinary).toHaveBeenCalledTimes(2);
  });
  test.each(["partial write", "transaction"])(
    "rolls back only attempted new files after %s failure",
    async (kind) => {
      const { parsed } = await fixture();
      const io = binaries();
      const destination = store();
      io.files.set("music-take-take", new Blob(["wave"]));
      io.files.set("pdf-unrelated", new Blob(["pdf"]));
      await destination.songs.put({ id: "old", title: "Keep" });
      if (kind === "partial write")
        io.putBinary.mockImplementation(async (key, blob) => {
          io.files.set(key, blob);
          throw new Error("partial failed");
        });
      else
        destination.database.songs.hook("creating", () => {
          throw new Error("transaction failed");
        });
      await expect(restoreMusicFullBackup(destination, parsed, io)).rejects.toThrow(/failed/);
      expect([...io.files.keys()]).toEqual(["music-take-take", "pdf-unrelated"]);
      expect(await destination.songs.get("old")).toMatchObject({ title: "Keep" });
      expect(io.deleteBinary).not.toHaveBeenCalledWith("music-take-take");
    },
  );
  test("reports cleanup failures alongside the write failure", async () => {
    const { parsed } = await fixture();
    const io = binaries();
    io.putBinary.mockRejectedValue(new Error("disk full"));
    io.deleteBinary.mockRejectedValue(new Error("cleanup denied"));
    await expect(restoreMusicFullBackup(store(), parsed, io)).rejects.toThrow(
      /disk full.*cleanup.*denied/i,
    );
  });
  test("captures data and Blob references before waiting for the mutation lock", async () => {
    const { parsed } = await fixture();
    const io = binaries();
    const destination = store();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pending = restoreMusicFullBackup(destination, parsed, {
      ...io,
      withMutationLock: async (operation) => {
        await gate;
        return operation();
      },
    });
    parsed.manifest.data.tables.songs[0]!.title = "Mutated";
    parsed.files.clear();
    parsed.manifest.assets.length = 0;
    release();
    await pending;
    expect(await destination.songs.get("score")).toMatchObject({ title: "Score" });
    expect(io.files.size).toBe(3);
  });
});

test("rejects expanded media larger than declared metadata", async () => {
  const { parsed } = await fixture();
  const file = await archive(parsed.manifest, (zip) =>
    zip.file("media/0", "x".repeat(1024 * 1024), { createFolders: false }),
  );
  await expect(parseMusicFullBackup(file)).rejects.toThrow(/limit/i);
});
test("keeps current media metadata authoritative and cleans staged files on precommit rejection", async () => {
  const { parsed } = await fixture();
  const destination = store();
  const io = binaries();
  const current = { ...parsed.manifest.data.tables.backingTracks[0]!, id: "current" };
  await destination.database.backingTracks.put(current);
  io.files.set("music-backing-current", new Blob(["keep"]));
  await expect(restoreMusicFullBackup(destination, parsed, io)).rejects.toThrow(
    /current local media/i,
  );
  expect(await destination.database.backingTracks.toArray()).toEqual([current]);
  expect([...io.files.keys()]).toEqual(["music-backing-current"]);
});
test.each(["manifest", "blob", "extra file", "namespace"])(
  "revalidates %s before writing an externally changed parsed payload",
  async (kind) => {
    const { parsed } = await fixture();
    const io = binaries();
    if (kind === "manifest") parsed.manifest.assets[0]!.sha256 = "bad";
    if (kind === "blob") parsed.files.set(parsed.manifest.assets[0]!.key, new Blob(["evil"]));
    if (kind === "extra file") parsed.files.set("pdf/file", new Blob(["evil"]));
    if (kind === "namespace") {
      const kits = parsed.manifest.data.tables.settings.find(
        (row) => row.id === "music.sample-kits",
      )!.value as { samples: { binaryKey: string }[] }[];
      kits[0]!.samples[0]!.binaryKey = "pdf/kit/sample-kick.wav";
      parsed.manifest.assets[2]!.key = "pdf/kit/sample-kick.wav";
    }
    await expect(restoreMusicFullBackup(store(), parsed, io)).rejects.toThrow();
    expect(io.putBinary).not.toHaveBeenCalled();
    expect(io.deleteBinary).not.toHaveBeenCalled();
  },
);
test("holds the export lock across both snapshot and binary reads", async () => {
  const { source, io } = await fixture();
  let locked = false;
  const read = vi.fn(async (key: string) => {
    expect(locked).toBe(true);
    return io.files.get(key);
  });
  let snapshotRead = false;
  source.database.settings.hook("reading", (row) => {
    snapshotRead = true;
    expect(locked).toBe(true);
    return row;
  });
  await prepareMusicFullBackup(source, {
    getBinary: read,
    withMutationLock: async (operation) => {
      locked = true;
      try {
        return await operation();
      } finally {
        locked = false;
      }
    },
  });
  expect(snapshotRead).toBe(true);
  expect(read).toHaveBeenCalledTimes(3);
  expect(locked).toBe(false);
});
test("rejects duplicate central-directory paths before JSZip can merge them", async () => {
  const { prepared } = await fixture();
  const buffer = await prepared.blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  for (let offset = 0; offset < bytes.length - 46; offset++) {
    if (view.getUint32(offset, true) === 0x02014b50) {
      const length = view.getUint16(offset + 28, true);
      const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + length));
      if (name === "media/1") bytes[offset + 46 + length - 1] = "0".charCodeAt(0);
    }
  }
  await expect(parseMusicFullBackup(new Blob([buffer]))).rejects.toThrow(/duplicate/i);
});
test("rejects too many files before parsing file contents", async () => {
  const { prepared } = await fixture();
  const buffer = await prepared.blob.arrayBuffer();
  const view = new DataView(buffer);
  const end = buffer.byteLength - 22;
  view.setUint16(end + 8, 10001, true);
  view.setUint16(end + 10, 10001, true);
  await expect(parseMusicFullBackup(new Blob([buffer]))).rejects.toThrow(/10000/i);
});

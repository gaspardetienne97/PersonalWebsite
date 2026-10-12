import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  BACKUP_TABLES,
  BackupError,
  buildDataBackup,
  buildFullBackup,
  readDataBackup,
  readFullBackup,
  type DataBackup,
} from "./backup";

const rows = {
  sessions: [
    {
      id: "s1",
      startTime: 1000,
      endTime: 2000,
      source: "drill",
      runs: [],
      eventIds: ["e1"],
      xp: 40,
      tags: [],
    },
  ],
  scoringEvents: [
    {
      id: "e1",
      sessionId: "s1",
      exerciseId: "ear.intervals",
      at: 1500,
      correct: true,
      partialCredit: 1,
    },
  ],
  skillMastery: [{ skillId: "ear.m3", lastPracticed: 1500, mastery: 0.4 }],
  songs: [{ id: "song1", title: "Blue", createdAt: 1, updatedAt: 2, score: { voices: [] } }],
  settings: [{ id: "music.device-profiles", value: [] }],
  audioTakes: [{ id: "t1", createdAt: 5, instrument: "guitar", gainDb: 3 }],
  midiTakes: [{ id: "m1", createdAt: 6 }],
};
const excluded = { backingTracks: 1, audioTakes: 1, samples: 3 };
const at = new Date("2026-09-25T10:00:00.000Z");

describe("data backup", () => {
  it("builds with counts, the excluded-media block and a byte size, and reads back", () => {
    const b = buildDataBackup(rows, excluded, at);
    expect(b.backup.format).toBe("woodshed-data-backup");
    expect(b.backup.version).toBe(1);
    expect(b.backup.exportedAt).toBe("2026-09-25T10:00:00.000Z");
    expect(Object.keys(b.backup.tables)).toEqual([...BACKUP_TABLES]);
    expect(b.counts).toMatchObject({ sessions: 1, scoringEvents: 1, skills: 0, midiTakes: 1 });
    expect(b.totalRows).toBe(7);
    expect(b.backup.media).toEqual({
      included: false,
      backingTracks: 1,
      audioTakes: 1,
      samples: 3,
    });
    expect(b.bytes).toBe(new TextEncoder().encode(b.json).length);
    const back = readDataBackup(b.json);
    expect(back).toEqual({ ok: true, legacy: false, value: b.backup });
    expect(readDataBackup(new TextEncoder().encode(b.json)).ok).toBe(true);
  });

  it("refuses to build from malformed rows, naming the field", () => {
    try {
      buildDataBackup(
        { sessions: [{ id: "s", startTime: "yesterday", source: "drill" }] },
        excluded,
      );
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BackupError);
      expect((e as BackupError).issues).toEqual([
        { path: "backup.tables.sessions[0].startTime", message: "must be a number" },
      ]);
    }
  });

  it("names the path of every failure on restore", () => {
    const b = JSON.parse(buildDataBackup(rows, excluded, at).json) as DataBackup &
      Record<string, unknown>;
    b.tables.sessions.push(
      { id: "s1", startTime: 3, source: "drill" },
      { startTime: 4, source: "jam" },
    );
    b.tables.scoringEvents[0].at = Number.NaN; // becomes null in JSON
    (b.tables as Record<string, unknown>).skills = "none";
    b.media = { included: true, backingTracks: -1, audioTakes: 0, samples: 0 } as never;
    delete (b as Record<string, unknown>).exportedAt;
    const r = readDataBackup(JSON.stringify(b));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.errors.map((e) => e.path)).toEqual([
      "backup.exportedAt",
      "backup.tables.sessions[1].id",
      "backup.tables.sessions[2].id",
      "backup.tables.scoringEvents[0].at",
      "backup.tables.skills",
      "backup.media.included",
      "backup.media.backingTracks",
    ]);
    expect(r.ok === false && r.errors[1].message).toBe("duplicates an earlier id");
    expect(r.ok === false && r.errors[2].message).toBe("is missing (expected string)");
  });

  it("rejects other formats, unknown versions, bad JSON and anything over 50 MiB", () => {
    expect(readDataBackup('{"format":"something-else"}')).toMatchObject({
      ok: false,
      errors: [{ path: "backup.format" }],
    });
    const b = JSON.parse(buildDataBackup(rows, excluded, at).json);
    expect(readDataBackup(JSON.stringify({ ...b, version: 2 }))).toMatchObject({
      ok: false,
      errors: [{ path: "backup.version" }],
    });
    expect(readDataBackup("{nope")).toMatchObject({
      ok: false,
      errors: [{ message: "is not valid JSON" }],
    });
    expect(readDataBackup(" ".repeat(50 * 1024 * 1024 + 1))).toMatchObject({
      ok: false,
      errors: [{ message: "is over the 50 MiB limit" }],
    });
  });

  it("restores the old practice-os-data-backup v1 and v2, which had no midiTakes", () => {
    const b = JSON.parse(buildDataBackup(rows, excluded, at).json);
    delete b.tables.midiTakes;
    for (const version of [1, 2]) {
      const r = readDataBackup(
        JSON.stringify({ ...b, format: "practice-os-data-backup", version }),
      );
      expect(r.ok && r.legacy).toBe(true);
      expect(r.ok && r.value.format).toBe("woodshed-data-backup");
      expect(r.ok && r.value.tables.midiTakes).toEqual([]);
    }
    expect(
      readDataBackup(JSON.stringify({ ...b, format: "practice-os-data-backup", version: 3 })).ok,
    ).toBe(false);
    // The current format must carry every table.
    expect(readDataBackup(JSON.stringify(b))).toMatchObject({
      ok: false,
      errors: [{ path: "backup.tables.midiTakes" }],
    });
  });
});

const HELLO_SHA = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
const data = () => buildDataBackup(rows, excluded, at).backup;
const blobs = () => [
  { key: "music-take-t1", blob: new Blob(["hello"], { type: "audio/webm" }) },
  { key: "music.sample-kits/k/1-kick.wav", blob: new Blob([new Uint8Array([1, 2, 3, 4])]) },
];

/** A hand-made archive for the failure cases. */
async function archive(manifest: unknown, files: Record<string, string | Uint8Array>) {
  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(manifest));
  for (const [name, body] of Object.entries(files)) zip.file(name, body);
  return zip.generateAsync({ type: "uint8array", compression: "STORE" });
}

describe("full backup", () => {
  it("round-trips data and media with a sha256 per asset, STORE compressed", async () => {
    const zipBytes = await buildFullBackup(data(), blobs());
    const zip = await JSZip.loadAsync(zipBytes);
    expect(Object.keys(zip.files).sort()).toEqual(["manifest.json", "media/0", "media/1"]);
    expect(new TextDecoder().decode(zipBytes)).toContain("hello"); // stored, not deflated
    const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
    expect(manifest).toMatchObject({ format: "woodshed-full-backup", version: 1, data: data() });
    expect(manifest.assets[0]).toEqual({
      key: "music-take-t1",
      path: "media/0",
      size: 5,
      mimeType: "audio/webm",
      sha256: HELLO_SHA,
    });
    expect(manifest.assets[1]).toMatchObject({
      path: "media/1",
      size: 4,
      mimeType: "application/octet-stream",
    });

    const r = await readFullBackup(zipBytes);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.data).toEqual(data());
    expect(r.value.assets.map((a) => [a.key, a.sha256.slice(0, 8), a.blob.type])).toEqual([
      ["music-take-t1", "2cf24dba", "audio/webm"],
      [
        "music.sample-kits/k/1-kick.wav",
        manifest.assets[1].sha256.slice(0, 8),
        "application/octet-stream",
      ],
    ]);
    expect(await r.value.assets[0].blob.text()).toBe("hello");
  });

  it("refuses repeated media keys", async () => {
    const twice = [blobs()[0], blobs()[0]];
    await expect(buildFullBackup(data(), twice)).rejects.toThrow(/repeated/);
  });

  it("aborts on a damaged payload (hash mismatch)", async () => {
    const zipBytes = await buildFullBackup(data(), blobs());
    // A single-byte decoding keeps string and byte indices equal (UTF-8 would merge invalid bytes).
    const at = new TextDecoder("latin1").decode(zipBytes).indexOf("hello");
    zipBytes[at] = "j".charCodeAt(0);
    expect(await readFullBackup(zipBytes)).toMatchObject({
      ok: false,
      errors: [{ path: "media/0", message: "does not match its SHA-256; the file is damaged" }],
    });
  });

  it("checks the directory against the manifest before reading any media", async () => {
    const entry = { key: "k", path: "media/0", size: 5, mimeType: "audio/wav", sha256: HELLO_SHA };
    const m = {
      format: "woodshed-full-backup",
      version: 1,
      exportedAt: at.toISOString(),
      data: data(),
    };
    const wrongSize = await readFullBackup(
      await archive({ ...m, assets: [{ ...entry, size: 6 }] }, { "media/0": "hello" }),
    );
    expect(wrongSize).toMatchObject({
      ok: false,
      errors: [
        { path: "manifest.assets[0].size", message: "says 6 bytes but the archive holds 5" },
      ],
    });
    const missing = await readFullBackup(
      await archive(
        { ...m, assets: [entry, { ...entry, key: "k2", path: "media/1" }] },
        { "media/0": "hello" },
      ),
    );
    expect(missing).toMatchObject({
      ok: false,
      errors: [{ path: "manifest.assets[1].path", message: "media/1 is missing from the archive" }],
    });
    const extra = await readFullBackup(
      await archive({ ...m, assets: [entry] }, { "media/0": "hello", "media/7": "x" }),
    );
    expect(extra).toMatchObject({ ok: false, errors: [{ path: "media/7" }] });
    const badPath = await readFullBackup(
      await archive({ ...m, assets: [{ ...entry, path: "media/9" }] }, { "media/0": "hello" }),
    );
    expect(badPath.ok === false && badPath.errors[0]).toEqual({
      path: "manifest.assets[0].path",
      message: "must be media/0",
    });
    const badData = await readFullBackup(
      await archive({ ...m, data: { ...data(), media: null }, assets: [] }, {}),
    );
    expect(badData).toMatchObject({ ok: false, errors: [{ path: "manifest.data.media" }] });
  });

  it("accepts the old practice-os-full-backup manifest and rejects non-ZIPs", async () => {
    const m = {
      format: "practice-os-full-backup",
      version: 2,
      exportedAt: at.toISOString(),
      data: data(),
      assets: [],
    };
    const r = await readFullBackup(await archive(m, {}));
    expect(r.ok && r.legacy).toBe(true);
    expect(await readFullBackup(new Uint8Array([1, 2, 3]))).toMatchObject({
      ok: false,
      errors: [{ message: "is not a readable ZIP" }],
    });
    expect(await readFullBackup(await archive({ format: "zip-of-cats" }, {}))).toMatchObject({
      ok: false,
      errors: [{ path: "manifest.format" }],
    });
  });
});

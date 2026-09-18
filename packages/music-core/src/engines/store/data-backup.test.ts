import { afterEach, describe, expect, test, vi } from "vitest";

import { Capability, unixMs } from "@repo/music-core/domain";

import { PracticeDatabase, PracticeStore } from "./index";
import {
  parseMusicDataBackup,
  prepareMusicDataBackup,
  restoreMusicDataBackup,
  validateMusicDataBackup,
  MUSIC_DATA_BACKUP_VERSION,
  type MusicDataBackupV1,
} from "./data-backup";

const databases: PracticeDatabase[] = [];

afterEach(async () => {
  await Promise.all(databases.map((database) => database.delete()));
  databases.length = 0;
});

function createStore(): PracticeStore {
  const database = new PracticeDatabase(`data-backup-${crypto.randomUUID()}`);
  databases.push(database);
  return new PracticeStore(database);
}

function backup(overrides: Partial<MusicDataBackupV1["tables"]> = {}): MusicDataBackupV1 {
  const tables: MusicDataBackupV1["tables"] = {
    sessions: [],
    scoringEvents: [],
    skillMastery: [],
    skills: [],
    skillRelationships: [],
    chordLibrary: [],
    songs: [],
    settings: [],
    backingTracks: [],
    audioTakes: [],
    ...overrides,
  };
  const sampleFiles = tables.settings
    .filter((row) => row.id === "music.sample-kits")
    .flatMap((row) =>
      Array.isArray(row.value)
        ? row.value.flatMap((kit) =>
            typeof kit === "object" && kit && Array.isArray((kit as { samples?: unknown }).samples)
              ? (kit as { samples: unknown[] }).samples
              : [],
          )
        : [],
    ).length;
  return {
    format: "practice-os-data-backup",
    version: 1,
    exportedAt: "2026-09-13T12:00:00.000Z",
    tables,
    media: {
      included: false,
      backingTrackFiles: tables.backingTracks.length,
      audioTakeFiles: tables.audioTakes.length,
      sampleFiles,
    },
  };
}

describe("music data backup", () => {
  test("round-trips all tables and a top-level undefined setting value", async () => {
    const store = createStore();
    await store.settings.put({ id: "music.piano-roll.pending-take-import", value: undefined });
    await store.songs.put({
      id: "song-1",
      title: "Take 1",
      score: {
        id: "song-1",
        origin: "midi",
        tempoMap: [{ atBeat: 0, bpm: 120 }],
        timeSignatures: [{ atBeat: 0, numerator: 4, denominator: 4 }],
        voices: [{ id: "onscreen", name: "On-screen", role: "melody" }],
        notes: [
          { midiNote: 60, startBeat: 0, durationBeats: 0.5, velocity: 1, voiceId: "onscreen" },
        ],
        chords: [],
        sections: [],
        markers: [],
      },
      source: { format: "musicxml", content: "<score-partwise/>" },
    });

    const prepared = await prepareMusicDataBackup(store, () => new Date("2026-09-13T12:00:00Z"));
    expect(Object.keys(prepared.backup.tables)).toHaveLength(10);
    expect(prepared.json).not.toContain('"value"');

    const parsed = parseMusicDataBackup(prepared.json);
    expect(parsed.tables.settings).toEqual([
      { id: "music.piano-roll.pending-take-import", value: undefined },
    ]);
    expect(parsed.tables.songs[0]?.source?.content).toBe("<score-partwise/>");
  });

  test("accepts legacy partial known settings and rejects malformed present fields", () => {
    expect(() =>
      parseMusicDataBackup(
        JSON.stringify(
          backup({ settings: [{ id: "music.settings", value: { audioInputLabel: "USB" } }] }),
        ),
      ),
    ).not.toThrow();

    expect(() =>
      parseMusicDataBackup(
        JSON.stringify(
          backup({ settings: [{ id: "music.settings", value: { audioInputLabel: 4 } }] }),
        ),
      ),
    ).toThrow(/music\.settings.*audioInputLabel/i);
  });

  test("allows only a top-level undefined setting value", () => {
    expect(() =>
      validateBackupObject(backup({ settings: [{ id: "cleared", value: undefined }] })),
    ).not.toThrow();
    expect(() =>
      validateBackupObject(
        backup({ settings: [{ id: "bad", value: { nested: { value: undefined } } }] }),
      ),
    ).toThrow(/JSON-safe/i);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() =>
      validateBackupObject(backup({ settings: [{ id: "cyclic", value: cyclic }] })),
    ).toThrow(/JSON-safe/i);
  });

  test("round-trips the persisted tempo ladder and rejects a malformed rung", async () => {
    const store = createStore();
    await store.settings.put({
      id: "technique.tempo-ladder.v1",
      value: { "major:C4:up:one-octave:both": 130 },
    });

    const prepared = await prepareMusicDataBackup(store, () => new Date("2026-09-13T12:00:00Z"));
    const restored = createStore();
    await restoreMusicDataBackup(restored, parseMusicDataBackup(prepared.json));

    expect((await restored.settings.get("technique.tempo-ladder.v1"))?.value).toEqual({
      "major:C4:up:one-octave:both": 130,
    });
    expect(() =>
      validateBackupObject(
        backup({ settings: [{ id: "technique.tempo-ladder.v1", value: { "major:C4": "fast" } }] }),
      ),
    ).toThrow(/tempo-ladder/i);
  });

  test("accepts the persisted 16-step Song Studio pattern", () => {
    expect(() =>
      validateBackupObject(
        backup({
          settings: [
            {
              id: "music.studio.boom-bap",
              value: { steps: 16, rows: [{ id: "kick", steps: [0, 6, 10] }] },
            },
          ],
        }),
      ),
    ).not.toThrow();
  });

  test("rejects reserved and duplicate custom tuning ids", () => {
    const custom = {
      id: "custom.drop-c",
      name: "Drop C",
      instrument: "guitar",
      openStrings: [64, 59, 55, 50, 43, 36],
      fretCount: 22,
      notationTransposition: -12,
      source: "custom",
    };
    expect(() =>
      validateBackupObject(
        backup({
          settings: [{ id: "music.custom-tunings", value: [{ ...custom, id: "guitar.standard" }] }],
        }),
      ),
    ).toThrow(/custom.*id/i);
    expect(() =>
      validateBackupObject(
        backup({ settings: [{ id: "music.custom-tunings", value: [custom, custom] }] }),
      ),
    ).toThrow(/duplicate/i);
  });

  test("rejects malformed optional scoring and score fields", () => {
    const malformedScore = backup({
      songs: [
        {
          id: "song-1",
          title: "Broken",
          score: {
            id: "song-1",
            origin: "midi",
            tempoMap: [{ atBeat: 0, bpm: 120 }],
            timeSignatures: [],
            voices: [{ id: "voice", name: "Voice", role: "melody" }],
            notes: [],
            rests: [{ startBeat: 0, durationBeats: 1, voiceId: "missing" }],
            chords: [],
            sections: [],
            markers: [],
          },
        },
      ],
    });
    expect(() => validateBackupObject(malformedScore)).toThrow(/rests.*voiceId/i);

    const malformedEvent = backup({
      scoringEvents: [
        {
          id: "event-1",
          sessionId: "session-1",
          exerciseId: "exercise-1",
          skillIds: [],
          capabilities: [],
          at: unixMs(1),
          correct: true,
          partialCredit: 1,
          difficulty: 0.5,
          metrics: [{ kind: "breath", steadiness: 1, actualCurve: [0.5, "bad" as never] }],
          target: { label: "Target", midiNotes: ["bad" as never] },
        },
      ],
    });
    expect(() => validateBackupObject(malformedEvent)).toThrow(/actualCurve|midiNotes/i);
  });

  test("rejects sample-kit assignments with invalid velocity layers", () => {
    const invalidKit = {
      id: "kit-1",
      name: "Kit",
      createdAt: 1,
      updatedAt: 1,
      samples: [
        {
          id: "sample-1",
          fileName: "kick.wav",
          displayName: "Kick",
          mimeType: "audio/wav",
          size: 10,
          binaryKey: "music.sample-kits/kit-1/sample-1.wav",
        },
      ],
      assignments: [
        {
          midiNote: 36,
          sampleId: "sample-1",
          label: "Kick",
          velocityLayers: [
            { sampleId: "missing", label: "Bad", minVelocity: 0.9, maxVelocity: 0.2 },
          ],
        },
      ],
    };
    expect(() =>
      validateBackupObject(
        backup({ settings: [{ id: "music.sample-kits", value: [invalidKit] }] }),
      ),
    ).toThrow(/velocityLayers/i);
  });

  test("rejects duplicate keys, malformed nested MIDI takes, and inconsistent media counts", () => {
    expect(() =>
      parseMusicDataBackup(
        JSON.stringify(
          backup({
            settings: [
              { id: "duplicate", value: true },
              { id: "duplicate", value: false },
            ],
          }),
        ),
      ),
    ).toThrow(/duplicate/i);

    expect(() =>
      parseMusicDataBackup(
        JSON.stringify(
          backup({
            settings: [
              {
                id: "music.recording.midi-takes",
                value: [
                  {
                    id: "take-1",
                    name: "Take 1",
                    source: "onscreen",
                    durationMs: 1,
                    notes: [{ midi: 200, atMs: 0, velocity: 1 }],
                  },
                ],
              },
            ],
          }),
        ),
      ),
    ).toThrow(/midi/i);

    const invalid = backup();
    invalid.media.backingTrackFiles = 1;
    expect(() => parseMusicDataBackup(JSON.stringify(invalid))).toThrow(/media.*count/i);
  });

  test("atomically replaces all ten tables and makes incoming settings authoritative", async () => {
    const store = createStore();
    await store.settings.put({ id: "music.settings", value: { audioInputLabel: "Old" } });
    await store.skills.put({ id: "old", name: "Old", capability: Capability.Pitch, version: 1 });
    const incoming = backup({
      settings: [{ id: "music.settings", value: { audioInputLabel: "Restored" } }],
      skills: [{ id: "new", name: "New", capability: Capability.Pitch, version: 1 }],
    });

    await restoreMusicDataBackup(store, incoming, {
      getBinary: async () => undefined,
      withMutationLock: async (operation) => operation(),
    });

    await expect(store.settings.all()).resolves.toEqual(incoming.tables.settings);
    await expect(store.skills.all()).resolves.toEqual(incoming.tables.skills);
  });

  test("rejects a restore that omits current media metadata without changing data", async () => {
    const store = createStore();
    const current = {
      id: "backing-1",
      name: "Current.wav",
      mimeType: "audio/wav",
      size: 10,
      durationMs: 100,
      createdAt: unixMs(1),
    };
    await store.backingTracks.put(current);
    await store.settings.put({ id: "keep", value: true });

    await expect(
      restoreMusicDataBackup(store, backup(), {
        getBinary: async () => undefined,
        withMutationLock: async (operation) => operation(),
      }),
    ).rejects.toThrow(/current local media/i);
    await expect(store.backingTracks.all()).resolves.toEqual([current]);
    await expect(store.settings.get("keep")).resolves.toEqual({ id: "keep", value: true });
  });

  test("rejects an exact binary-key collision for new imported media", async () => {
    const store = createStore();
    const incoming = backup({
      backingTracks: [
        {
          id: "backing-1",
          name: "Incoming.wav",
          mimeType: "audio/wav",
          size: 10,
          durationMs: 100,
          createdAt: unixMs(1),
        },
      ],
    });
    const getBinary = vi.fn(async () => new Blob(["existing"]));

    await expect(
      restoreMusicDataBackup(store, incoming, {
        getBinary,
        withMutationLock: async (operation) => operation(),
      }),
    ).rejects.toThrow(/binary key.*already exists/i);
    expect(getBinary).toHaveBeenCalledWith("music-backing-backing-1");
    await expect(store.backingTracks.all()).resolves.toEqual([]);
  });

  test("rechecks current media metadata inside the write transaction", async () => {
    const store = createStore();
    const incoming = backup({
      backingTracks: [
        {
          id: "incoming",
          name: "Incoming.wav",
          mimeType: "audio/wav",
          size: 10,
          durationMs: 100,
          createdAt: unixMs(1),
        },
      ],
    });
    let changed = false;

    await expect(
      restoreMusicDataBackup(store, incoming, {
        getBinary: async () => {
          if (!changed) {
            changed = true;
            await store.audioTakes.put({
              id: "late-take",
              name: "Late.webm",
              mimeType: "audio/webm",
              size: 5,
              durationMs: 50,
              createdAt: unixMs(2),
              instrument: "piano",
              backingOffsetMs: 0,
            });
          }
          return undefined;
        },
        withMutationLock: async (operation) => operation(),
      }),
    ).rejects.toThrow(/current local media/i);
    await expect(store.audioTakes.get("late-take")).resolves.toBeDefined();
    await expect(store.backingTracks.all()).resolves.toEqual([]);
  });

  test("rolls back every table when a bulk write fails", async () => {
    const store = createStore();
    await store.settings.put({ id: "music.settings", value: { audioInputLabel: "Original" } });
    await store.skills.put({ id: "old", name: "Old", capability: Capability.Pitch, version: 1 });
    const incoming = backup({
      settings: [{ id: "music.settings", value: { audioInputLabel: "Incoming" } }],
      skills: [{ id: "new", name: "New", capability: Capability.Pitch, version: 1 }],
    });
    vi.spyOn(store.database.table("skills"), "bulkAdd").mockRejectedValueOnce(
      new Error("Injected write failure"),
    );

    await expect(
      restoreMusicDataBackup(store, incoming, {
        getBinary: async () => undefined,
        withMutationLock: async (operation) => operation(),
      }),
    ).rejects.toThrow("Injected write failure");
    await expect(store.settings.all()).resolves.toEqual([
      { id: "music.settings", value: { audioInputLabel: "Original" } },
    ]);
    await expect(store.skills.all()).resolves.toEqual([
      { id: "old", name: "Old", capability: Capability.Pitch, version: 1 },
    ]);
  });

  test("snapshots and revalidates public restore input before mutation", async () => {
    const store = createStore();
    const input = backup({ settings: [{ id: "safe", value: true }] });
    let mutationRan = false;
    await restoreMusicDataBackup(store, input, {
      getBinary: async () => undefined,
      withMutationLock: async (operation) => {
        mutationRan = true;
        input.tables.settings[0]!.value = { invalid: undefined };
        return operation();
      },
    });
    expect(mutationRan).toBe(true);
    await expect(store.settings.get("safe")).resolves.toEqual({ id: "safe", value: true });
  });

  test("exports version 2 with the take gain and note fields", async () => {
    const store = createStore();
    await store.audioTakes.put({
      id: "take-1",
      name: "Take 1.webm",
      mimeType: "audio/webm",
      size: 4,
      durationMs: 1_000,
      createdAt: unixMs(5),
      instrument: "piano",
      backingOffsetMs: 0,
      gainDb: 6,
      note: "watch the left hand",
    });

    const prepared = await prepareMusicDataBackup(store);
    expect(prepared.backup.version).toBe(MUSIC_DATA_BACKUP_VERSION);
    expect(prepared.backup.version).toBe(2);
    expect(prepared.backup.tables.audioTakes[0]).toMatchObject({
      gainDb: 6,
      note: "watch the left hand",
    });
  });

  test("restores a version 1 backup that predates the take gain field", async () => {
    const store = createStore();
    const incoming = backup({
      audioTakes: [
        {
          id: "take-1",
          name: "Take 1.webm",
          mimeType: "audio/webm",
          size: 4,
          durationMs: 1_000,
          createdAt: unixMs(5),
          instrument: "piano",
          backingOffsetMs: 0,
        },
      ],
    });
    expect(incoming.version).toBe(1);

    await restoreMusicDataBackup(store, incoming, {
      getBinary: async () => undefined,
      withMutationLock: async (operation) => operation(),
    });

    const restored = await store.audioTakes.get("take-1");
    expect(restored).not.toHaveProperty("gainDb");
    expect(restored?.name).toBe("Take 1.webm");
  });

  test("rejects an unsupported version and an out-of-range take gain", () => {
    expect(() => validateBackupObject({ ...backup(), version: 3 })).toThrow(/version/i);
    const withGain = backup({
      audioTakes: [
        {
          id: "take-1",
          name: "Take 1.webm",
          mimeType: "audio/webm",
          size: 4,
          durationMs: 1_000,
          createdAt: unixMs(5),
          instrument: "piano",
          backingOffsetMs: 0,
          gainDb: 24,
        },
      ],
    });
    expect(() => validateBackupObject(withGain)).toThrow(/gainDb/i);
  });
});

function validateBackupObject(value: unknown): MusicDataBackupV1 {
  return validateMusicDataBackup(value);
}

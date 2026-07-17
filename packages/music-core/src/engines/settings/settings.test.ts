import { describe, expect, test } from "vitest";

import type { SettingsRecord } from "@repo/music-core/engines/store";

import {
  DEFAULT_MUSIC_SETTINGS,
  MusicSettingsStore,
  PLAYBACK_SOUND_IDS,
  updateTempoByVariant,
  lookupTempoByVariant,
  pruneInvalidTempoKeys,
  v1TempoKey,
} from "./index";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function fakeRepo() {
  const map = new Map<string, SettingsRecord>();
  return {
    get: async (id: string) => map.get(id),
    put: async (record: SettingsRecord) => {
      map.set(record.id, record);
    },
  };
}

describe("MusicSettingsStore", () => {
  test("keeps playback sound choices closed and useful", () => {
    expect(PLAYBACK_SOUND_IDS).toEqual([
      "salamander-piano",
      "warm-synth",
      "synth",
      "e-piano",
      "square",
      "saw",
    ]);
  });

  test("returns defaults when nothing is stored", async () => {
    const store = new MusicSettingsStore(fakeRepo());
    expect(await store.load()).toEqual(DEFAULT_MUSIC_SETTINGS);
  });

  test("persists and reloads across instances", async () => {
    const repo = fakeRepo();
    const store = new MusicSettingsStore(repo);
    await store.load();
    await store.update({ reduceMotion: true, metronomeEnabled: false, countInBars: 2 });

    const reloaded = new MusicSettingsStore(repo);
    const settings = await reloaded.load();
    expect(settings.reduceMotion).toBe(true);
    expect(settings.metronomeEnabled).toBe(false);
    expect(settings.countInBars).toBe(2);
    expect(settings.instrumentColorCoding).toBe(true);
  });

  test("falls back to defaults on a garbage stored value", async () => {
    const repo = fakeRepo();
    await repo.put({ id: "music.settings", value: "garbage" });
    const store = new MusicSettingsStore(repo);
    expect(await store.load()).toEqual(DEFAULT_MUSIC_SETTINGS);
  });

  test("works without a repository (in-memory only)", async () => {
    const store = new MusicSettingsStore();
    await store.load();
    const next = await store.update({ instrumentColorCoding: false });
    expect(next.instrumentColorCoding).toBe(false);
    expect(store.get().instrumentColorCoding).toBe(false);
  });

  test("clamps level fields to 0–1", async () => {
    const repo = fakeRepo();
    const store = new MusicSettingsStore(repo);
    await store.load();
    await store.update({ playbackLevel: 2.5 });

    expect(store.get().playbackLevel).toBe(1);
    await store.update({ playbackLevel: -0.5 });
    expect(store.get().playbackLevel).toBe(0);
  });

  test("restricts countInBars to 0/1/2", async () => {
    const repo = fakeRepo();
    await repo.put({
      id: "music.settings",
      value: { ...DEFAULT_MUSIC_SETTINGS, countInBars: 5 },
    });
    const store = new MusicSettingsStore(repo);
    const settings = await store.load();
    expect(settings.countInBars).toBe(1);
  });

  test("validates activeInstrument against known values", async () => {
    const repo = fakeRepo();
    await repo.put({
      id: "music.settings",
      value: { ...DEFAULT_MUSIC_SETTINGS, activeInstrument: "invalid" },
    });
    const store = new MusicSettingsStore(repo);
    const settings = await store.load();
    expect(settings.activeInstrument).toBe("piano");
  });

  test("normalizes legacy defaultSoundSet to preferredPlaybackSound", async () => {
    const repo = fakeRepo();
    await repo.put({
      id: "music.settings",
      value: { ...DEFAULT_MUSIC_SETTINGS, defaultSoundSet: "Salamander Piano" },
    });
    const store = new MusicSettingsStore(repo);
    const settings = await store.load();
    expect(settings.preferredPlaybackSound).toBe("salamander-piano");
  });

  test("legacy defaultSoundSet does not override explicit preferredPlaybackSound", async () => {
    const repo = fakeRepo();
    await repo.put({
      id: "music.settings",
      value: {
        ...DEFAULT_MUSIC_SETTINGS,
        defaultSoundSet: "Salamander Piano",
        preferredPlaybackSound: "warm-synth",
      },
    });
    const store = new MusicSettingsStore(repo);
    const settings = await store.load();
    expect(settings.preferredPlaybackSound).toBe("warm-synth");
  });

  test("unknown legacy defaultSoundSet falls back to default", async () => {
    const repo = fakeRepo();
    await repo.put({
      id: "music.settings",
      value: { ...DEFAULT_MUSIC_SETTINGS, defaultSoundSet: "Unknown Pack" },
    });
    const store = new MusicSettingsStore(repo);
    const settings = await store.load();
    expect(settings.preferredPlaybackSound).toBe(DEFAULT_MUSIC_SETTINGS.preferredPlaybackSound);
  });

  test("accepts existing synth presets and rejects unknown playback sounds", async () => {
    const repo = fakeRepo();
    await repo.put({
      id: "music.settings",
      value: { ...DEFAULT_MUSIC_SETTINGS, preferredPlaybackSound: "e-piano" },
    });
    expect((await new MusicSettingsStore(repo).load()).preferredPlaybackSound).toBe("e-piano");

    await repo.put({
      id: "music.settings",
      value: { ...DEFAULT_MUSIC_SETTINGS, preferredPlaybackSound: "orchestra" },
    });
    expect((await new MusicSettingsStore(repo).load()).preferredPlaybackSound).toBe(
      DEFAULT_MUSIC_SETTINGS.preferredPlaybackSound,
    );
  });

  test("restores audioInputLabel from storage", async () => {
    const repo = fakeRepo();
    await repo.put({
      id: "music.settings",
      value: { ...DEFAULT_MUSIC_SETTINGS, audioInputLabel: "My Mic" },
    });
    const store = new MusicSettingsStore(repo);
    const settings = await store.load();
    expect(settings.audioInputLabel).toBe("My Mic");
  });

  test("audioInputLabel defaults to fallback when missing", async () => {
    const repo = fakeRepo();
    const store = new MusicSettingsStore(repo);
    await store.load();
    const settings = store.get();
    expect(settings.audioInputLabel).toBe(DEFAULT_MUSIC_SETTINGS.audioInputLabel);
  });
});

describe("early-setter patches", () => {
  test("queues pre-hydration patches and merges after load", async () => {
    const repo = fakeRepo();
    const store = new MusicSettingsStore(repo);
    await store.update({ metronomeEnabled: false, countInBars: 2 });
    expect(store.loaded).toBe(false);

    const settings = await store.load();
    expect(settings.metronomeEnabled).toBe(false);
    expect(settings.countInBars).toBe(2);
    expect(settings.instrumentColorCoding).toBe(true);
  });

  test("hydrated value does not overwrite a newer in-session patch", async () => {
    const repo = fakeRepo();
    await repo.put({
      id: "music.settings",
      value: { ...DEFAULT_MUSIC_SETTINGS, metronomeEnabled: false },
    });
    const store = new MusicSettingsStore(repo);
    await store.update({ metronomeEnabled: true, countInBars: 2 });
    const settings = await store.load();
    expect(settings.metronomeEnabled).toBe(true);
    expect(settings.countInBars).toBe(2);
  });

  test("multiple pre-hydration patches merge correctly", async () => {
    const repo = fakeRepo();
    const store = new MusicSettingsStore(repo);
    await store.update({ metronomeEnabled: false });
    await store.update({ countInBars: 2 });
    await store.update({ playbackLevel: 0.5 });
    const settings = await store.load();
    expect(settings.metronomeEnabled).toBe(false);
    expect(settings.countInBars).toBe(2);
    expect(settings.playbackLevel).toBe(0.5);
  });
});

describe("tempo by variant", () => {
  test("v1TempoKey adds v1: prefix", () => {
    expect(v1TempoKey("scales:guitar:dorian")).toBe("v1:scales:guitar:dorian");
  });

  test("v1TempoKey is idempotent when already prefixed", () => {
    expect(v1TempoKey("v1:scales:guitar:dorian")).toBe("v1:scales:guitar:dorian");
  });

  test("updateTempoByVariant sets and clamps BPM", () => {
    const map = updateTempoByVariant({}, "scales:piano:major", 120);
    expect(map["v1:scales:piano:major"]).toBe(120);
  });

  test("updateTempoByVariant clamps below minimum", () => {
    const map = updateTempoByVariant({}, "test", 5);
    expect(map["v1:test"]).toBe(20);
  });

  test("updateTempoByVariant clamps above maximum", () => {
    const map = updateTempoByVariant({}, "test", 500);
    expect(map["v1:test"]).toBe(300);
  });

  test("updateTempoByVariant deletes then reinserts for recency", () => {
    const a = updateTempoByVariant({}, "a", 60);
    const b = updateTempoByVariant(a, "b", 80);
    const c = updateTempoByVariant(b, "a", 70);
    const keys = Object.keys(c);
    expect(keys).toEqual(["v1:b", "v1:a"]);
    expect(c["v1:a"]).toBe(70);
  });

  test("lookupTempoByVariant retrieves stored BPM", () => {
    const map = { "v1:test": 120 };
    expect(lookupTempoByVariant(map, "test")).toBe(120);
  });

  test("lookupTempoByVariant returns undefined for missing key", () => {
    expect(lookupTempoByVariant({}, "missing")).toBeUndefined();
  });

  test("evicts oldest entries when exceeding 200", () => {
    let map: Record<string, number> = {};
    for (let i = 0; i < 205; i++) {
      map = updateTempoByVariant(map, `key-${i}`, 100);
    }
    const keys = Object.keys(map);
    expect(keys.length).toBe(200);
    expect(keys[0]).toBe("v1:key-5");
    expect(keys[199]).toBe("v1:key-204");
  });

  test("pruneInvalidTempoKeys removes non-v1 and out-of-range entries", () => {
    const map = {
      "v1:valid": 120,
      "v1:low": 5,
      "legacy:key": 100,
      "v1:high": 400,
      "v1:nan": NaN,
    };
    const pruned = pruneInvalidTempoKeys(map);
    expect(pruned).toEqual({ "v1:valid": 120 });
  });

  test("pruneInvalidTempoKeys works on empty map", () => {
    expect(pruneInvalidTempoKeys({})).toEqual({});
  });
});

describe("persistence failure", () => {
  test("keeps hydration ready after an early queued write fails and serializes recovery", async () => {
    const hydration = deferred<SettingsRecord | undefined>();
    let persisted: SettingsRecord | undefined;
    let rejectNext = true;
    const repo = {
      get: async () => hydration.promise,
      put: async (record: SettingsRecord) => {
        if (rejectNext) {
          rejectNext = false;
          throw new Error("Storage full");
        }
        persisted = record;
      },
    };
    const store = new MusicSettingsStore(repo);
    const loading = store.load();

    await store.update({ playbackLevel: 0.35, muted: true });
    hydration.resolve({
      id: "music.settings",
      value: { ...DEFAULT_MUSIC_SETTINGS, playbackLevel: 0.9 },
    });

    await expect(loading).rejects.toThrow("Storage full");
    await expect(store.ready).resolves.toBeUndefined();
    expect(store.get()).toMatchObject({ playbackLevel: 0.35, muted: true });

    await expect(store.update({ masterLevel: 0.6 })).resolves.toMatchObject({
      playbackLevel: 0.35,
      masterLevel: 0.6,
      muted: true,
    });
    expect(persisted?.value).toMatchObject({
      playbackLevel: 0.35,
      masterLevel: 0.6,
      muted: true,
    });
  });

  test("update throws on persistence error", async () => {
    const repo = fakeRepo();
    repo.put = async () => {
      throw new Error("Storage full");
    };
    const store = new MusicSettingsStore(repo);
    await store.load();
    await expect(store.update({ metronomeEnabled: false })).rejects.toThrow("Storage full");
  });

  test("serializes immutable snapshots so the newest patch is persisted last", async () => {
    let persisted: SettingsRecord | undefined;
    const writes: Array<{
      record: SettingsRecord;
      gate: ReturnType<typeof deferred<void>>;
    }> = [];
    const repo = {
      get: async () => persisted,
      put: async (record: SettingsRecord) => {
        const gate = deferred<void>();
        writes.push({ record, gate });
        await gate.promise;
        persisted = record;
      },
    };
    const store = new MusicSettingsStore(repo);
    await store.load();

    const older = store.update({ playbackLevel: 0.1 });
    const newer = store.update({ playbackLevel: 0.9 });

    await Promise.resolve();
    expect(store.get().playbackLevel).toBe(0.9);
    expect(writes).toHaveLength(1);
    expect(writes[0]!.record.value).toMatchObject({ playbackLevel: 0.1 });

    writes[0]!.gate.resolve();
    await older;
    await Promise.resolve();
    expect(writes).toHaveLength(2);
    expect(writes[1]!.record.value).toMatchObject({ playbackLevel: 0.9 });

    writes[1]!.gate.resolve();
    await newer;
    expect((await new MusicSettingsStore(repo).load()).playbackLevel).toBe(0.9);
  });

  test("keeps session state after rejection and allows a later write to succeed", async () => {
    let persisted: SettingsRecord | undefined;
    let rejectNext = true;
    const repo = {
      get: async () => persisted,
      put: async (record: SettingsRecord) => {
        if (rejectNext) {
          rejectNext = false;
          throw new Error("Storage full");
        }
        persisted = record;
      },
    };
    const store = new MusicSettingsStore(repo);
    await store.load();

    await expect(store.update({ muted: true })).rejects.toThrow("Storage full");
    expect(store.get().muted).toBe(true);

    await expect(store.update({ playbackLevel: 0.45 })).resolves.toMatchObject({
      muted: true,
      playbackLevel: 0.45,
    });
    await expect(new MusicSettingsStore(repo).load()).resolves.toMatchObject({
      muted: true,
      playbackLevel: 0.45,
    });
  });
});

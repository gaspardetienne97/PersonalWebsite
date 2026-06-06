import { describe, expect, test } from "vitest";

import type { SettingsRecord } from "@repo/music-core/engines/store";

import { DEFAULT_MUSIC_SETTINGS, MusicSettingsStore } from "./index";

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
  test("returns defaults when nothing is stored", async () => {
    const store = new MusicSettingsStore(fakeRepo());
    expect(await store.load()).toEqual(DEFAULT_MUSIC_SETTINGS);
  });

  test("persists updates merged with defaults across instances", async () => {
    const repo = fakeRepo();
    const store = new MusicSettingsStore(repo);
    await store.load();
    await store.update({ reduceMotion: true, midiOffsetMs: 12 });

    const reloaded = new MusicSettingsStore(repo);
    const settings = await reloaded.load();
    expect(settings.reduceMotion).toBe(true);
    expect(settings.midiOffsetMs).toBe(12);
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
});

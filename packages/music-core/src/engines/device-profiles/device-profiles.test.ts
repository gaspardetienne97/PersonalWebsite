import { describe, expect, test } from "vitest";

import type { SettingsRecord } from "@repo/music-core/engines/store";

import { DeviceProfileStore, defaultSurfaceForInstrument } from "./index";

function fakeRepo() {
  const map = new Map<string, SettingsRecord>();
  return {
    get: async (id: string) => map.get(id),
    put: async (record: SettingsRecord) => {
      map.set(record.id, record);
    },
  };
}

describe("DeviceProfileStore", () => {
  test("starts empty", async () => {
    const store = new DeviceProfileStore(fakeRepo());
    const state = await store.load();
    expect(state.profiles).toEqual([]);
    expect(state.preferences).toEqual({});
  });

  test("upserts a profile and persists across instances", async () => {
    const repo = fakeRepo();
    const store = new DeviceProfileStore(repo);
    await store.load();
    await store.saveProfile({ id: "dev-1", alias: "Jazz Piano", instrument: "piano", channel: 1 });
    await store.saveProfile({ id: "dev-1", alias: "Jazz Piano (MIDI)", instrument: "piano" });

    const reloaded = new DeviceProfileStore(repo);
    const state = await reloaded.load();
    expect(state.profiles).toHaveLength(1);
    expect(state.profiles[0]).toMatchObject({
      id: "dev-1",
      alias: "Jazz Piano (MIDI)",
      instrument: "piano",
    });
  });

  test("removes a profile", async () => {
    const repo = fakeRepo();
    const store = new DeviceProfileStore(repo);
    await store.load();
    await store.saveProfile({ id: "a", alias: "A" });
    await store.saveProfile({ id: "b", alias: "B" });
    await store.removeProfile("a");
    expect((await store.load()).profiles.map((profile) => profile.id)).toEqual(["b"]);
  });

  test("persists per-instrument source preference", async () => {
    const repo = fakeRepo();
    const store = new DeviceProfileStore(repo);
    await store.load();
    await store.setPreference("guitar", "audio");

    const reloaded = new DeviceProfileStore(repo);
    await reloaded.load();
    expect(reloaded.preference("guitar")).toBe("audio");
    expect(reloaded.preference("piano")).toBeUndefined();
  });

  test("persists per-instrument on-screen surface", async () => {
    const repo = fakeRepo();
    const store = new DeviceProfileStore(repo);
    await store.load();
    await store.setSurface("guitar", "mpc");

    const reloaded = new DeviceProfileStore(repo);
    await reloaded.load();
    expect(reloaded.surface("guitar")).toBe("mpc");
  });

  test("surface falls back to the instrument default when unset", async () => {
    const store = new DeviceProfileStore(fakeRepo());
    await store.load();
    expect(store.surface("guitar")).toBe("guitar");
    expect(store.surface("ukulele")).toBe("ukulele");
    expect(store.surface("mpc")).toBe("mpc");
    expect(store.surface("piano")).toBe("keyboard");
    expect(store.surface("voice")).toBe("keyboard");
    expect(store.surface("aerophone")).toBe("keyboard");
  });

  test("defaultSurfaceForInstrument maps each instrument to a surface", () => {
    expect(defaultSurfaceForInstrument("guitar")).toBe("guitar");
    expect(defaultSurfaceForInstrument("piano")).toBe("keyboard");
  });

  test("ignores an unknown persisted surface and uses the default", async () => {
    const repo = fakeRepo();
    await repo.put({
      id: "music.device-profiles",
      value: { profiles: [], preferences: {}, surfaces: { guitar: "theremin" } },
    });
    const store = new DeviceProfileStore(repo);
    await store.load();
    expect(store.surface("guitar")).toBe("guitar");
  });

  test("falls back to empty state on garbage", async () => {
    const repo = fakeRepo();
    await repo.put({ id: "music.device-profiles", value: 42 });
    const store = new DeviceProfileStore(repo);
    const state = await store.load();
    expect(state.profiles).toEqual([]);
    expect(state.preferences).toEqual({});
  });
});

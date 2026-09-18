import { describe, expect, test } from "vitest";

import type { SettingsRecord } from "@repo/music-core/engines/store";

import {
  DeviceProfileStore,
  MPC_PAD_NOTE_PRESETS,
  applyDeviceProfile,
  canonicalPadNote,
  defaultSurfaceForInstrument,
  padNotePresetId,
} from "./index";

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

describe("pad note maps", () => {
  test("ignored and a learned pad map survive a reload", async () => {
    const repo = fakeRepo();
    const store = new DeviceProfileStore(repo);
    await store.load();
    const classic = MPC_PAD_NOTE_PRESETS.find((preset) => preset.id === "classic")!;
    await store.saveProfile({
      id: "mpc-1",
      instrument: "mpc",
      ignored: true,
      padNotes: [...classic.notes],
    });

    const state = await new DeviceProfileStore(repo).load();
    expect(state.profiles[0]).toMatchObject({
      id: "mpc-1",
      ignored: true,
      padNotes: classic.notes,
    });
    expect(padNotePresetId(state.profiles[0]!.padNotes)).toBe("classic");
  });

  test("an MPC controller link survives a reload and only as the literal true", async () => {
    const repo = fakeRepo();
    const store = new DeviceProfileStore(repo);
    await store.load();
    await store.saveProfile({ id: "mpc-out", controllerLink: true });
    await store.saveProfile({ id: "other", controllerLink: "yes" as unknown as true });
    const state = await new DeviceProfileStore(repo).load();
    expect(state.profiles.find((profile) => profile.id === "mpc-out")).toEqual({
      id: "mpc-out",
      controllerLink: true,
    });
    expect(state.profiles.find((profile) => profile.id === "other")).toEqual({ id: "other" });
  });

  test("keeps a per-device input offset and drops an unusable one", async () => {
    const store = new DeviceProfileStore(fakeRepo());
    await store.saveProfile({ id: "mpc", inputOffsetMs: 22.4 });
    await store.saveProfile({ id: "keys", inputOffsetMs: Number.NaN });
    await store.saveProfile({ id: "wild", inputOffsetMs: 9_000 });

    expect(store.profile("mpc")).toEqual({ id: "mpc", inputOffsetMs: 22 });
    expect(store.profile("keys")).toEqual({ id: "keys" });
    expect(store.profile("wild")).toEqual({ id: "wild" });
  });

  test("a zero per-device offset survives a reload", async () => {
    const repo = fakeRepo();
    await new DeviceProfileStore(repo).saveProfile({ id: "mpc", inputOffsetMs: 0 });

    const state = await new DeviceProfileStore(repo).load();

    expect(state.profiles[0]).toEqual({ id: "mpc", inputOffsetMs: 0 });
  });

  test("a malformed pad map is dropped rather than half-applied", async () => {
    const repo = fakeRepo();
    await repo.put({
      id: "music.device-profiles",
      value: { profiles: [{ id: "x", padNotes: [36, 36, 38] }], preferences: {}, surfaces: {} },
    } as SettingsRecord);
    const state = await new DeviceProfileStore(repo).load();
    expect(state.profiles[0]).toEqual({ id: "x" });
  });

  test("hardware notes translate to the canonical bank-A layout", () => {
    const classic = MPC_PAD_NOTE_PRESETS.find((preset) => preset.id === "classic")!.notes;
    // Pad A01 sends 37 on the Classic map and grades as the app's pad 36.
    expect(canonicalPadNote(classic, 37)).toBe(36);
    // Pad A06 sends 38 and grades as pad 41 (row 2, column 2).
    expect(canonicalPadNote(classic, 38)).toBe(41);
    // Off-map notes and the default map pass through.
    expect(canonicalPadNote(classic, 60)).toBe(60);
    expect(canonicalPadNote(undefined, 38)).toBe(38);
    expect(padNotePresetId(undefined)).toBe("chromatic-36");
    expect(padNotePresetId([1, ...classic.slice(1)])).toBe("custom");
  });
});

describe("applyDeviceProfile", () => {
  const classic = MPC_PAD_NOTE_PRESETS.find((preset) => preset.id === "classic")!.notes;
  const noteOn = {
    type: "noteOn" as const,
    midiNote: 38,
    deviceId: "private",
    instrument: undefined,
  };

  test("the assigned instrument wins over port-name detection", () => {
    const tagged = { ...noteOn, instrument: "piano" as const };
    expect(applyDeviceProfile(tagged, { id: "private", instrument: "mpc" }).instrument).toBe("mpc");
    // No assignment: whatever the port name said stands.
    expect(applyDeviceProfile(tagged, { id: "private" }).instrument).toBe("piano");
  });

  test("a hardware pad note becomes the canonical bank-A note", () => {
    const applied = applyDeviceProfile(noteOn, {
      id: "private",
      instrument: "mpc",
      padNotes: [...classic],
    });
    // Classic A06 sends 38; the app grades it as pad 41.
    expect(applied.midiNote).toBe(41);
    expect(applied.instrument).toBe("mpc");
  });

  test("unknown devices and notes off the map pass through untouched", () => {
    expect(applyDeviceProfile(noteOn, undefined)).toBe(noteOn);
    const cc = { type: "cc" as const, controller: 1, deviceId: "private" };
    expect(applyDeviceProfile(cc, { id: "private", padNotes: [...classic] })).toBe(cc);
    expect(
      applyDeviceProfile({ ...noteOn, midiNote: 60 }, { id: "private", padNotes: [...classic] })
        .midiNote,
    ).toBe(60);
  });
});

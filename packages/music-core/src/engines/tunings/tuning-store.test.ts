import { describe, expect, test } from "vitest";

import type { SettingsRecord } from "@repo/music-core/engines/store";

import type { TuningProfile } from "./index";
import { CustomTuningStore, type TuningSettingsRepository } from "./tuning-store";

const customGuitar: TuningProfile = {
  id: "custom.guitar.open-d",
  name: "Open D",
  instrument: "guitar",
  openStrings: [64, 61, 57, 52, 45, 38],
  fretCount: 22,
  notationTransposition: -12,
  source: "custom",
};

describe("music-core/tunings/store", () => {
  test("saves, lists, updates, and deletes custom profiles", async () => {
    const repository = fakeSettingsRepository();
    const store = new CustomTuningStore(repository);

    await store.save(customGuitar);
    expect(await store.list("guitar")).toContainEqual(customGuitar);

    await store.save({ ...customGuitar, name: "Open D Studio" });
    expect(await store.list("guitar")).toEqual([{ ...customGuitar, name: "Open D Studio" }]);

    await store.delete(customGuitar.id);
    expect(await store.list("guitar")).toEqual([]);
  });

  test("keeps saved instruments separated", async () => {
    const store = new CustomTuningStore(fakeSettingsRepository());
    await store.save(customGuitar);
    await store.save({
      id: "custom.ukulele.d-tuning",
      name: "D Tuning",
      instrument: "ukulele",
      openStrings: [71, 66, 62, 69],
      fretCount: 15,
      notationTransposition: 0,
      source: "custom",
    });

    expect(await store.list("guitar")).toHaveLength(1);
    expect(await store.list("ukulele")).toHaveLength(1);
  });

  test("rejects invalid or curated profiles", async () => {
    const store = new CustomTuningStore(fakeSettingsRepository());

    await expect(store.save({ ...customGuitar, openStrings: [40, 45] })).rejects.toThrow(
      "Guitar tunings need exactly 6 valid MIDI notes.",
    );
    await expect(store.delete("guitar.standard")).rejects.toThrow(
      "Curated tunings cannot be deleted",
    );
  });
});

function fakeSettingsRepository(): TuningSettingsRepository {
  const records = new Map<string, SettingsRecord>();
  return {
    async get(id) {
      return records.get(id);
    },
    async put(record) {
      records.set(record.id, structuredClone(record));
    },
  };
}

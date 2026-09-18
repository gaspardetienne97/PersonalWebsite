import { afterEach, describe, expect, test } from "vitest";

import {
  PracticeDatabase,
  PracticeStore,
  type SettingsRecord,
} from "@repo/music-core/engines/store";

import { scaleLadderVariantKey, TEMPO_LADDER_BASE_BPM, TempoLadder } from "./tempo-ladder";

const databases: PracticeDatabase[] = [];

afterEach(async () => {
  await Promise.all(databases.map((database) => database.delete()));
  databases.length = 0;
});

function openStore(name: string): PracticeStore {
  const database = new PracticeDatabase(name);
  databases.push(database);
  return new PracticeStore(database);
}

describe("scaleLadderVariantKey", () => {
  test("keys a rung by scale, tonic, motion, span and hands", () => {
    expect(
      scaleLadderVariantKey({
        scale: "major",
        tonic: "C4",
        motion: "up",
        span: "one-octave",
        hands: "both",
      }),
    ).toBe("major:C4:up:one-octave:both");
  });
});

describe("TempoLadder", () => {
  test("starts an unknown variant at the base tempo", async () => {
    const ladder = new TempoLadder();
    expect(await ladder.readLadder("major:C4:up:one-octave:right")).toBe(TEMPO_LADDER_BASE_BPM);
  });

  test("survives a store reopen, per variant", async () => {
    const name = `tempo-ladder-${crypto.randomUUID()}`;
    const written = new TempoLadder(openStore(name).settings);
    await written.writeLadder("major:C4:up:one-octave:both", 130);

    const reopened = new TempoLadder(openStore(name).settings);
    expect(await reopened.readLadder("major:C4:up:one-octave:both")).toBe(130);
    // A different variant is a different rung and starts at the base tempo.
    expect(await reopened.readLadder("major:C4:up:one-octave:right")).toBe(TEMPO_LADDER_BASE_BPM);
    expect(await reopened.readLadder("blues:Eb4:up:one-octave:both")).toBe(TEMPO_LADDER_BASE_BPM);
  });

  test("never lowers a saved rung", async () => {
    const name = `tempo-ladder-${crypto.randomUUID()}`;
    const ladder = new TempoLadder(openStore(name).settings);
    await ladder.writeLadder("major:C4:up:one-octave:right", 140);
    await ladder.writeLadder("major:C4:up:one-octave:right", 110);

    expect(await ladder.readLadder("major:C4:up:one-octave:right")).toBe(140);
    expect(
      await new TempoLadder(openStore(name).settings).readLadder("major:C4:up:one-octave:right"),
    ).toBe(140);
  });

  test("falls back to the base rungs when the settings read fails, and retries later", async () => {
    let fail = true;
    const rows = new Map<string, SettingsRecord>([
      ["technique.tempo-ladder.v1", { id: "technique.tempo-ladder.v1", value: { "a:b": 150 } }],
    ]);
    const ladder = new TempoLadder({
      get: async (id: string) => {
        if (fail) throw new Error("Settings are unavailable.");
        return rows.get(id);
      },
      put: async (record: SettingsRecord) => {
        rows.set(record.id, record);
      },
    });

    await expect(ladder.readLadder("a:b")).resolves.toBe(TEMPO_LADDER_BASE_BPM);
    // The failure is not cached: once the store recovers the rung reads correctly.
    fail = false;
    await expect(ladder.readLadder("a:b")).resolves.toBe(150);
  });

  test("merges with the stored row so a second writer cannot roll a rung back", async () => {
    const name = `tempo-ladder-${crypto.randomUUID()}`;
    const first = new TempoLadder(openStore(name).settings);
    const second = new TempoLadder(openStore(name).settings);
    // Both load the same empty row before either writes.
    await first.readLadder("x");
    await second.readLadder("y");

    await first.writeLadder("x", 110);
    await second.writeLadder("y", 120);

    const reopened = new TempoLadder(openStore(name).settings);
    expect(await reopened.readLadder("x")).toBe(110);
    expect(await reopened.readLadder("y")).toBe(120);
  });

  test("falls back to a caller's own base tempo for an unknown variant", async () => {
    const ladder = new TempoLadder();
    expect(await ladder.readLadder("major:C4:up:one-octave:right", 130)).toBe(130);
  });

  test("ignores a corrupt stored value instead of throwing", async () => {
    const name = `tempo-ladder-${crypto.randomUUID()}`;
    const store = openStore(name);
    await store.settings.put({ id: "technique.tempo-ladder.v1", value: "nonsense" });

    expect(await new TempoLadder(store.settings).readLadder("major:C4:up:one-octave:right")).toBe(
      TEMPO_LADDER_BASE_BPM,
    );
  });
});

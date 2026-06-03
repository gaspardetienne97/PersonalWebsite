import { afterEach, describe, expect, test } from "vitest";

import { initialMastery, unixMs, type PracticeSession } from "@repo/music-core/domain";

import {
  PracticeDatabase,
  PracticeStore,
  getBinary,
  listBinary,
  putBinary,
  skillMasteryRow,
} from "./index";

const databases: PracticeDatabase[] = [];

afterEach(async () => {
  await Promise.all(databases.map((database) => database.delete()));
  databases.length = 0;
});

function createStore(): PracticeStore {
  const database = new PracticeDatabase(`practice-store-${crypto.randomUUID()}`);
  databases.push(database);
  return new PracticeStore(database);
}

describe("music-core/store", () => {
  test("round-trips sessions and skill mastery through Dexie repositories", async () => {
    const store = createStore();
    const session: PracticeSession = {
      id: "session-1",
      startTime: unixMs(Date.UTC(2026, 0, 2)),
      endTime: unixMs(Date.UTC(2026, 0, 2, 0, 5)),
      source: "daily-routine",
      instrument: "piano",
      runs: [],
      scoringEvents: [],
      xpEarned: 25,
      tags: ["morning"],
    };
    const mastery = {
      ...initialMastery("pitch.interval.m6"),
      mastery: 0.42,
      confidence: 0.25,
      observations: 3,
    };

    await store.sessions.put(session);
    await store.skillMastery.put(skillMasteryRow(mastery));

    await expect(store.sessions.get(session.id)).resolves.toEqual(session);
    await expect(store.skillMastery.get(mastery.skillId)).resolves.toEqual({
      id: mastery.skillId,
      ...mastery,
    });
  });

  test("stores and lists OPFS binaries when the browser supports OPFS", async () => {
    if (!("storage" in navigator) || !navigator.storage.getDirectory) return;

    const key = `store-test-${crypto.randomUUID()}.txt`;
    await putBinary(key, new Blob(["hello"], { type: "text/plain" }));

    await expect(getBinary(key).then((blob) => blob?.text())).resolves.toBe("hello");
    await expect(listBinary("store-test-")).resolves.toContain(key);
  });
});

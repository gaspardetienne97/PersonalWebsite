// The tune player's additions: Jam in 3/4 with a reharmonised chart, the displacement
// game, Accompaniment comping in 3/4 and hard-bop hits over drums and bass, and the
// Tunes page. Fake MIDI stamped to the beat, as in jam-graded.spec.ts.
import { expect, test, type Page } from "@playwright/test";
import {
  PORTS,
  expectNoHorizontalOverflow,
  installFakeMidi,
  pickMode,
  setupLine,
} from "./fixtures";

test.describe.configure({ retries: 2 });

/** MIDI on, no count-in, piano on the strip. */
async function setUp(page: Page) {
  await page.routeWebSocket(/.*/, () => {});
  await installFakeMidi(page, [PORTS.keys]);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/music");
  await page.waitForLoadState("networkidle");
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("woodshed");
        open.onsuccess = () => {
          const tx = open.result.transaction("settings", "readwrite");
          const store = tx.objectStore("settings");
          const get = store.get("music.settings");
          get.onsuccess = () =>
            store.put({
              id: "music.settings",
              value: {
                ...get.result?.value,
                midiEnabledBefore: true,
                countInBars: 0,
                activeInstrument: "piano",
              },
            });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
}

/** Notes at beats from Jam's downbeat, sent a little early and stamped with their real time. */
async function playBeats(page: Page, notes: [midi: number, beat: number, len?: number][]) {
  const clock = page.getByTestId("jam-clock");
  await expect(clock).toHaveAttribute("data-downbeat", /\d+/);
  const downbeat = Number(await clock.getAttribute("data-downbeat"));
  const beatMs = Number(await clock.getAttribute("data-beat-ms"));
  await page.evaluate(
    ({ list, downbeat, beatMs }) => {
      for (const [midi, beat, len = 0.8] of list) {
        const at = downbeat + beat * beatMs;
        setTimeout(
          () => (window as any).__midi.send("in-keys", [0x90, midi, 90], at),
          Math.max(0, at - 80 - performance.now()),
        );
        setTimeout(
          () => (window as any).__midi.send("in-keys", [0x80, midi, 0], at + beatMs * len),
          Math.max(0, at + beatMs * len - 80 - performance.now()),
        );
      }
    },
    { list: notes, downbeat, beatMs },
  );
}

const lastRun = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ exerciseId: string; params: Record<string, unknown>; score: number }>(
        (resolve) => {
          const open = indexedDB.open("woodshed");
          open.onsuccess = () => {
            const get = open.result.transaction("sessions").objectStore("sessions").getAll();
            get.onsuccess = () =>
              resolve(get.result.flatMap((s: { runs: unknown[] }) => s.runs).at(-1) as never);
          };
        },
      ),
  );

/** Start Accompaniment in Practice and play every slot from the run's own downbeat. */
async function playSlots(page: Page) {
  await pickMode(page, "Practice");
  await page.getByRole("button", { name: /^(Start|Again)$/ }).click();
  const stage = page.getByTestId("accompany");
  await expect(stage).toHaveAttribute("data-downbeat", /\d/, { timeout: 10_000 });
  const slots = JSON.parse((await stage.getAttribute("data-slots"))!) as [number, number[]][];
  const downbeat = Number(await stage.getAttribute("data-downbeat"));
  const beatMs = Number(await stage.getAttribute("data-beat-ms"));
  await page.evaluate(
    ({ slots, downbeat, beatMs, port }) => {
      const midi = (window as any).__midi;
      for (const [beat, notes] of slots) {
        const at = downbeat + beat * beatMs;
        setTimeout(
          () => notes.forEach((n, k) => midi.send(port, [0x90, n, 90], at + k * 3)),
          at - 80 - performance.now(),
        );
        setTimeout(
          () => notes.forEach((n) => midi.send(port, [0x80, n, 0])),
          at + beatMs * 0.4 - performance.now(),
        );
      }
    },
    { slots, downbeat, beatMs, port: PORTS.keys.id },
  );
  return slots;
}

test("Jam in 3/4 over a reharmonised ii-V-I: the 3rd of each chord, graded and recorded", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await setUp(page);
  await page.goto(
    "/music/jam?progression=ii-v-i&transpose=0&backing=both&game=thirds&choruses=1&meter=3&reharm=1:tritone&bpm=160",
  );
  await expect(page.getByRole("heading", { level: 1, name: "Jam" })).toBeVisible();
  // The sandbox shows the swapped chart: G7 became Db7.
  await page.getByRole("button", { name: "1 chord reharmonised" }).click();
  await expect(page.getByTestId("jam-reharm")).toContainText("Dm7 Db7 Cmaj7 A7");
  await pickMode(page, "Check");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  // Dm7 two bars of 3 (F), Db7 (F), Cmaj7 (E), A7 (C#): a change every six beats.
  await playBeats(page, [
    [65, 0],
    [65, 6],
    [64, 12],
    [61, 18],
  ]);
  await expect(page.getByTestId("results-metric")).toHaveText("100%", { timeout: 25_000 });
  expect((await lastRun(page)).params).toMatchObject({
    progression: "ii-v-i",
    game: "thirds",
    meter: 3,
    reharm: "tritone",
    swaps: "1:tritone",
  });
});

test("Jam's displacement game: a motif a beat later each bar over the blues", async ({ page }) => {
  test.setTimeout(60_000);
  await setUp(page);
  await page.goto(
    "/music/jam?progression=blues&transpose=0&backing=drums&game=displacement&choruses=1&meter=4&bpm=200",
  );
  await pickMode(page, "Check");
  await expect(page.getByTestId("jam-game")).toContainText("Displace a motif");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  // Three eighths every five beats, released before the next.
  await playBeats(
    page,
    Array.from({ length: 9 }, (_, k) =>
      [0, 0.5, 1].map((o, i) => [60 + i * 3, k * 5 + o, 0.4] as [number, number, number]),
    ).flat(),
  );
  await expect(page.getByTestId("results-metric")).toHaveText("100%", { timeout: 25_000 });
  await expect(page.getByTestId("jam-graded")).toContainText("8 displaced");
});

test.describe("Accompaniment comping on the new rhythms", () => {
  test.setTimeout(90_000);

  test("a jazz waltz: rootless on 1 and the and of 2 in 3/4, over drums and bass", async ({
    page,
  }) => {
    await setUp(page);
    await page.goto(
      "/music/accompany?mode=comping&voicing=rootless&rhythm=waltz&meter=3&band=rhythm&choruses=1&progression=ii-v-i&transpose=0&bpm=140",
    );
    // One clause of the setup sentence, whole.
    await expect(setupLine(page)).toContainText(
      /(:\s*|, )Rootless A and B on waltz: 1 and the and of 2(, |$)/,
    );
    const slots = await playSlots(page);
    expect(slots.slice(0, 2).map(([b]) => b)).toEqual([0, 1.5]);
    await expect(page.getByRole("status")).toContainText("Clean at 140 BPM", { timeout: 40_000 });
  });

  test("hard-bop hits with octave stabs on a standard's changes", async ({ page }) => {
    await setUp(page);
    await page.goto(
      "/music/accompany?mode=comping&voicing=octave-stabs&rhythm=hard-bop&meter=4&band=rhythm&choruses=1&progression=tune-well-you-neednt&transpose=0&bpm=160",
    );
    // One clause of the setup sentence, whole.
    await expect(setupLine(page)).toContainText(/(:\s*|, )Octave stabs on hard-bop hits(, |$)/);
    await playSlots(page);
    await expect(page.getByRole("status")).toContainText("Clean at 160 BPM", { timeout: 60_000 });
  });
});

test("the Tunes page lists the ladders and opens each rung", async ({ page }) => {
  await page.routeWebSocket(/.*/, () => {});
  await page.goto("/music/progress");
  await page.getByRole("link", { name: "Your tunes" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Tunes" })).toBeVisible();
  const ladders = page.getByTestId("ladders");
  await expect(ladders).toContainText("Yardbird Suite");
  const yardbird = ladders.getByRole("list", { name: "Yardbird Suite: the ladder" });
  await expect(yardbird.getByRole("link")).toHaveCount(6);
  await expect(yardbird.getByRole("link", { name: /^e, A solo chorus/ })).toHaveAttribute(
    "href",
    /progression=tune-yardbird-suite.*game=changes/,
  );
  await page.setViewportSize({ width: 375, height: 900 });
  await expectNoHorizontalOverflow(page);
});

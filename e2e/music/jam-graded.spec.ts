// Jam in Check mode: a chorus graded on a game through fake MIDI stamped to the
// beat, the run recorded as independent; a standard's lead sheet; trading fours.
import { expect, test, type Page } from "@playwright/test";
import { installFakeMidi, PORTS, pickMode } from "./fixtures";

test.describe.configure({ retries: 2 });

/** MIDI on, no count-in, piano on the strip. */
async function setUp(page: Page, url: string) {
  await installFakeMidi(page, [PORTS.keys]);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(url);
  await expect(page.getByLabel("Play over changes drill")).toContainText("Jam");
  await page.waitForTimeout(500);
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
  await page.reload();
  await expect(page.getByLabel("Play over changes drill")).toContainText("Jam");
}

/** Notes at beats from the run's downbeat, sent a little early and stamped with their real time. */
async function playBeats(page: Page, notes: [midi: number, beat: number][]) {
  const clock = page.getByTestId("jam-clock");
  await expect(clock).toHaveAttribute("data-downbeat", /\d+/);
  const downbeat = Number(await clock.getAttribute("data-downbeat"));
  const beatMs = Number(await clock.getAttribute("data-beat-ms"));
  await page.evaluate(
    ({ list, downbeat, beatMs }) => {
      for (const [midi, beat] of list) {
        const at = downbeat + beat * beatMs;
        setTimeout(
          () => (window as any).__midi.send("in-keys", [0x90, midi, 90], at),
          Math.max(0, at - 80 - performance.now()),
        );
        setTimeout(
          () => (window as any).__midi.send("in-keys", [0x80, midi, 0], at + beatMs * 0.8),
          Math.max(0, at + beatMs * 0.8 - 80 - performance.now()),
        );
      }
    },
    { list: notes, downbeat, beatMs },
  );
}

const lastRun = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{
        exerciseId: string;
        params: Record<string, unknown>;
        score: number;
        assistance: string;
      }>((resolve) => {
        const open = indexedDB.open("woodshed");
        open.onsuccess = () => {
          const get = open.result.transaction("sessions").objectStore("sessions").getAll();
          get.onsuccess = () =>
            resolve(get.result.flatMap((s: { runs: unknown[] }) => s.runs).at(-1) as never);
        };
      }),
  );

test("three notes over the blues: a chorus graded and recorded as checked", async ({ page }) => {
  test.setTimeout(60_000);
  await setUp(
    page,
    "/music/changes/jam?progression=blues&transpose=0&backing=none&game=three-notes&choruses=1&bpm=200",
  );
  await pickMode(page, "Check");
  await expect(page.getByTestId("jam-game")).toContainText("Three notes");
  // Tone roles are hidden in Check.
  await expect(page.locator('[data-role="chord"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  // C and Eb on beats 1 and 2 of every bar, then two beats of rest.
  await playBeats(
    page,
    Array.from(
      { length: 12 },
      (_, b) =>
        [
          [60, b * 4],
          [63, b * 4 + 1],
        ] as [number, number][],
    ).flat(),
  );
  await expect(page.getByTestId("results-metric")).toHaveText("100%", { timeout: 25_000 });
  await expect(page.getByTestId("jam-graded")).toContainText("Notes from the set: 24 of 24");
  const run = await lastRun(page);
  expect(run).toMatchObject({ exerciseId: "jam.improv", assistance: "independent", score: 1 });
  expect(run.params).toMatchObject({
    progression: "blues",
    game: "three-notes",
    choruses: 1,
    bpm: 200,
  });
});

test("trading fours over a standard: the lead sheet, and the band's bars left alone", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await setUp(
    page,
    "/music/changes/jam?progression=tune-jazz-blues&transpose=0&backing=both&game=chord-tones&choruses=1&trade=4&bpm=200",
  );
  await expect(page.getByTestId("jam-lead-sheet").locator("[data-bar]")).toHaveCount(12);
  await expect(page.getByTestId("jam-lead-sheet")).toContainText("Jazz blues in F");
  await pickMode(page, "Check");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByTestId("jam-game")).toContainText("Your bars: play");
  // The 3rd of each bar's chord on 1 and 3 in bars 1 to 4 and 9 to 12 (F7 Bb7 F7 Cm7-F7, Gm7 C7 F7-D7 Gm7-C7).
  const thirds: Record<number, [number, number]> = {
    0: [69, 69],
    1: [62, 62],
    2: [69, 69],
    3: [63, 69],
    8: [70, 70],
    9: [64, 64],
    10: [69, 66],
    11: [70, 64],
  };
  await playBeats(
    page,
    Object.entries(thirds).flatMap(
      ([b, [one, three]]) =>
        [
          [one, Number(b) * 4],
          [three, Number(b) * 4 + 2],
        ] as [number, number][],
    ),
  );
  await expect(page.getByTestId("results-metric")).toHaveText("100%", { timeout: 25_000 });
  await expect(page.getByTestId("jam-graded")).toContainText("3 of 3 windows");
  expect((await lastRun(page)).params).toMatchObject({
    progression: "tune-jazz-blues",
    game: "chord-tones",
    trade: 4,
  });
});

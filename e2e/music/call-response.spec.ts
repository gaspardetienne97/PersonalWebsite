// Call and response over a groove, through fake MIDI stamped to the beat: every
// call echoed back in a checked run, then answers that land on a chord tone.
import { expect, test, type Page } from "@playwright/test";
import { installFakeMidi, PORTS, pickMode } from "./fixtures";

test.describe.configure({ retries: 2 });

/** MIDI on, no count-in (the run's own clock is read from the stage). */
async function setUp(page: Page, url: string) {
  await installFakeMidi(page, [PORTS.keys]);
  await page.goto(url);
  await expect(page.getByLabel("Play over changes drill")).toContainText("Call and response");
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
              value: { ...get.result?.value, midiEnabledBefore: true, countInBars: 0, bpm: 150 },
            });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.reload();
  await expect(page.getByLabel("Play over changes drill")).toContainText("Call and response");
}

/** Schedule notes inside the page, each sent a little early and stamped with its real time. */
async function schedule(page: Page, notes: [number, number][]) {
  await page.evaluate((list) => {
    for (const [midi, at] of list) {
      setTimeout(
        () => (window as any).__midi.send("in-keys", [0x90, midi, 90], at),
        Math.max(0, at - 80 - performance.now()),
      );
      setTimeout(
        () => (window as any).__midi.send("in-keys", [0x80, midi, 0], at + 120),
        Math.max(0, at + 40 - performance.now()),
      );
    }
  }, notes);
}

async function runClock(page: Page) {
  const stage = page.getByTestId("call-response");
  await expect(stage).toHaveAttribute("data-downbeat", /\d+/);
  return {
    downbeat: Number(await stage.getAttribute("data-downbeat")),
    beatMs: Number(await stage.getAttribute("data-beat-ms")),
    bars: Number(await stage.getAttribute("data-bars")),
    calls: JSON.parse((await stage.getAttribute("data-calls"))!) as [number, number][][],
  };
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

test("echo: every call played back in time, a checked run", async ({ page }) => {
  test.setTimeout(60_000);
  await setUp(page, "/music/changes/call-response?mode=echo&groove=blues&bars=1");
  await pickMode(page, "Check");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const c = await runClock(page);
  const bar = 4 * c.beatMs;
  await schedule(
    page,
    c.calls.flatMap((call, k) =>
      call.map(
        ([midi, beat]) =>
          [midi + 12, c.downbeat + (k * 2 * c.bars + c.bars) * bar + beat * c.beatMs] as [
            number,
            number,
          ],
      ),
    ),
  );
  await expect(page.getByRole("status")).toContainText("6 of 6 calls echoed", { timeout: 40_000 });
  const run = await lastRun(page);
  expect(run).toMatchObject({
    exerciseId: "ear.call-response.echo",
    assistance: "independent",
    score: 1,
  });
  expect(run.params).toMatchObject({ mode: "echo", groove: "blues", bars: 1 });
});

test("answer: own phrases on the grid that land on a chord tone", async ({ page }) => {
  test.setTimeout(60_000);
  await setUp(page, "/music/changes/call-response?mode=answer&groove=modal&bars=1");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const c = await runClock(page);
  const bar = 4 * c.beatMs;
  // D is in Dm7 and Em7, the vamp's two chords: every answer ends on a chord tone.
  await schedule(
    page,
    Array.from({ length: 6 }, (_, k) => {
      const at = c.downbeat + (k * 2 + 1) * bar;
      return [
        [65, at],
        [64, at + c.beatMs / 2],
        [62, at + 2 * c.beatMs],
      ] as [number, number][];
    }).flat(),
  );
  await expect(page.getByRole("list", { name: "Turns" })).toContainText(
    "1: Landed on a chord tone, 100% in time",
    { timeout: 15_000 },
  );
  await expect(page.getByRole("status")).toContainText("6 of 6 answers landed in time", {
    timeout: 40_000,
  });
  expect((await lastRun(page)).params).toMatchObject({ mode: "answer", groove: "modal" });
});

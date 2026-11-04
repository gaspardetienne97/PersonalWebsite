// Pedal's Hear it first, licks chunked by tapping notes, timed Aerophone
// articulation, legato marks, and Positions on drop D.
import { expect, test, type Page } from "@playwright/test";
import { PORTS, installFakeMidi, muteHmr } from "./fixtures";

const AE = PORTS.aerophone.id;

async function enableMidi(page: Page, url: string) {
  await page.goto(url);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
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
              value: { ...get.result?.value, midiEnabledBefore: true, countInBars: 0 },
            });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
      }),
  );
  await page.reload();
  await expect(page.getByTestId("midi-status")).toContainText("Listening on Aerophone", {
    timeout: 10_000,
  });
}

test.beforeEach(async ({ page }) => {
  await muteHmr(page);
  await page.setViewportSize({ width: 1280, height: 1000 });
});

test("pedal: Hear it first plays the chart, not scored", async ({ page }) => {
  await page.goto("/music/pedal?progression=I-vi-IV-V&key=0&rounds=1");
  await page.getByRole("button", { name: "Hear it", exact: true }).click();
  await expect(page.getByText("Demo playing, not scored.")).toBeVisible();
  await expect(page.locator(".piano [data-demo]").first()).toBeAttached();
  await page.getByRole("button", { name: "Stop demo" }).click();
  await expect(page.getByRole("button", { name: "Hear it", exact: true })).toBeVisible();
});

test("licks: two taps on the staff mark a chunk, and it loops", async ({ page }) => {
  await page.goto("/music/licks?lick=1&key=C&bpm=120");
  const staff = page.getByTestId("line-staff");
  await expect(staff.getByText("Tap a note to mark where the range starts.")).toBeVisible();
  await staff.getByRole("button", { name: /^Bar 1, note 3/ }).click();
  await staff.getByRole("button", { name: /^Bar 1, note 5/ }).click();
  await expect(page.getByRole("status")).toContainText("Chunk set to notes 3 to 5.");
  await expect(page.getByText("notes 3 to 5", { exact: true })).toBeVisible();
  // The three notes are tinted on the whole lick, and the lane holds just them.
  await expect(staff.getByRole("button", { name: /^Bar 1, note 4, in range/ })).toBeVisible();
  await page.getByRole("button", { name: "Loop chunk 3 times" }).click();
  await expect(page.getByRole("status")).toContainText("Listen: notes 3 to 5, three times.");
  await page.getByRole("button", { name: "Stop demo" }).click();
});

test("aerophone articulation: attacks timed against the click", async ({ page }) => {
  test.setTimeout(60_000);
  await installFakeMidi(page, [PORTS.aerophone]);
  await enableMidi(page, "/music/aerophone?mode=articulation&style=staccato&count=4&bpm=80");
  const stage = page.getByTestId("aerophone-stage");
  await page.getByRole("button", { name: /^(Start|Again)$/ }).click();
  await expect(stage).toHaveAttribute("data-downbeat", /\d/, { timeout: 10_000 });
  const downbeat = Number(await stage.getAttribute("data-downbeat"));
  const beatMs = Number(await stage.getAttribute("data-beat-ms"));
  const midi = Number(await stage.getAttribute("data-target"));
  // Two on the click, two 150 ms late; each sounds 35% of its beat.
  await page.evaluate(
    ({ downbeat, beatMs, midi, port }) => {
      const send = (bytes: number[], at: number) =>
        setTimeout(() => (window as any).__midi.send(port, bytes, at), at - 80 - performance.now());
      [0, 150, 0, 150].forEach((late, i) => {
        const at = downbeat + i * beatMs + late;
        send([0x90, midi, 90], at);
        send([0x80, midi, 0], at + 0.35 * beatMs);
      });
    },
    { downbeat, beatMs, midi, port: AE },
  );
  const results = page.locator("article").first();
  await expect(results).toContainText("Attacks on the click (within 100 ms)", { timeout: 15_000 });
  await expect(results).toContainText("2 of 4");
  await expect(results).toContainText("+150");
  await expect(page.getByRole("status")).toContainText("2 of 4 attacks missed the click");
  await page.screenshot({
    path: "docs/screenshots/rebuild/aero-skills/articulation-timed-1280.png",
    fullPage: true,
  });
});

test("legato: tab's marks, the picked note never a P", async ({ page }) => {
  await page.goto(
    "/music/fretboard?mode=legato&pattern=hammer-pull&string=3&startFret=5&instrument=guitar",
  );
  await expect(page.getByText("5h7p5").first()).toBeVisible();
  await expect(page.locator('button[aria-label^="String 3 fret 5,"] .dot')).toHaveText("↓");
  await expect(page.locator('button[aria-label^="String 3 fret 7,"] .dot')).toHaveText("h");
});

test("positions: box 1 in drop D keeps its pitches, string 6 two frets up", async ({ page }) => {
  await page.goto(
    "/music/fretboard?mode=positions&pattern=minor-pentatonic-box-1&rootFret=7&instrument=guitar&tuning=guitar.drop-d",
  );
  await expect(page.getByText("On Drop D, each note keeps its pitch")).toBeVisible();
  await expect(page.locator('button[aria-label^="String 6 fret 7,"] .dot')).toHaveText("3");
  await expect(page.locator('button[aria-label^="String 6 fret 10,"] .dot')).toHaveText("4→");
  await expect(page.locator('button[aria-label^="String 5 fret 5,"] .dot')).toHaveText("1");
  // Back to standard: box 3's index reaches back on string 3.
  await page.goto(
    "/music/fretboard?mode=positions&pattern=minor-pentatonic-box-3&rootFret=5&instrument=guitar&tuning=guitar.standard",
  );
  await expect(page.locator('button[aria-label^="String 3 fret 9,"] .dot')).toHaveText("←1");
});

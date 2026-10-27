// Shuffles, odd meters and swing on the pads: the triplet grid, 7/8 clicked in
// eighths, swing 66 on a straight-written groove, a triplet fill, and a loop
// under Improvise, played over fake MIDI stamped with each hit's exact time.
import { expect, test, type Page } from "@playwright/test";
import { expectNoHorizontalOverflow, installFakeMidi, PORTS } from "./fixtures";

const SHOTS = "docs/screenshots/rebuild/pads-meters";

/** MIDI re-opens on load once it was enabled before; seed that flag (and no count-in), then reload. */
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
}

/** Start, then every target of the stage at its time, sent early and stamped exactly. */
async function play(page: Page, testId: string) {
  const stage = page.getByTestId(testId);
  await page.getByRole("button", { name: /^Start/ }).click();
  await expect(stage).toHaveAttribute("data-downbeat", /\d/, { timeout: 10_000 });
  const targets = JSON.parse((await stage.getAttribute("data-targets"))!) as [
    number,
    number,
    string,
  ][];
  const downbeat = Number(await stage.getAttribute("data-downbeat"));
  await page.evaluate(
    ({ targets, downbeat, port }) => {
      for (const [pad, at, kind] of targets) {
        const when = downbeat + at;
        const vel = kind === "a" ? 110 : kind === "g" ? 30 : 70;
        setTimeout(
          () => (window as any).__midi.send(port, [0x90, pad, vel], when),
          when - 60 - performance.now(),
        );
        setTimeout(
          () => (window as any).__midi.send(port, [0x80, pad, 0], when + 30),
          when - 30 - performance.now(),
        );
      }
    },
    { targets, downbeat, port: PORTS.keys.id },
  );
  return targets;
}

test.describe("shuffles, odd meters and swing", () => {
  test.beforeEach(async ({ page }) => {
    await page.routeWebSocket(/\/\?token=|vite-hmr/, () => {});
    await page.setViewportSize({ width: 1280, height: 900 });
    await installFakeMidi(page, [PORTS.keys]);
  });

  test("a blues shuffle on the triplet grid passes when played on the triplets", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await enableMidi(page, "/music/pads?mode=groove&groove=blues-shuffle&bpm=120");
    await expect(page.getByText("Setup:").locator("..")).toContainText("on triplets");
    const grid = page.getByRole("region", { name: /The groove, 1 bar/ });
    // Twelve steps a bar, counted 1 & a.
    await expect(grid.locator(".count")).toHaveCount(12);
    await expect(grid.locator(".count").nth(1)).toHaveText("&");
    await expect(grid.locator(".count").nth(2)).toHaveText("a");
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(200);
      await expectNoHorizontalOverflow(page);
      await page.screenshot({ path: `${SHOTS}/shuffle-${width}.png`, fullPage: true });
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    const targets = await play(page, "pads-stage");
    // The shuffle's hats: the first and third of each triplet (333 ms apart at 120, then 167).
    const hats = targets.filter(([pad]) => pad === 42).map(([, at]) => at);
    expect(hats.slice(0, 3)).toEqual([0, 333, 500]);
    await expect(page.getByRole("status")).toContainText("Passed level 7 at 120 BPM", {
      timeout: 15_000,
    });
  });

  test("7/8 clicks seven eighths and grades a seven-beat bar", async ({ page }) => {
    test.setTimeout(60_000);
    await enableMidi(page, "/music/pads?mode=groove&groove=seven-eight&bpm=120");
    await expect(page.getByText("Setup:").locator("..")).toContainText(
      "Rock in 7/8, 1 bar, 120 BPM",
    );
    await expect(page.getByLabel("About this groove")).toContainText("7/8");
    const grid = page.getByRole("region", { name: /The groove, 1 bar/ });
    await expect(grid.locator(".count")).toHaveCount(14);
    await expect(grid.locator(".count").nth(12)).toHaveText("7");
    const targets = await play(page, "pads-stage");
    expect(Math.max(...targets.map(([, at]) => at))).toBe(3000);
    await expect(page.getByRole("status")).toContainText("Passed level 8 at 120 BPM", {
      timeout: 15_000,
    });
    await page.screenshot({ path: `${SHOTS}/seven-eight-results-1280.png`, fullPage: true });
  });

  test("swing 66 on a groove written at 62 moves its off-sixteenths to the triplet", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await enableMidi(page, "/music/pads?mode=groove&groove=swing-62&swing=66&bpm=80");
    await expect(page.getByText("Setup:").locator("..")).toContainText("swing 66%");
    await page.getByRole("button", { name: "Setup", exact: true }).click();
    await expect(page.getByRole("button", { name: "66%", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("button", { name: "Hide setup" }).click();
    const targets = await play(page, "pads-stage");
    // At 80 BPM a beat is 750 ms: the second hat at 0.33 of it.
    expect(targets.filter(([pad]) => pad === 42)[1][1]).toBe(248);
    await expect(page.getByRole("status")).toContainText("Passed level 4 at 80 BPM", {
      timeout: 15_000,
    });
    await expect(page.locator("article").first()).toContainText("aiming for 66%");
  });

  test("a triplet fill lands on the one after three bars of shuffle", async ({ page }) => {
    test.setTimeout(60_000);
    await enableMidi(page, "/music/pads?mode=fills&fill=triplet-toms&bpm=100");
    await expect(page.getByText("Setup:").locator("..")).toContainText("three bars of shuffle");
    await play(page, "pad-skills");
    await expect(page.getByRole("status")).toContainText("Landed on the one", { timeout: 25_000 });
  });

  test("counting in 5 and Improvise over a loop are set up from their links", async ({ page }) => {
    await page.goto("/music/pads?mode=rudiment&pattern=fives&sub=2&hits=16&bpm=80");
    await expect(page.getByText("Setup:").locator("..")).toContainText(
      "Singles in 5, accented 3 + 2",
    );
    await page.goto("/music/pads?mode=improvise&loop=boom-bap-b&bars=32");
    await expect(page.getByText("Setup:").locator("..")).toContainText("Improvise over 32 bars");
    await expect(page.getByText("Setup:").locator("..")).toContainText("of Boom bap and the band");
  });
});

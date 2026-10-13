// Finger drumming: the repertoire by level, the tempo ladder, holding the
// tempo with no click, and one-pad rolls, played over a fake MIDI keyboard.
import { expect, test, type Page } from "@playwright/test";
import { expectNoHorizontalOverflow, installFakeMidi, PORTS } from "./fixtures";

const SHOTS = "docs/screenshots/rebuild/pads-repertoire";
async function shots(page: Page, name: string) {
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(200);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: `${SHOTS}/${name}-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

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

/** Every target of the groove on show, at its time, with its dynamic (accent loud, ghost soft). */
async function playGroove(page: Page) {
  const stage = page.getByTestId("pads-stage");
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
        // Sent a little early, stamped with the hit's exact time: timers under load can't skew it.
        const when = downbeat + at;
        const wait = when - 60 - performance.now();
        const vel = kind === "a" ? 110 : kind === "g" ? 30 : 70;
        setTimeout(() => (window as any).__midi.send(port, [0x90, pad, vel], when), wait);
        setTimeout(() => (window as any).__midi.send(port, [0x80, pad, 0], when + 30), wait + 30);
      }
    },
    { targets, downbeat, port: PORTS.keys.id },
  );
  return targets.length;
}

test.describe("finger-drumming repertoire", () => {
  test.beforeEach(async ({ page }) => {
    await page.routeWebSocket(/\/\?token=|vite-hmr/, () => {});
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test("Funky Drummer at level 3: passed, then up the tempo ladder", async ({ page }) => {
    test.setTimeout(60_000);
    await installFakeMidi(page, [PORTS.keys]);
    await enableMidi(page, "/music/pads?mode=groove&groove=funky-drummer&bpm=80");
    const card = page.getByLabel("About this groove");
    await expect(card).toContainText("Funky Drummer");
    await expect(card).toContainText(
      "level 3 (intermediate: perfect within 25 ms, good within 50 ms)",
    );
    await expect(card).toContainText("Starts at 80 BPM, aims for 100");
    await shots(page, "funky-drummer-ready");
    await page.getByRole("button", { name: /^Start/ }).click();
    await playGroove(page);
    // While it plays: the note highway, judged as it goes, a streak building.
    await expect(page.getByRole("img", { name: /notes coming up$/ })).toBeVisible();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${SHOTS}/highway-1280.png` });
    await expect(page.getByRole("status")).toContainText("Passed level 3 at 80 BPM", {
      timeout: 15_000,
    });
    await expect(page.getByLabel("3 of 3 stars")).toBeVisible();
    await expect(page.getByRole("status")).toContainText("Next time: 85 BPM.");
    await shots(page, "funky-drummer-results");
    await page.getByRole("button", { name: "Up the ladder: 85 BPM" }).click();
    await expect(page.getByText("Setup:").locator("..")).toContainText("85 BPM");
  });

  test("kompa: the cowbell gets its own lane, and the groove passes", async ({ page }) => {
    test.setTimeout(60_000);
    await installFakeMidi(page, [PORTS.keys]);
    await enableMidi(page, "/music/pads?mode=groove&groove=kompa&bpm=90");
    await expect(page.getByLabel("About this groove")).toContainText("Provisional");
    await page.getByRole("button", { name: /^Start/ }).click();
    await playGroove(page);
    const highway = page.getByRole("img", { name: /notes coming up$/ });
    await expect(highway).toContainText("Cowbell");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${SHOTS}/kompa-highway-1280.png` });
    await expect(page.getByRole("status")).toContainText("Passed level 4 at 90 BPM", {
      timeout: 20_000,
    });
  });

  test("hold the tempo: four bars with the click, eight on your own", async ({ page }) => {
    test.setTimeout(60_000);
    await installFakeMidi(page, [PORTS.keys]);
    await enableMidi(page, "/music/pads?mode=steady&steady=basic-rock&bpm=140");
    await expect(page.getByText("Setup:").locator("..")).toContainText(
      "4 bars with the click and 8 on your own",
    );
    await page.getByRole("button", { name: /^Start/ }).click();
    await playGroove(page);
    await expect(page.getByRole("status")).toContainText("On your own you held it", {
      timeout: 30_000,
    });
    await expect(page.getByRole("status")).toContainText("Steady.");
  });

  test("the groove list is by level, and a two-finger roll stays on one pad", async ({ page }) => {
    await page.goto("/music/pads?mode=groove");
    await page.getByRole("button", { name: "Change setup" }).click();
    await page
      .getByRole("combobox", { name: "Groove" })
      .or(page.getByLabel("Groove", { exact: true }))
      .first()
      .click();
    await expect(page.getByText("Level 6: The breaks")).toBeVisible();
    await expect(page.getByRole("option", { name: "Amen break (4 bars)" })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.goto("/music/pads?mode=rudiment&pattern=roll-32&hits=32&bpm=70");
    await expect(page.getByText("Setup:").locator("..")).toContainText("Thirty-second roll");
    await expect(page.getByTestId("pads-stage")).toContainText("Both fingers");
    await shots(page, "roll-ready");
  });

  test("wait mode: the notes stop until their pads are hit, nothing timed", async ({ page }) => {
    test.setTimeout(45_000);
    await installFakeMidi(page, [PORTS.keys]);
    await enableMidi(page, "/music/pads?mode=groove&groove=backbeat&wait=true&bpm=90");
    await page.getByRole("button", { name: /^Start/ }).click();
    await expect(page.getByRole("status")).toContainText("Wait mode");
    const stage = page.getByTestId("pads-stage");
    const targets = JSON.parse((await stage.getAttribute("data-targets"))!) as [
      number,
      number,
      string,
    ][];
    // A wrong pad first: it does not move on.
    await page.evaluate((port) => (window as any).__midi.send(port, [0x90, 51, 90]), PORTS.keys.id);
    for (const [pad] of targets) {
      await page.waitForTimeout(250);
      await page.evaluate(([port, pad]) => (window as any).__midi.send(port, [0x90, pad, 90]), [
        PORTS.keys.id,
        pad,
      ] as const);
    }
    await expect(page.getByRole("status")).toContainText(
      `All ${targets.length} notes in order, with 1 wrong pad`,
      { timeout: 10_000 },
    );
  });

  test("the preview is one line that scrolls, the pads sit under it, and a band can play along", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await installFakeMidi(page, [PORTS.keys]);
    await enableMidi(page, "/music/pads?mode=groove&groove=amen&bpm=110&backing=true");
    const preview = page.getByRole("region", { name: "The groove, 4 bars, scroll sideways" });
    await expect(preview).toBeVisible();
    const { scroll, client } = await preview.evaluate((el) => ({
      scroll: el.scrollWidth,
      client: el.clientWidth,
    }));
    expect(scroll).toBeGreaterThan(client);
    // Notes on top, pads below.
    const gridBox = (await preview.boundingBox())!;
    const padsBox = (await page.getByRole("group", { name: /^MPC pads, bank A/ }).boundingBox())!;
    expect(padsBox.y).toBeGreaterThan(gridBox.y + gridBox.height - 1);
    await page.getByRole("button", { name: "Change setup" }).click();
    await expect(page.getByText("Band: Gm7 C9")).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();
    await shots(page, "amen-ready");
    await page.getByRole("button", { name: /^Start/ }).click();
    await playGroove(page);
    await expect(page.getByRole("status")).toContainText("Passed level 6 at 110 BPM", {
      timeout: 20_000,
    });
  });
});

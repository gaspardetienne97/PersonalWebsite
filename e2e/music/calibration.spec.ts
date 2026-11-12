// Latency calibration belongs to an input and output pair: a timed drill offers the
// tap-along once for a pair with no offset, and results say when timing evidence
// came from an uncalibrated pair. Fresh profile, fake MIDI.
import { expect, test, type Page } from "@playwright/test";
import { installFakeMidi, muteHmr, PORTS } from "./fixtures";

const SHOTS = "test-results/calibration";
const DRILL = "/music/rhythm?mode=pulse&beats=8&bpm=100";

async function enableMidi(page: Page) {
  await page.goto("/music");
  await expect(page.locator("h1").first()).toBeVisible();
  await expect(async () => {
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const req = indexedDB.open("woodshed");
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            try {
              const tx = req.result.transaction("settings", "readwrite");
              const store = tx.objectStore("settings");
              const get = store.get("music.settings");
              get.onsuccess = () =>
                store.put({
                  id: "music.settings",
                  value: {
                    ...get.result?.value,
                    midiEnabledBefore: true,
                    countInBars: 1,
                    activeInstrument: "piano",
                  },
                });
              tx.oncomplete = () => resolve();
              tx.onerror = () => reject(tx.error);
            } catch (e) {
              reject(e);
            } finally {
              req.result.close();
            }
          };
        }),
    );
  }).toPass();
}

/** Open the drill and make a first gesture, so audio runs and the output is known. */
async function openDrill(page: Page) {
  await page.goto(DRILL);
  await expect(page.getByRole("button", { name: /^Start$/ }).first()).toBeVisible();
  await page.locator("h1").first().click();
}

/** One run, a key on every beat from the stage's own downbeat. */
async function playRun(page: Page) {
  const stage = page.locator("[data-beat-ms]").first();
  const before = await stage.getAttribute("data-downbeat");
  await page
    .getByRole("button", { name: /^(Start|Again)$/ })
    .first()
    .click();
  await expect
    .poll(async () => (await stage.getAttribute("data-downbeat")) !== before, { timeout: 20_000 })
    .toBe(true);
  await page.evaluate((port) => {
    const s = document.querySelector("[data-beat-ms]")!;
    const d = Number(s.getAttribute("data-downbeat"));
    const b = Number(s.getAttribute("data-beat-ms"));
    const m = (window as any).__midi;
    for (let i = 0; i < 8; i++)
      setTimeout(
        () => {
          m.send(port, [0x90, 60, 100]);
          setTimeout(() => m.send(port, [0x80, 60, 0]), 90);
        },
        Math.max(0, d + i * b - performance.now()),
      );
  }, PORTS.keys.id);
  await expect(page.getByTestId("results").first()).toBeVisible({ timeout: 40_000 });
}

test.describe("Latency calibration per input and output", () => {
  test.beforeEach(async ({ page }) => {
    await muteHmr(page);
    await installFakeMidi(page, [PORTS.keys]);
    await enableMidi(page);
  });

  test("a timed drill offers the tap-along, results say timing is not calibrated, and calibrating clears both", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await openDrill(page);
    const offer = page.getByTestId("calibration-offer");
    await expect(offer).toContainText("Timing isn't calibrated for Digital Piano on this output.");
    // The offer never holds Start back.
    await expect(page.getByRole("button", { name: /^Start$/ }).first()).toBeEnabled();
    await offer.screenshot({ path: `${SHOTS}/offer.png` });
    await page.screenshot({ path: `${SHOTS}/offer-page.png` });

    await playRun(page);
    const note = page.getByTestId("timing-uncalibrated");
    await expect(note).toContainText("Timing isn't calibrated for this setup.");
    await expect(note.getByRole("link", { name: "Calibrate" })).toHaveAttribute(
      "href",
      "/music/settings#latency",
    );
    await note.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/results-note.png` });

    // Calibrate in place: taps 20 ms after each click, through the fake MIDI port.
    await openDrill(page);
    await offer.getByRole("button", { name: "Tap along" }).click();
    await page.waitForFunction(() => (window as any).__woodshedCalibration);
    await page.evaluate(() => {
      const { startPerf, beatMs, clicks } = (window as any).__woodshedCalibration;
      for (let i = 0; i < clicks; i++)
        setTimeout(
          () => {
            (window as any).__midi.send("in-keys", [0x90, 60, 100]);
            setTimeout(() => (window as any).__midi.send("in-keys", [0x80, 60, 0]), 60);
          },
          startPerf + i * beatMs + 20 - performance.now(),
        );
    });
    await page.waitForTimeout(3000);
    await offer.screenshot({ path: `${SHOTS}/offer-running.png` });
    await expect(offer.getByTestId("result-offer")).toContainText("Measured", { timeout: 25_000 });
    await offer.getByRole("button", { name: /^Save/ }).click();
    await expect(offer).toContainText("Timing is calibrated for Digital Piano on this output.");

    await playRun(page);
    await expect(page.getByTestId("results").first()).toContainText("On time");
    await expect(note).toHaveCount(0);

    // The pair is calibrated: no offer on the next visit, and Settings shows the offset.
    await openDrill(page);
    await page.waitForTimeout(1500);
    await expect(offer).toHaveCount(0);
    await page.goto("/music/settings");
    await expect(page.getByTestId(`offset-dev-${PORTS.keys.id}`)).toContainText(/Now [+−]?\d+ ms/);
  });

  test("a skipped offer stays away for that pair", async ({ page }) => {
    await openDrill(page);
    const offer = page.getByTestId("calibration-offer");
    await expect(offer).toBeVisible();
    await offer.getByRole("button", { name: "Skip", exact: true }).click();
    await expect(offer).toHaveCount(0);
    await openDrill(page);
    await page.waitForTimeout(1500);
    await expect(offer).toHaveCount(0);
    // Skipping is not calibrating: results still say so.
    await playRun(page);
    await expect(page.getByTestId("timing-uncalibrated")).toBeVisible();
  });
});

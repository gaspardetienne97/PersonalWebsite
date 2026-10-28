// The pad skills beyond grooves: fills that land, playing back by ear,
// rudiments on the kit, an ostinato under a line, dynamics against the
// player's own range, and improvising, over fake MIDI stamped exactly.
import { expect, test, type Page } from "@playwright/test";
import { installFakeMidi, PORTS } from "./fixtures";

const SHOTS = "docs/screenshots/rebuild/pad-skills";

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

/** Start, then play every target at its time (sent early, stamped exactly). */
async function playTargets(page: Page) {
  const stage = page.getByTestId("pad-skills");
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
        const vel = kind === "a" ? 110 : kind === "g" ? 30 : 75;
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
}

test.describe("pad skills", () => {
  test.beforeEach(async ({ page }) => {
    await page.routeWebSocket(/\/\?token=|vite-hmr/, () => {});
    await page.setViewportSize({ width: 1280, height: 900 });
    await installFakeMidi(page, [PORTS.keys]);
  });

  test("fills: three bars, the fill, landing on the one", async ({ page }) => {
    test.setTimeout(60_000);
    await enableMidi(page, "/music/pads?mode=fills&fill=down-the-toms&bpm=100");
    await expect(page.getByText("Setup:").locator("..")).toContainText("Sixteenths down the toms");
    await playTargets(page);
    await expect(page.getByRole("status")).toContainText("Landed on the one", { timeout: 20_000 });
    await expect(page.locator("article").first()).toContainText("Landing on the one");
    await page.screenshot({ path: `${SHOTS}/fills-1280.png`, fullPage: true });
  });

  test("play it back: four answers, all matched", async ({ page }) => {
    test.setTimeout(60_000);
    await enableMidi(page, "/music/pads?mode=echo&echo=kick-snare&bpm=120");
    await playTargets(page);
    await expect(page.getByRole("status")).toContainText("4 of 4 played back", { timeout: 25_000 });
  });

  test("rudiments on the kit and the ostinato run clean", async ({ page }) => {
    test.setTimeout(60_000);
    await enableMidi(page, "/music/pads?mode=orchestrate&orch=toms-lead&bpm=80");
    await playTargets(page);
    await expect(page.getByRole("status")).toContainText("Clean", { timeout: 15_000 });
    await page.goto("/music/pads?mode=ostinato&line=backbeat-push&bpm=100");
    await playTargets(page);
    await expect(page.getByRole("status")).toContainText("The hats held", { timeout: 20_000 });
  });

  test("dynamics: calibrate the range, then the four-level ladder", async ({ page }) => {
    test.setTimeout(60_000);
    await enableMidi(page, "/music/pads?mode=dynamics&dyn=ladder&bpm=90");
    await page.getByRole("button", { name: "Calibrate" }).click();
    await page.evaluate((port) => {
      const send = (v: number) => {
        (window as any).__midi.send(port, [0x90, 38, v]);
        (window as any).__midi.send(port, [0x80, 38, 0]);
      };
      [20, 22, 21, 23, 118, 120, 119, 121].forEach((v, i) => setTimeout(() => send(v), i * 80));
    }, PORTS.keys.id);
    await expect(page.getByRole("status")).toContainText("Range set", { timeout: 5000 });
    const stage = page.getByTestId("pad-skills");
    await page.getByRole("button", { name: /^Start/ }).click();
    await expect(stage).toHaveAttribute("data-downbeat", /\d/, { timeout: 10_000 });
    const downbeat = Number(await stage.getAttribute("data-downbeat"));
    // Range 21 to 120 (of 127): each level's middle, four hits each, eighths at 90 BPM.
    await page.evaluate(
      ({ downbeat, port }) => {
        const lo = 21,
          hi = 120;
        for (let i = 0; i < 16; i++) {
          const level = (Math.floor(i / 4) + 0.5) / 4;
          const v = Math.round(lo + level * (hi - lo));
          const when = downbeat + (i * 60000) / 90 / 2;
          setTimeout(
            () => (window as any).__midi.send(port, [0x90, 38, v], when),
            when - 60 - performance.now(),
          );
          setTimeout(
            () => (window as any).__midi.send(port, [0x80, 38, 0], when + 30),
            when - 30 - performance.now(),
          );
        }
      },
      { downbeat, port: PORTS.keys.id },
    );
    await expect(page.getByRole("status")).toContainText("Controlled", { timeout: 15_000 });
    await page.screenshot({ path: `${SHOTS}/dynamics-1280.png`, fullPage: true });
  });

  test("improvise: the take is graded on time and density and can be heard back", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await enableMidi(page, "/music/pads?mode=improvise&bars=4&bpm=120");
    const stage = page.getByTestId("pad-skills");
    await page.getByRole("button", { name: /^Start/ }).click();
    await expect(stage).toHaveAttribute("data-downbeat", /\d/, { timeout: 10_000 });
    const downbeat = Number(await stage.getAttribute("data-downbeat"));
    await page.evaluate(
      ({ downbeat, port }) => {
        [0, 260, 500, 760, 1000, 1240, 1500, 1770].forEach((at, i) => {
          const when = downbeat + at;
          setTimeout(
            () => (window as any).__midi.send(port, [0x90, [36, 38, 42][i % 3], 60 + i * 8], when),
            when - 60 - performance.now(),
          );
        });
      },
      { downbeat, port: PORTS.keys.id },
    );
    // One bar of hits in four: graded, and the quiet bars named.
    await expect(page.getByRole("status")).toContainText("bars went quiet", { timeout: 15_000 });
    await expect(page.getByText("Bars kept going")).toBeVisible();
    await expect(page.getByRole("button", { name: "Hear it nudged to the grid" })).toBeVisible();
  });
});

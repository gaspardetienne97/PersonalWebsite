// Voice settings (/pdf/settings): the page, system voices, the natural (Kokoro) voice and its
// download states, the voice menu in the reader, and what happens when voices are missing or
// the natural voice cannot load.
import { expect, test } from "@playwright/test";
import { VIEWPORTS, WIDTHS, scrollTo, settle } from "../capture-common.ts";
import {
  SPEECH_NOTE,
  addFile,
  blockModel,
  narrator,
  nsnap,
  openAdd,
  openDoc,
  openLibrary,
  openSettings,
  reader,
} from "./narrator.ts";

// The settings page's cards, in order: language, reading voice (engine), natural voice, system voices.
const card = (page: import("@playwright/test").Page, n: number) => page.locator(".wrap > section.card").nth(n);
const natural = (page: import("@playwright/test").Page) => card(page, 2);
const system = (page: import("@playwright/test").Page) => card(page, 3);
const modelRow = ".model-row";

for (const width of WIDTHS) {
  test(`voice settings page ${width}`, async ({ page }) => {
    await narrator(page, width);
    await openSettings(page);
    await nsnap(
      page,
      "settings",
      "page",
      width,
      "the settings page, top: interface language, the reading voice (system or natural), then the natural voice and system voices sections",
      { full: true },
    );

    await natural(page).scrollIntoViewIfNeeded();
    await scrollTo(page, ".wrap > section.card:nth-of-type(3) .model-row");
    await nsnap(
      page,
      "voices",
      "kokoro-idle",
      width,
      "the natural voice section before its model is downloaded: quality choice, a download button, six voices to preview or use",
    );

    await scrollTo(page, ".wrap > section.card:nth-of-type(4) .voices li:nth-child(3)");
    await nsnap(
      page,
      "voices",
      "system-voices",
      width,
      "the system voices section: the device's voices in the listener's language, each with preview and Use (the voice list is a stand-in for the capture machine's own)",
    );
    // Preview one, then choose it.
    const first = system(page).locator(".voices li").nth(1);
    await first.locator("button.preview").click();
    await settle(page, 400);
    await nsnap(
      page,
      "voices",
      "system-preview",
      width,
      `previewing a system voice: its play button turns to pause while the sample is read (${SPEECH_NOTE})`,
    );
    await first.locator("button.preview").click();
    await first.locator("button.choose").click();
    await settle(page, 300);
    await nsnap(page, "voices", "system-selected", width, "a system voice chosen: its row says Selected");
    // Every language and network voices too.
    for (const box of await system(page).locator(".filters input").all()) await box.uncheck();
    await settle(page, 300);
    await scrollTo(page, ".wrap > section.card:nth-of-type(4) .filters");
    await nsnap(
      page,
      "voices",
      "system-all",
      width,
      "the system voices with both filters off: every language, network voices included",
    );

    // Choosing the natural engine.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await card(page, 1).locator("button.engine").nth(1).click();
    await settle(page, 300);
    await nsnap(page, "settings", "natural-selected", width, "the settings page with the natural voice chosen as the reading voice");
  });

  test(`reader voice menu ${width}`, async ({ page }) => {
    await narrator(page, width);
    await openLibrary(page);
    await openDoc(page, "Meditations");
    await reader.voice(page).click();
    await expect(page.locator(".voices-pop")).toBeVisible();
    await settle(page, 300);
    await nsnap(
      page,
      "voices",
      "reader-voice-menu",
      width,
      "the voice menu open from the player bar in the reader: the system voices with their languages (stand-in voice list)",
    );
  });

  test(`natural voice download blocked ${width}`, async ({ page }) => {
    await narrator(page, width);
    await blockModel(page);
    await openSettings(page);
    await natural(page).locator(`${modelRow} button.ghost`).click();
    await expect(natural(page).locator(`${modelRow} .model-state.err`)).toBeVisible({ timeout: 60_000 });
    await scrollTo(page, ".wrap > section.card:nth-of-type(3) .model-row");
    await nsnap(
      page,
      "narrator-error",
      "kokoro-download-failed",
      width,
      "the natural voice's model failed to download (network blocked for the capture): the failure and a Retry button",
    );
    await natural(page).locator(".voices li").first().locator("button.preview").click();
    await expect(natural(page).locator("p.error")).toBeVisible({ timeout: 60_000 });
    await scrollTo(page, ".wrap > section.card:nth-of-type(3) p.error");
    await nsnap(
      page,
      "narrator-error",
      "kokoro-preview-failed",
      width,
      "previewing a natural voice when its model cannot load (network blocked for the capture): the error under the voice list",
    );
    // Use the natural voice anyway, then listen: the player falls back to the system voice.
    await natural(page).locator(".voices li").first().locator("button.choose").click();
    await page.locator("header.head a.back").click();
    await expect(page.locator(".narrator header.bar")).toBeVisible();
    await openDoc(page, "Meditations");
    await reader.play(page).click();
    await expect(page.locator(".word.current").first()).toBeVisible();
    await page.waitForTimeout(3000);
    await reader.voice(page).click();
    await expect(page.locator(".voices-pop")).toBeVisible();
    await settle(page, 300);
    await nsnap(
      page,
      "narrator-error",
      "kokoro-fallback",
      width,
      `listening with the natural voice chosen while its model cannot load (network blocked for the capture), the voice menu open (${SPEECH_NOTE})`,
    );
  });

  test(`no voices ${width}`, async ({ page }) => {
    await narrator(page, width, { voices: [] });
    await openSettings(page);
    await scrollTo(page, ".wrap > section.card:nth-of-type(4)");
    await nsnap(
      page,
      "narrator-error",
      "no-voices",
      width,
      "the settings page on a device that reports no system voices",
    );
    await openLibrary(page);
    await openAdd(page);
    await nsnap(
      page,
      "narrator-error",
      "no-voices-add",
      width,
      "the add modal on a device that reports no system voices: the voice row falls back to the system default",
    );
  });
}

// The natural voice for real: the model is downloaded from the network (about 90 MB, the
// smaller CPU preset), a voice is previewed, then a document is read with it. One test for
// both widths, because every fresh context has to download the model again.
test("natural voice downloaded and playing", async ({ page }) => {
  test.setTimeout(600_000);
  await narrator(page, "desktop");
  await openSettings(page);
  // The smaller preset runs on the CPU everywhere, headless included.
  await natural(page).locator("button.quality-opt").nth(1).click();
  const client = await page.context().newCDPSession(page);
  await client.send("Network.enable");
  // A slow line, so the download can be shot part-way.
  await client.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 20,
    downloadThroughput: (4 * 1024 * 1024) / 8,
    uploadThroughput: (4 * 1024 * 1024) / 8,
  });
  await natural(page).locator(`${modelRow} button.ghost`).click();
  const state = natural(page).locator(`${modelRow} .model-state`);
  await expect(state).toContainText(/[1-9]\d?\s?%/, { timeout: 120_000 });
  for (const width of WIDTHS) {
    await page.setViewportSize(VIEWPORTS[width]);
    await scrollTo(page, ".wrap > section.card:nth-of-type(3) .model-row");
    await nsnap(
      page,
      "voices",
      "kokoro-downloading",
      width,
      "the natural voice's model downloading, with its percentage (a real download, slowed for the capture)",
    );
  }
  await client.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  await expect(natural(page).locator(`${modelRow} .model-state.ok`)).toBeVisible({ timeout: 400_000 });
  const heart = natural(page).locator(".voices li").first();
  await heart.locator("button.choose").click();
  for (const width of WIDTHS) {
    await page.setViewportSize(VIEWPORTS[width]);
    await scrollTo(page, ".wrap > section.card:nth-of-type(3) .model-row");
    await nsnap(
      page,
      "voices",
      "kokoro-ready",
      width,
      "the natural voice ready after its download: Model ready, a way to clear it, and the first voice selected",
    );
  }
  // Preview: synthesis on the CPU takes a few seconds before the sample plays.
  await heart.locator("button.preview").click();
  await expect(heart.locator("button.preview.playing")).toBeVisible();
  await page.waitForTimeout(1500);
  await page.setViewportSize(VIEWPORTS.desktop);
  await scrollTo(page, ".wrap > section.card:nth-of-type(3) .voices");
  await nsnap(page, "voices", "kokoro-preview", "desktop", "previewing a natural voice: its button shows pause while the sample is prepared and played");
  await heart.locator("button.preview").click();

  // Read a document with it. Back to the library by the page's own link keeps the model loaded.
  await page.locator("header.head a.back").click();
  await expect(page.locator(".narrator header.bar")).toBeVisible();
  await addFile(page, "epub");
  await reader.play(page).click();
  // Real audio: wait for the first sentence to be synthesized and start.
  await expect(page.locator(".word.current").first()).toBeVisible();
  await expect
    .poll(() => page.locator(".scrubber .time").first().textContent(), { timeout: 180_000 })
    .not.toBe("0:00");
  for (const width of WIDTHS) {
    await page.setViewportSize(VIEWPORTS[width]);
    await page.waitForTimeout(1200);
    await nsnap(
      page,
      "listening",
      "natural-playing",
      width,
      "playing with the natural voice (real synthesis, muted for the capture): the marked word follows the audio",
    );
  }
  await reader.voice(page).click();
  await expect(page.locator(".voices-pop")).toBeVisible();
  await settle(page, 300);
  await nsnap(
    page,
    "voices",
    "reader-voice-menu-natural",
    "phone",
    "the voice menu in the reader with the natural voice in use: the six natural voices",
  );
});

test("voice settings in French phone", async ({ page }) => {
  await narrator(page, "phone", { locale: "fr" });
  await openSettings(page);
  await nsnap(page, "settings", "page", "phone", "the settings page, top", { full: true, fr: true });
  await scrollTo(page, ".wrap > section.card:nth-of-type(3) .model-row");
  await nsnap(page, "voices", "kokoro-idle", "phone", "the natural voice section before its model is downloaded", {
    fr: true,
  });
  await scrollTo(page, ".wrap > section.card:nth-of-type(4) .voices li:nth-child(3)");
  await nsnap(page, "voices", "system-voices", "phone", "the system voices section (stand-in voice list)", {
    fr: true,
  });
});

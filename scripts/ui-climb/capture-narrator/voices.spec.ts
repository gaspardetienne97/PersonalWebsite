// Voice settings (/pdf/settings): the page, system voices, the natural (Kokoro) voice and its
// download states, the voice menu in the reader, and what happens when voices are missing or
// the natural voice cannot load.
import { expect, test } from "@playwright/test";
import { VIEWPORTS, WIDTHS, scrollTo, settle } from "../capture-common.ts";
import {
  SPEECH_NOTE,
  VOICES,
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

// The settings page has two cards: the interface language, then the reading voice. The voice
// card names the voice in use, then a System or Natural switch picks which list shows under it.
type P = import("@playwright/test").Page;
const voiceCard = ".wrap > section.card:not(.lang-card)";
const tab = (page: P, which: "system" | "natural") =>
  page.locator(".switch .seg").nth(which === "system" ? 0 : 1);
const rows = (page: P) => page.locator(`${voiceCard} .voices li`);
const modelRow = ".model-row";

/** Show the natural voice's list on the settings page. */
async function showNatural(page: P) {
  await tab(page, "natural").click();
  await expect(page.locator(modelRow)).toBeVisible();
  await settle(page, 300);
}

for (const width of WIDTHS) {
  test(`voice settings page ${width}`, async ({ page }) => {
    await narrator(page, width);
    await openSettings(page);
    await nsnap(
      page,
      "settings",
      "page",
      width,
      "the Settings page: the interface language, then the reading voice in use and a System or Natural switch with the system voices listed under it",
      { full: true },
    );
    if (width === "desktop") {
      await page.evaluate(() => window.scrollTo({ top: 520, behavior: "instant" }));
      await settle(page, 300);
      await nsnap(
        page,
        "settings",
        "page-scrolled",
        width,
        "the Settings page scrolled part-way down: the title and the way back stay at the top while the voices scroll under them",
      );
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    }

    await scrollTo(page, `${voiceCard} .voices li:nth-child(3)`);
    await nsnap(
      page,
      "voices",
      "system-voices",
      width,
      "the system voices: the device's voices in the listener's language, each with a preview button and Use, the one in use marked (the voice list is a stand-in for the capture machine's own)",
    );
    // Preview one, then choose it.
    const second = rows(page).nth(1);
    await second.locator("button.preview").click();
    await expect(second.locator("button.preview.playing")).toBeVisible();
    await expect(second.locator(".sample .word.current")).toBeVisible();
    await settle(page, 400);
    await nsnap(
      page,
      "voices",
      "system-preview",
      width,
      `previewing a system voice: its button shows pause inside a ring that fills, and the sentence being read shows under the row with the current word marked (${SPEECH_NOTE})`,
    );
    await second.locator("button.preview").click();
    await second.locator("button.choose").click();
    await expect(second.locator(".in-use")).toBeVisible();
    await settle(page, 300);
    await nsnap(
      page,
      "voices",
      "system-selected",
      width,
      "a system voice chosen: its row says it is in use and the summary at the top names it",
    );
    // Every language (the second chip), and the voices that need the internet too.
    await page.locator(".filters .chip").nth(1).click();
    await page.locator(`${voiceCard} button.more`).click();
    await settle(page, 300);
    await scrollTo(page, `${voiceCard} .filters`);
    await nsnap(
      page,
      "voices",
      "system-all",
      width,
      "the system voices with every language shown and the voices that need the internet included",
    );

    // The natural voices, before any download.
    await showNatural(page);
    await scrollTo(page, modelRow);
    await nsnap(
      page,
      "voices",
      "kokoro-idle",
      width,
      'the Natural list before its download: what a natural voice is, a button that names the download\'s size, and six voices, each marked "Download to preview" with "Use when ready"',
    );
    await page.locator("details.size summary").click();
    await settle(page, 300);
    await scrollTo(page, "details.size");
    await nsnap(
      page,
      "voices",
      "kokoro-size",
      width,
      "the Natural list with the download's size opened: the sizes this device can use and whether the graphics chip is used",
    );
    await page.locator("details.size summary").click();

    // "Use when ready" on a row chooses a natural voice before its download.
    await rows(page).first().locator("button.choose").click();
    await expect(rows(page).first().locator(".in-use")).toBeVisible();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await settle(page, 300);
    await nsnap(
      page,
      "settings",
      "natural-selected",
      width,
      'the Settings page with a natural voice chosen before its download: the summary names it and says "Reads after the download", and its row says it is in use',
    );
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
      "the voice menu open from the player bar in the reader: the voice in use first, then the natural and system voices with a preview button each, languages in words (stand-in voice list)",
    );
    const preview = page.locator(".voices-pop button.preview").first();
    await preview.click();
    await expect(page.locator(".voices-pop button.preview.on")).toBeVisible();
    await settle(page, 400);
    await nsnap(
      page,
      "voices",
      "voice-preview",
      width,
      `the reader's voice menu while a voice is previewed: its button shows it is playing (${SPEECH_NOTE})`,
    );
    await page.locator(".voices-pop button.preview.on").click();
  });

  test(`natural voice download blocked ${width}`, async ({ page }) => {
    await narrator(page, width);
    await blockModel(page);
    await openSettings(page);
    await showNatural(page);
    await page.locator(`${modelRow} .download-btn`).click();
    await expect(page.locator(`${modelRow} .notice`)).toBeVisible({ timeout: 60_000 });
    await scrollTo(page, modelRow);
    await nsnap(
      page,
      "narrator-error",
      "kokoro-download-failed",
      width,
      "the natural voice failed to download (network blocked for the capture): a notice with the reason and what to do next",
    );
    await rows(page).first().locator("button.preview").click();
    await expect(page.locator(".voices li .notice")).toBeVisible({ timeout: 60_000 });
    await scrollTo(page, ".voices li .notice");
    await nsnap(
      page,
      "narrator-error",
      "kokoro-preview-failed",
      width,
      "previewing a natural voice that cannot load (network blocked for the capture): the notice under that voice's row, with Retry and a way to the system voice",
    );
    // Use the natural voice anyway, then listen: the player falls back to the system voice.
    await rows(page).first().locator("button.choose").click();
    await page.locator("header.head a.back").click();
    await expect(page.locator(".narrator header.bar")).toBeVisible();
    await openDoc(page, "Meditations");
    await reader.play(page).click();
    await expect(page.locator(".float-dock .notice.warn")).toBeVisible({ timeout: 90_000 });
    await expect(page.locator(".word.current").first()).toBeVisible();
    await page.waitForTimeout(3000);
    await nsnap(
      page,
      "narrator-error",
      "kokoro-fallback",
      width,
      `listening with a natural voice chosen that cannot load (network blocked for the capture): a one-line amber notice on the player's top edge says the system voice is reading, with a way to try again and a close button (${SPEECH_NOTE})`,
    );
    await reader.voice(page).click();
    await expect(page.locator(".voices-pop")).toBeVisible();
    await settle(page, 300);
    await nsnap(
      page,
      "narrator-error",
      "kokoro-fallback-menu",
      width,
      `the same moment with the voice menu open: it sits clear above the notice (${SPEECH_NOTE})`,
    );
  });

  test(`no voices ${width}`, async ({ page }) => {
    await narrator(page, width, { voices: [] });
    await openSettings(page);
    await expect(page.locator(`${voiceCard} .notice`)).toBeVisible();
    await nsnap(
      page,
      "narrator-error",
      "no-voices",
      width,
      "the Settings page on a device that reports no system voices: a notice says so and offers the natural voice",
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

  test(`filters hide every voice ${width}`, async ({ page }) => {
    // A device whose English voices all come over the network, and whose own voices are French.
    await narrator(page, width, {
      voices: VOICES.filter((v) => !v.localService || v.lang.startsWith("fr")),
    });
    await openSettings(page);
    await expect(rows(page).first()).toBeVisible();
    await scrollTo(page, `${voiceCard} .switch`);
    await nsnap(
      page,
      "voices",
      "network-only",
      width,
      "the system voices on a device whose voices in the listener's language all need the internet: they are listed and marked as such, with a button to hide them",
    );
    // Hide the voices that need the internet: none is left in this language.
    await page.locator(`${voiceCard} button.more`).click();
    await expect(page.locator(`${voiceCard} .notice`)).toBeVisible();
    await scrollTo(page, `${voiceCard} .notice`);
    await nsnap(
      page,
      "narrator-error",
      "filters-hide-all",
      width,
      "the system voices when hiding the internet voices leaves none in the listener's language: a notice says why, with a button to show them again and a link to every language",
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
  await showNatural(page);
  await page.locator("details.size summary").click();
  await page.locator("button.quality-opt").nth(1).click();
  await page.locator("details.size summary").click();
  const client = await page.context().newCDPSession(page);
  await client.send("Network.enable");
  // A slow line, so the download can be shot part-way.
  await client.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 20,
    downloadThroughput: (4 * 1024 * 1024) / 8,
    uploadThroughput: (4 * 1024 * 1024) / 8,
  });
  await page.locator(`${modelRow} .download-btn`).click();
  const state = page.locator(`${modelRow} .model-state`);
  await expect(state).toContainText(/[1-9]\d?\s?%/, { timeout: 120_000 });
  for (const width of WIDTHS) {
    await page.setViewportSize(VIEWPORTS[width]);
    await scrollTo(page, modelRow);
    await nsnap(
      page,
      "voices",
      "kokoro-downloading",
      width,
      "the natural voice downloading: a bar, the percentage and the megabytes so far (a real download, slowed for the capture)",
    );
  }
  await client.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  await expect(page.locator(`${modelRow} .model-state.ok`)).toBeVisible({
    timeout: 400_000,
  });
  const heart = rows(page).first();
  await heart.locator("button.choose").click();
  for (const width of WIDTHS) {
    await page.setViewportSize(VIEWPORTS[width]);
    await scrollTo(page, modelRow);
    await nsnap(
      page,
      "voices",
      "kokoro-ready",
      width,
      'the natural voice ready after its download: "Downloaded. Works offline." with a way to clear the download, and the first voice in use',
    );
  }
  // Preview: synthesis on the CPU takes a few seconds before the sample plays.
  await heart.locator("button.preview").click();
  // On the CPU the sample takes up to a minute to prepare (a spinner) before the audio starts.
  await expect(heart.locator("button.preview.playing")).toBeVisible({ timeout: 150_000 });
  await expect(heart.locator(".sample .word.current")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(800);
  await page.setViewportSize(VIEWPORTS.desktop);
  await scrollTo(page, `${voiceCard} .voices`);
  await nsnap(
    page,
    "voices",
    "kokoro-preview",
    "desktop",
    "previewing a natural voice: its button shows pause inside a ring that fills while the sample plays, and the sentence being read shows under the row with the current word marked",
  );
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
  await nsnap(page, "settings", "page", "phone", "the Settings page", {
    full: true,
    fr: true,
  });
  await scrollTo(page, `${voiceCard} .voices li:nth-child(3)`);
  await nsnap(page, "voices", "system-voices", "phone", "the system voices (stand-in voice list)", {
    fr: true,
  });
  await showNatural(page);
  await scrollTo(page, modelRow);
  await nsnap(page, "voices", "kokoro-idle", "phone", "the Natural list before its download", {
    fr: true,
  });
});

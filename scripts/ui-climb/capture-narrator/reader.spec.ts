// A document open (paused), listening (playing, the word marked), and chapters.
import { expect, test } from "@playwright/test";
import { WIDTHS, settle } from "../capture-common.ts";
import {
  SPEECH_NOTE,
  addFile,
  narrator,
  nsnap,
  openDoc,
  openLibrary,
  play,
  reader,
  seek,
} from "./narrator.ts";

for (const width of WIDTHS) {
  test(`reader paused ${width}`, async ({ page }) => {
    await narrator(page, width);
    await openLibrary(page);
    await addFile(page, "pdf");
    await nsnap(
      page,
      "reader",
      "flow-start",
      width,
      "an uploaded PDF just opened, paused at its start, in the Flow view: one sentence at a time, large, with the player bar below",
    );
    await reader.document(page).click();
    await settle(page, 400);
    await nsnap(
      page,
      "reader",
      "document-start",
      width,
      "the same document in the Document view: the whole text scrolling, paused at the start",
    );
    await seek(page, 0.45);
    await nsnap(
      page,
      "reader",
      "document-middle",
      width,
      "the Document view after jumping to the middle with the scrubber, paused: read words dimmed, the current sentence and word marked",
    );
    await reader.settings(page).click();
    await expect(page.locator(".settings-pop")).toBeVisible();
    await settle(page, 300);
    await nsnap(
      page,
      "settings",
      "reader-panel",
      width,
      "the reader's settings panel open over a document: voice engine, text size, line spacing, accent colour, language",
    );
    // Larger text, to show a setting taking effect.
    await page.locator(".settings-pop input[type=range]").first().fill("27");
    await settle(page, 300);
    await nsnap(
      page,
      "settings",
      "reader-panel-large-text",
      width,
      "the reader's settings panel after raising the text size to 27 px, the document behind it follows",
    );
  });

  test(`reader resume ${width}`, async ({ page }) => {
    await narrator(page, width);
    await openLibrary(page);
    await openDoc(page, "The Time Machine");
    await nsnap(
      page,
      "reader",
      "resume",
      width,
      "a document reopened from the library part-way through (18 percent), paused where listening stopped, Flow view",
    );
  });

  test(`listening ${width}`, async ({ page }) => {
    await narrator(page, width);
    await openLibrary(page);
    await addFile(page, "epub");
    await play(page, 5200);
    await nsnap(
      page,
      "listening",
      "flow-playing",
      width,
      `playing in the Flow view: the sentence being read is large with the current word marked, the play button shows pause, time and position move (${SPEECH_NOTE})`,
    );
    await reader.document(page).click();
    await page.waitForTimeout(2600);
    await nsnap(
      page,
      "listening",
      "document-playing",
      width,
      `playing in the Document view: the current word marked inside the lit sentence, words already read dimmed (${SPEECH_NOTE})`,
    );
    await reader.speed(page).click();
    await expect(page.locator(".pop").first()).toBeVisible();
    await settle(page, 250);
    await nsnap(
      page,
      "listening",
      "speed-menu",
      width,
      `the speed menu open while playing, from 0.75x to 3x (${SPEECH_NOTE})`,
    );
    await page.locator(".pop .pop-item").nth(3).click();
    await expect(page.locator(".pop")).toHaveCount(0);
    await page.waitForTimeout(1800);
    await nsnap(
      page,
      "listening",
      "speed-fast",
      width,
      `playing at 1.5x after choosing it from the speed menu (${SPEECH_NOTE})`,
    );
    await reader.play(page).click();
    await settle(page, 300);
    await reader.flow(page).click();
    await settle(page, 400);
    await nsnap(
      page,
      "listening",
      "paused-mid-sentence",
      width,
      "paused in the middle of a sentence, Flow view: the play button is back and the word stays marked",
    );
  });

  test(`chapters ${width}`, async ({ page }) => {
    await narrator(page, width);
    await openLibrary(page);
    await addFile(page, "epub");
    await reader.chapters(page).click();
    await expect(page.locator(".chapters-pop")).toBeVisible();
    await settle(page, 300);
    await nsnap(
      page,
      "chapters",
      "list",
      width,
      "the chapter list open from the player bar on an EPUB with three chapters: numbers, titles, lengths, the current chapter marked",
    );
    await page.locator(".chapters-pop .row").nth(2).click();
    await expect(page.locator(".chapters-pop")).toHaveCount(0);
    await settle(page, 400);
    await nsnap(
      page,
      "chapters",
      "after-jump",
      width,
      "after choosing the third chapter: the Flow view shows that chapter's name and first sentence, the scrubber has moved",
    );
    await reader.document(page).click();
    await settle(page, 500);
    await nsnap(
      page,
      "chapters",
      "document-chapter",
      width,
      "the third chapter in the Document view, with its title above the text",
    );
    await reader.chapters(page).click();
    await expect(page.locator(".chapters-pop")).toBeVisible();
    await settle(page, 300);
    await nsnap(
      page,
      "chapters",
      "list-third",
      width,
      "the chapter list reopened, the third chapter now marked as current",
    );
  });
}

test("chapters with a long title desktop", async ({ page }) => {
  await narrator(page, "desktop");
  await openLibrary(page);
  await openDoc(page, "Designing Data-Intensive");
  await reader.chapters(page).click();
  await expect(page.locator(".chapters-pop")).toBeVisible();
  await settle(page, 300);
  await nsnap(
    page,
    "chapters",
    "list-long-title",
    "desktop",
    "the chapter list on a sample whose chapter has a long title (Reliable, Scalable, Maintainable): the title in full beside its length",
  );
});

test("reader, listening and chapters in French phone", async ({ page }) => {
  await narrator(page, "phone", { locale: "fr" });
  await openLibrary(page);
  await addFile(page, "epub");
  await nsnap(
    page,
    "reader",
    "flow-start",
    "phone",
    "an uploaded EPUB just opened, paused, Flow view (the book is in English)",
    {
      fr: true,
    },
  );
  await reader.chapters(page).click();
  await expect(page.locator(".chapters-pop")).toBeVisible();
  await settle(page, 300);
  await nsnap(page, "chapters", "list", "phone", "the chapter list open from the player bar", {
    fr: true,
  });
  await page.locator(".chapters-pop .row").nth(0).click();
  await play(page, 4200);
  await nsnap(
    page,
    "listening",
    "flow-playing",
    "phone",
    `playing in the Flow view (${SPEECH_NOTE})`,
    {
      fr: true,
    },
  );
  await reader.speed(page).click();
  await expect(page.locator(".pop").first()).toBeVisible();
  await settle(page, 250);
  await nsnap(page, "listening", "speed-menu", "phone", "the speed menu open while playing", {
    fr: true,
  });
  // Menus close on a press anywhere outside them.
  await page.mouse.click(12, 200);
  await expect(page.locator(".pop")).toHaveCount(0);
  await reader.play(page).click();
  await reader.settings(page).click();
  await expect(page.locator(".settings-pop")).toBeVisible();
  await settle(page, 300);
  await nsnap(
    page,
    "settings",
    "reader-panel",
    "phone",
    "the reader's settings panel open over a document",
    {
      fr: true,
    },
  );
});

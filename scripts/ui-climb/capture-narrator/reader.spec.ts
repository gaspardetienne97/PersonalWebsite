// A document open (paused), listening (playing, the word marked), and chapters.
import { expect, test } from "@playwright/test";
import { WIDTHS, settle } from "../capture-common.ts";
import {
  FILES,
  SPEECH_NOTE,
  addFile,
  backToLibrary,
  chooseFile,
  narrator,
  nsnap,
  openAdd,
  openDoc,
  openLibrary,
  play,
  reader,
  seek,
} from "./narrator.ts";

const lineNotice = ".float-dock .notice.line";

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
      width === "phone"
        ? "an uploaded PDF just opened, paused at its start, in the Flow view: the chapter's heading as a title and the first sentence large under it, with the player below (Repeat, Previous, Play, Next, names under three of them)"
        : "an uploaded PDF just opened, paused at its start, in the Flow view: the chapter's heading as a title and the first sentence large under it, with the player bar below",
    );
    await reader.document(page).click();
    await settle(page, 400);
    if (width === "phone") {
      // Below 900 px the switch has no words in it, so its first use says what the view is.
      await expect(page.locator(".view-hint")).toBeVisible();
      await nsnap(
        page,
        "reader",
        "view-hint",
        width,
        "the first press of the Flow or Document switch on a phone: a line under the top bar says what changes in the Document view (it stays until the next press)",
      );
      await page.keyboard.press("Escape");
      await expect(page.locator(".view-hint")).toHaveCount(0, { timeout: 12_000 });
    }
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
      "the reader's settings panel open over a document on its Text tab: three tabs (Text, Colour, Voice and language), text size and line spacing with step buttons and their values as a share of the default, and the reading face, Sans or Serif",
    );
    const tabs = page.locator(".settings-pop [role=tab]");
    await tabs.nth(1).click();
    await settle(page, 300);
    await nsnap(
      page,
      "settings",
      "reader-panel-colour",
      width,
      "the reader's settings panel on its Colour tab: the accent colours by name, a sample sentence with the marked word, and Match each document",
    );
    await tabs.nth(2).click();
    await settle(page, 300);
    await nsnap(
      page,
      "settings",
      "reader-panel-voice",
      width,
      "the reader's settings panel on its Voice and language tab: System or Natural with what each means, the link to the full Settings page, and the interface language under its own heading",
    );
    await tabs.nth(0).click();
    await settle(page, 200);
    // The reading face: Serif is the second choice.
    await page.locator(".settings-pop .seg button").nth(1).click();
    await settle(page, 300);
    await nsnap(
      page,
      "settings",
      "reader-panel-serif",
      width,
      "the reader's settings panel after choosing Serif as the reading face: the document behind it is set in the serif face",
    );
    await page.locator(".settings-pop .seg button").nth(0).click();
    // Larger text, to show a setting taking effect.
    await page.locator(".settings-pop input[type=range]").first().fill("27");
    await settle(page, 300);
    const share =
      (await page
        .locator(".settings-pop input[type=range]")
        .first()
        .getAttribute("aria-valuetext")) ?? "";
    await nsnap(
      page,
      "settings",
      "reader-panel-large-text",
      width,
      `the reader's settings panel after raising the text size (it reads ${share}, a share of the default, with a Reset button beside it), the document behind it follows`,
    );
  });

  test(`reader resume ${width}`, async ({ page }) => {
    await narrator(page, width);
    await openLibrary(page);
    // Listen part of the way, leave, and come back.
    await openDoc(page, "The Time Machine");
    await seek(page, 0.18);
    await backToLibrary(page);
    await openDoc(page, "The Time Machine");
    await expect(page.locator(lineNotice)).toBeVisible();
    const said = ((await page.locator(lineNotice).textContent()) ?? "").match(/\d+\s?%/)?.[0];
    await nsnap(
      page,
      "reader",
      "resume",
      width,
      `a document reopened from the library part-way through (${said ?? "about 18 %"}), paused where listening stopped, Flow view: a line on the player's top edge says where it picks up and offers to start over`,
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
    // On a phone the first use of the switch shows its hint (shot in the reader flow): it stays
    // until the next press, so close it, and these screens show listening and nothing else.
    await page.keyboard.press("Escape");
    await expect(page.locator(".view-hint")).toHaveCount(0, { timeout: 12_000 });
    await page.waitForTimeout(2600);
    await nsnap(
      page,
      "listening",
      "document-playing",
      width,
      `playing in the Document view: the current word marked inside the lit sentence, the chapter's heading in view, words already read dimmed (${SPEECH_NOTE})`,
    );
    await reader.speed(page).click();
    await expect(page.locator(".pop").first()).toBeVisible();
    await settle(page, 250);
    await nsnap(
      page,
      "listening",
      "speed-menu",
      width,
      `the speed menu open while playing: one readout between slower and faster step buttons, and presets from 0.75x to 3x (${SPEECH_NOTE})`,
    );
    await page.locator(".pop .speed-preset").nth(3).click();
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
      "the chapter list open from the player bar on an EPUB with three chapters: a heading with the count and a close button, numbers, titles, lengths, the current chapter marked, the Chapters chip shown pressed and the page dimmed behind",
    );
    await page.locator(".chapters-pop .row").nth(2).click();
    await expect(page.locator(".chapters-pop")).toHaveCount(0);
    await expect(page.locator(lineNotice)).toBeVisible();
    await page.mouse.move(2, 2);
    await settle(page, 400);
    await nsnap(
      page,
      "chapters",
      "after-jump",
      width,
      width === "phone"
        ? "after choosing the third chapter: the Flow view shows that chapter's name and first sentence, the scrubber has moved, and a one-row line on the player's top edge names the chapter with Undo"
        : "after choosing the third chapter: the Flow view shows that chapter's name and first sentence, the scrubber has moved, and a line on the player's top edge names the chapter with \"Back to Chapter 1, 0:00\"",
    );
    // The line goes by itself after a few seconds.
    await expect(page.locator(lineNotice)).toHaveCount(0, { timeout: 12_000 });
    if (width === "desktop") {
      // Pointer over the scrubber: a tip names the chapter and the time under the pointer.
      const track = await reader.track(page).boundingBox();
      if (track) {
        await page.mouse.move(track.x + track.width * 0.5, track.y + track.height / 2);
        await expect(page.locator(".scrubber .tip")).toBeVisible();
        await settle(page, 250);
        await nsnap(
          page,
          "chapters",
          "tick-hover",
          width,
          "pointer over the scrubber, which has a tick at each chapter's start: a tip names the chapter and the time under the pointer",
          { keepMouse: true },
        );
        await page.mouse.move(2, 2);
      }
    }
    // Reopened in the same view as the jump (Flow).
    await reader.chapters(page).click();
    await expect(page.locator(".chapters-pop")).toBeVisible();
    await settle(page, 300);
    await nsnap(
      page,
      "chapters",
      "list-third",
      width,
      "the chapter list reopened in the Flow view, the third chapter now marked as current",
    );
    await page.locator(".chapters-pop .pop-close").click();
    await expect(page.locator(".chapters-pop")).toHaveCount(0);
    await reader.document(page).click();
    // The first use of the switch on a phone shows its hint until the next press: close it.
    await page.keyboard.press("Escape");
    await expect(page.locator(".view-hint")).toHaveCount(0, { timeout: 12_000 });
    await settle(page, 500);
    await nsnap(
      page,
      "chapters",
      "document-chapter",
      width,
      "the third chapter in the Document view, with its title above the text and a full line of room under the top bar",
    );
  });

  test(`reader marks ${width}`, async ({ page }) => {
    await narrator(page, width);
    await openLibrary(page);
    await addFile(page, "pdf");
    // About a second in: the chapter's heading is being read, as a title.
    await reader.play(page).click();
    await expect(page.locator(".word.current").first()).toBeVisible();
    await page.waitForTimeout(700);
    await reader.play(page).click();
    await settle(page, 400);
    await nsnap(
      page,
      "reader",
      "flow-title",
      width,
      `Walden in the Flow view, paused about a second in: the chapter's heading ("Economy") shown as a title with the word mark on it, the first sentence large under it (${SPEECH_NOTE})`,
    );
    await reader.document(page).click();
    await page.keyboard.press("Escape");
    await expect(page.locator(".view-hint")).toHaveCount(0, { timeout: 12_000 });
    // Play on and pause the moment the one-letter word "I" is marked.
    const caught = await page.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          const playButton = document.querySelector<HTMLButtonElement>(".root button.play");
          playButton?.click();
          const until = performance.now() + 10_000;
          const look = () => {
            const word = document.querySelector(".word.current")?.textContent?.trim();
            if (word === "I") {
              playButton?.click();
              resolve(true);
            } else if (performance.now() > until) {
              playButton?.click();
              resolve(false);
            } else requestAnimationFrame(look);
          };
          requestAnimationFrame(look);
        }),
    );
    await settle(page, 400);
    if (caught)
      await nsnap(
        page,
        "reader",
        "one-letter-word",
        width,
        `the Document view paused on the one-letter word "I": the word mark is drawn as a small pill, not a caret (${SPEECH_NOTE})`,
      );
  });
}

for (const width of WIDTHS) {
  test(`chapters: one chapter, and a long title ${width}`, async ({ page }) => {
    await narrator(page, width);
    await openLibrary(page);
    // This sample is a single chapter: there is nothing to choose between, so no Chapters chip.
    await openDoc(page, "Designing Data-Intensive");
    await expect(page.locator(".root .extras .chip")).toHaveCount(2);
    await nsnap(
      page,
      "chapters",
      "one-chapter",
      width,
      "a document with a single chapter: the player has speed and voice only, no Chapters chip",
    );
    await backToLibrary(page);
    // A text file whose second chapter has a very long title.
    await openAdd(page);
    await chooseFile(page, FILES.longTitles);
    await expect(page.locator(".root .top")).toBeVisible({ timeout: 30_000 });
    await settle(page, 400);
    await reader.chapters(page).click();
    await expect(page.locator(".chapters-pop")).toBeVisible();
    await settle(page, 300);
    await nsnap(
      page,
      "chapters",
      "list-long-title",
      width,
      "the chapter list on a text file whose third chapter has a very long title: the title shows in full, wrapped, with its start time and length",
    );
  });
}

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
  // Close the list by its own button: choosing a chapter would leave its "Back to" line up.
  await page.locator(".chapters-pop .pop-close").click();
  await expect(page.locator(".chapters-pop")).toHaveCount(0);
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

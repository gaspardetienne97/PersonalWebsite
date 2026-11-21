// The library: a first visit (the four sample documents), an emptied library, and a library
// in use with uploaded PDF, EPUB and text files and listening progress.
import { expect, test } from "@playwright/test";
import { WIDTHS, settle } from "../capture-common.ts";
import {
  SPEECH_NOTE,
  backToLibrary,
  narrator,
  nsnap,
  openLibrary,
  play,
  usedLibrary,
} from "./narrator.ts";

type P = import("@playwright/test").Page;

/** Open a card's "More" menu and choose Remove, its second item: the card then asks to confirm. */
async function askToRemove(card: import("@playwright/test").Locator) {
  await card.locator("button.more").click();
  await card.locator(".menu button").nth(1).click();
}

/** Remove every document left, the way a listener would, and wait for the last notice to go. */
async function emptyLibrary(page: P) {
  const cards = page.locator(".grid .card");
  while (await cards.count()) {
    await askToRemove(cards.first());
    await cards.first().locator(".confirm .remove").click();
  }
  await expect(page.locator(".empty")).toBeVisible();
  // The "removed, Undo" notice stays while the pointer rests on it: move away, then wait it out.
  await page.mouse.move(2, 2);
  await expect(page.locator(".toast")).toHaveCount(0, { timeout: 10_000 });
  await settle(page, 300);
}

for (const width of WIDTHS) {
  test(`library first visit and emptied ${width}`, async ({ page }) => {
    await narrator(page, width);
    await openLibrary(page);
    await nsnap(
      page,
      "library-empty",
      "first-visit",
      width,
      width === "desktop"
        ? "first visit, nothing added by the listener: an invitation to add a first document (or try a sample) beside a live line from a sample, the mark moving from word to word at the pace of speech (caught on one word), then four documents labelled as samples"
        : "first visit, nothing added by the listener: an invitation to add a first document (or try a sample), then four documents labelled as samples",
      { full: true },
    );

    // Remove the samples one by one, the way a listener would, down to an empty library.
    await emptyLibrary(page);
    await nsnap(
      page,
      "library-empty",
      "empty",
      width,
      "an empty library, after every document was removed: one invitation to add a document, and Bring back the samples",
      { full: true },
    );
  });

  if (width === "desktop")
    test("library first visit, reduced motion", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await narrator(page, width);
      await openLibrary(page);
      await nsnap(
        page,
        "library-empty",
        "first-visit-reduced-motion",
        width,
        "first visit with reduced motion turned on: the sample line beside the invitation rests on one word and does not move",
      );
    });

  test(`library first visit, a sample played ${width}`, async ({ page }) => {
    await narrator(page, width);
    await openLibrary(page);
    // "Try a sample" is the invitation's second button.
    await page.locator(".add-hero .hero-actions button").nth(1).click();
    await expect(page.locator(".root .top")).toBeVisible();
    await settle(page, 400);
    await play(page, 6000);
    await backToLibrary(page);
    await expect(page.locator(".hero")).toBeVisible();
    await nsnap(
      page,
      "library-empty",
      "first-visit-played",
      width,
      `first visit after trying a sample for a few seconds: the invitation gives way to a continue card with the real progress and time left (${SPEECH_NOTE})`,
      { full: true },
    );
  });

  test(`library in use ${width}`, async ({ page }) => {
    await narrator(page, width);
    await usedLibrary(page);
    await nsnap(
      page,
      "library",
      "grid",
      width,
      width === "phone"
        ? "the library with seven documents (an uploaded PDF, EPUB and text file beside the samples): continue listening, then the documents as rows with their length, progress and format"
        : "the library with seven documents (an uploaded PDF, EPUB and text file beside the samples): continue listening, then the grid with lengths, progress and formats",
      { full: true },
    );
    if (width === "desktop") {
      await page.locator(".grid .card").nth(1).hover();
      await settle(page, 400);
      await nsnap(
        page,
        "library",
        "card-hover",
        width,
        "the library, pointer over a document card",
        {
          keepMouse: true,
        },
      );
      await page.mouse.move(2, 2);
    }

    // Removing: "More" on a card, then Remove, then the card asks to confirm.
    const card = page.locator(".grid .card").nth(1);
    await card.scrollIntoViewIfNeeded();
    await card.locator("button.more").click();
    await expect(card.locator(".menu")).toBeVisible();
    await settle(page, 250);
    await nsnap(
      page,
      "library",
      "library-menu",
      width,
      'a document\'s "More" menu open: listen or resume, and Remove from library',
    );
    await card.locator(".menu button").nth(1).click();
    await expect(card.locator(".confirm")).toBeVisible();
    await settle(page, 250);
    await nsnap(
      page,
      "library",
      "remove-confirm",
      width,
      width === "phone"
        ? "removing a document on a phone, from its More menu: the row asks to confirm, with Cancel first"
        : "removing a document, from its More menu: the card asks to confirm, with Cancel first",
    );
    await card.locator(".confirm .remove").click();
    await expect(page.locator(".toast")).toBeVisible();
    // The notice goes after eight seconds unless the pointer rests on it: rest there for the shots.
    await page.locator(".toast .toast-line").hover();
    await settle(page, 250);
    await nsnap(
      page,
      "library",
      "removed-undo",
      width,
      "just after removing a document from a library of seven: a one-line notice at the bottom edge names it and offers Undo, the continue card and the six left above it",
      { keepMouse: true },
    );
    await page.evaluate(() => {
      const scroller = document.scrollingElement ?? document.documentElement;
      scroller.scrollTo({ top: scroller.scrollHeight, behavior: "instant" });
      for (const el of document.querySelectorAll<HTMLElement>(".narrator, .narrator .page"))
        el.scrollTo({ top: el.scrollHeight, behavior: "instant" });
    });
    await page.locator(".toast .toast-line").hover();
    await settle(page, 250);
    await nsnap(
      page,
      "library",
      "removed-undo-bottom",
      width,
      "the same notice with the library scrolled to its end: the last cards sit clear above it",
      { keepMouse: true },
    );
    await page.locator(".toast button").first().click();
    await expect(page.locator(".toast")).toHaveCount(0);
    await page.mouse.move(2, 2);
    await page.evaluate(() => {
      (document.scrollingElement ?? document.documentElement).scrollTo({ top: 0 });
      for (const el of document.querySelectorAll<HTMLElement>(".narrator, .narrator .page"))
        el.scrollTo({ top: 0 });
    });
    await settle(page, 300);

    const search = page.locator(".search-wrap input");
    await search.fill("al");
    await settle(page, 300);
    await nsnap(
      page,
      "library",
      "search",
      width,
      "the library searched for 'al': four documents match, the count says so and the matching letters are marked",
    );
    await search.fill("zebra");
    await settle(page, 300);
    await nsnap(
      page,
      "library",
      "search-none",
      width,
      "the library searched for a word nothing matches: a message naming the search and a button to clear it",
    );
  });
}

test("library in French phone", async ({ page }) => {
  await narrator(page, "phone", { locale: "fr" });
  await usedLibrary(page);
  await nsnap(page, "library", "grid", "phone", "the library with seven documents", {
    full: true,
    fr: true,
  });
  await emptyLibrary(page);
  await nsnap(page, "library-empty", "empty", "phone", "an empty library", {
    full: true,
    fr: true,
  });
});

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

/** Remove every document left, the way a listener would, and wait for the last notice to go. */
async function emptyLibrary(page: P) {
  const cards = page.locator(".grid .card");
  while (await cards.count()) {
    await cards.first().hover();
    await cards.first().locator("button.trash").click();
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
      "first visit, nothing added by the listener: an invitation to add a first document (or try a sample), then four documents labelled as samples",
      { full: true },
    );

    // Remove the samples one by one, the way a listener would, down to an empty library.
    const cards = page.locator(".grid .card");
    await cards.first().hover();
    await cards.first().locator("button.trash").click();
    await settle(page, 250);
    await nsnap(
      page,
      "library",
      "remove-confirm",
      width,
      width === "phone"
        ? "removing a document on a phone: the row asks to confirm"
        : "removing a document: the card asks to confirm",
      { keepMouse: true },
    );
    await cards.first().locator(".confirm .remove").click();
    await expect(page.locator(".toast")).toBeVisible();
    await settle(page, 250);
    await nsnap(
      page,
      "library",
      "removed-undo",
      width,
      "just after removing a document: a notice names it and offers Undo",
    );
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
    }
    const search = page.locator(".search-wrap input");
    await search.fill("al");
    await settle(page, 300);
    await nsnap(
      page,
      "library",
      "search",
      width,
      "the library searched for 'al': two documents match",
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

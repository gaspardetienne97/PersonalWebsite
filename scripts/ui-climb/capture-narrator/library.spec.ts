// The library: a first visit (the four sample documents), an emptied library, and a library
// in use with uploaded PDF, EPUB and text files and listening progress.
import { expect, test } from "@playwright/test";
import { WIDTHS, settle } from "../capture-common.ts";
import { narrator, nsnap, openLibrary, usedLibrary } from "./narrator.ts";

for (const width of WIDTHS) {
  test(`library first visit and emptied ${width}`, async ({ page }) => {
    await narrator(page, width);
    await openLibrary(page);
    await nsnap(
      page,
      "library-empty",
      "first-visit",
      width,
      "first visit, nothing added by the listener: the app opens with four sample documents and offers to continue one of them",
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
      "removing a document: the card asks to confirm",
      { keepMouse: true },
    );
    await cards.first().locator(".confirm .remove").click();
    while (await cards.count()) {
      await cards.first().hover();
      await cards.first().locator("button.trash").click();
      await cards.first().locator(".confirm .remove").click();
    }
    await expect(page.locator(".empty")).toBeVisible();
    await settle(page, 300);
    await nsnap(
      page,
      "library-empty",
      "empty",
      width,
      "an empty library, after every document was removed: the invitation to add a first document",
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
      "the library with seven documents (an uploaded PDF, EPUB and text file beside the samples): continue listening, then the grid with progress rings and lengths",
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
      "the library searched for a word nothing matches",
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
  const cards = page.locator(".grid .card");
  while (await cards.count()) {
    await cards.first().hover();
    await cards.first().locator("button.trash").click();
    await cards.first().locator(".confirm .remove").click();
  }
  await expect(page.locator(".empty")).toBeVisible();
  await settle(page, 300);
  await nsnap(page, "library-empty", "empty", "phone", "an empty library", {
    full: true,
    fr: true,
  });
});

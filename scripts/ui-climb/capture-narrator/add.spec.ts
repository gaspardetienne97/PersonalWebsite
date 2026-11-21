// Adding a document: the modal and its two tabs, a file being parsed, and the files it
// cannot read (wrong kind, not really a PDF, a scan with no text, a zip that is not an EPUB).
import { expect, test } from "@playwright/test";
import { WIDTHS, settle } from "../capture-common.ts";
import { FILES, chooseFile, narrator, nsnap, openAdd, openLibrary, pickTab } from "./narrator.ts";

const error = ".overlay .notice[role=alert]";

for (const width of WIDTHS) {
  test(`add document modal ${width}`, async ({ page }) => {
    await narrator(page, width);
    await openLibrary(page);
    await openAdd(page);
    await nsnap(
      page,
      "add-document",
      "modal-file",
      width,
      width === "desktop"
        ? "the add-document modal on its File tab: two tabs (File, Paste text), one drop area that takes a PDF, an EPUB or a text file, a line that opens what each kind of file gives, and the narrator voice to use"
        : "the add-document sheet on a phone, File tab: two tabs (File, Paste text), one button that takes a PDF, an EPUB or a text file, a line that opens what each kind of file gives, and the narrator voice to use",
    );
    await page.locator(".overlay details.works > summary").click();
    await settle(page, 250);
    await nsnap(
      page,
      "add-document",
      "modal-works",
      width,
      'the add modal with "What works" opened: what it can read from a PDF, an EPUB and a text file',
    );
    await page.locator(".overlay details.works > summary").click();
    // Nobody drags a file on a phone: there the modal is a sheet and the area is a button.
    if (width === "desktop") {
      await page.locator(".overlay .drop").dispatchEvent("dragover");
      await settle(page, 200);
      await nsnap(
        page,
        "add-document",
        "drag-over",
        width,
        'the add modal while a file is dragged over the drop area: the area lights up and reads "Release to add"',
      );
      await page.locator(".overlay .drop").dispatchEvent("dragleave");
    }
    // The voice row's last quiet button opens the choice of voices.
    const change = page.locator(".overlay .voice-row .quiet-btn").last();
    if (await change.count()) {
      await change.click();
      await settle(page, 250);
      await nsnap(
        page,
        "add-document",
        "voice-change",
        width,
        "the add modal with the narrator voice being changed: the device's voices as choices (stand-in voice list)",
      );
      await change.click();
    }
    await pickTab(page, "paste");
    await nsnap(
      page,
      "add-document",
      "paste-empty",
      width,
      "the add modal on its Paste text tab, nothing typed yet",
    );
    await page
      .locator(".overlay textarea")
      .fill(
        "The sea was calm that morning, and the harbour was quiet. A single gull stood on the mooring post and watched the boats come in. Nobody spoke until the first net was hauled up.",
      );
    await settle(page, 200);
    await nsnap(
      page,
      "add-document",
      "paste-typed",
      width,
      "the add modal on its Paste text tab with text typed: the word count and listening time under it, ready to narrate",
    );
  });

  test(`add document parsing ${width}`, async ({ page }) => {
    await narrator(page, width);
    // Hold the PDF reader's worker back for a few seconds so the progress steps can be shot.
    await page.route(/pdf\.worker/, async (route) => {
      await new Promise((r) => setTimeout(r, 4000));
      await route.continue();
    });
    await openLibrary(page);
    await openAdd(page);
    await chooseFile(page, FILES.pdf);
    await expect(page.locator(".overlay .pipe")).toBeVisible();
    await settle(page, 600);
    await nsnap(
      page,
      "add-document",
      "parsing",
      width,
      "a PDF being read after it was picked: a progress bar, the steps from reading the file to preparing the narration, and only Cancel to press (the first step held for the capture)",
    );
    await expect(page.locator(".root .top")).toBeVisible({ timeout: 30_000 });
    await settle(page, 500);
    await nsnap(
      page,
      "add-document",
      "added",
      width,
      "the document just added, opened in the reader and ready to play",
    );
  });

  test(`add document errors ${width}`, async ({ page }) => {
    await narrator(page, width);
    await openLibrary(page);
    await openAdd(page);
    await chooseFile(page, FILES.unsupported);
    await expect(page.locator(error)).toBeVisible();
    await settle(page, 200);
    await nsnap(
      page,
      "narrator-error",
      "unsupported",
      width,
      "the add modal after picking a word-processor file, a kind it cannot read: a notice says which kinds it reads",
    );
    await chooseFile(page, FILES.brokenPdf);
    await expect(page.locator(".overlay .pipe")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator(error)).toBeVisible();
    await settle(page, 200);
    await nsnap(
      page,
      "narrator-error",
      "parse-failed",
      width,
      "the add modal after picking a file named .pdf that is not a PDF: a notice in place of the drop area says so, with Choose another file and Paste text instead",
    );
    await chooseFile(page, FILES.scannedPdf);
    await expect(page.locator(".overlay .pipe")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator(error)).toBeVisible();
    await settle(page, 200);
    await nsnap(
      page,
      "narrator-error",
      "scanned-pdf",
      width,
      "the add modal after picking a scanned PDF with no text in it: a notice says why, and offers another file (pasting is not offered, there is no text to copy)",
    );
    await chooseFile(page, FILES.brokenEpub);
    await expect(page.locator(".overlay .pipe")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator(error)).toBeVisible();
    await settle(page, 200);
    await nsnap(
      page,
      "narrator-error",
      "broken-epub",
      width,
      "the add modal after picking a damaged EPUB",
    );
  });
}

test("add document in French phone", async ({ page }) => {
  await narrator(page, "phone", { locale: "fr" });
  await openLibrary(page);
  await openAdd(page);
  await nsnap(page, "add-document", "modal-file", "phone", "the add-document sheet, File tab", {
    fr: true,
  });
  await chooseFile(page, FILES.brokenPdf);
  await expect(page.locator(".overlay .pipe")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator(error)).toBeVisible();
  await settle(page, 200);
  await nsnap(
    page,
    "narrator-error",
    "parse-failed",
    "phone",
    "the add modal after picking a file that is not really a PDF",
    {
      fr: true,
    },
  );
  await chooseFile(page, FILES.unsupported);
  await expect(page.locator(error)).toBeVisible();
  await settle(page, 200);
  await nsnap(
    page,
    "narrator-error",
    "unsupported",
    "phone",
    "the add modal after picking a kind of file it cannot read",
    {
      fr: true,
    },
  );
});

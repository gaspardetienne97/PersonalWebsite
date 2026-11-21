// Adding a document: the modal and its four tabs, a file being parsed, and the files it
// cannot read (wrong kind, not really a PDF, a scan with no text, a zip that is not an EPUB).
import { expect, test } from "@playwright/test";
import { WIDTHS, settle } from "../capture-common.ts";
import { FILES, chooseFile, narrator, nsnap, openAdd, openLibrary, pickTab } from "./narrator.ts";

const error = ".overlay .error[role=alert]";

for (const width of WIDTHS) {
  test(`add document modal ${width}`, async ({ page }) => {
    await narrator(page, width);
    await openLibrary(page);
    await openAdd(page);
    await nsnap(
      page,
      "add-document",
      "modal-pdf",
      width,
      "the add-document modal on its PDF tab: tabs for PDF, EPUB, text file and paste, a drop area, and the narrator voice to use",
    );
    await page.locator(".overlay .drop").dispatchEvent("dragover");
    await settle(page, 200);
    await nsnap(page, "add-document", "drag-over", width, "the add modal while a file is dragged over the drop area");
    await page.locator(".overlay .drop").dispatchEvent("dragleave");
    await pickTab(page, "epub");
    await nsnap(page, "add-document", "modal-epub", width, "the add modal on its EPUB tab");
    await pickTab(page, "paste");
    await nsnap(page, "add-document", "paste-empty", width, "the add modal on its Paste tab, nothing typed yet");
    await page
      .locator(".overlay textarea")
      .fill(
        "The sea was calm that morning, and the harbour was quiet. A single gull stood on the mooring post and watched the boats come in. Nobody spoke until the first net was hauled up.",
      );
    await settle(page, 200);
    await nsnap(page, "add-document", "paste-typed", width, "the add modal on its Paste tab with text typed, ready to narrate");
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
    await chooseFile(page, "pdf", FILES.pdf);
    await expect(page.locator(".overlay .pipe")).toBeVisible();
    await settle(page, 600);
    await nsnap(
      page,
      "add-document",
      "parsing",
      width,
      "a PDF being read after it was picked: the steps from reading the file to building the narration (the first step held for the capture)",
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
    await chooseFile(page, "pdf", FILES.unsupported);
    await expect(page.locator(error)).toBeVisible();
    await settle(page, 200);
    await nsnap(
      page,
      "narrator-error",
      "unsupported",
      width,
      "the add modal after picking a word-processor file, a kind it cannot read",
    );
    await chooseFile(page, "pdf", FILES.brokenPdf);
    await expect(page.locator(".overlay .pipe")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator(error)).toBeVisible();
    await settle(page, 200);
    await nsnap(
      page,
      "narrator-error",
      "parse-failed",
      width,
      "the add modal after picking a file named .pdf that is not a PDF: reading it failed",
    );
    await chooseFile(page, "pdf", FILES.scannedPdf);
    await expect(page.locator(".overlay .pipe")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator(error)).toBeVisible();
    await settle(page, 200);
    await nsnap(
      page,
      "narrator-error",
      "scanned-pdf",
      width,
      "the add modal after picking a scanned PDF with no text in it",
    );
    await chooseFile(page, "epub", FILES.brokenEpub);
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
  await nsnap(page, "add-document", "modal-pdf", "phone", "the add-document modal on its PDF tab", {
    fr: true,
  });
  await chooseFile(page, "pdf", FILES.brokenPdf);
  await expect(page.locator(".overlay .pipe")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator(error)).toBeVisible();
  await settle(page, 200);
  await nsnap(page, "narrator-error", "parse-failed", "phone", "the add modal after picking a file that is not really a PDF", {
    fr: true,
  });
  await chooseFile(page, "pdf", FILES.unsupported);
  await expect(page.locator(error)).toBeVisible();
  await settle(page, 200);
  await nsnap(page, "narrator-error", "unsupported", "phone", "the add modal after picking a kind of file it cannot read", {
    fr: true,
  });
});

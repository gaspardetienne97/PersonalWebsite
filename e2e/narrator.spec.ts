import { expect, test } from "@playwright/test";

test.describe("Narrator", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/pdf");
  });

  test("displays the library with the sample documents", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "narrator" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your Library" })).toBeVisible();
    await expect(page.getByText("The Time Machine").first()).toBeVisible();
    await expect(page.getByText("Meditations, Book II").first()).toBeVisible();
  });

  test("shows a continue-listening hero for the furthest-along document", async ({ page }) => {
    await expect(page.getByText("Continue listening")).toBeVisible();
    await expect(page.getByRole("button", { name: /Resume/ })).toBeVisible();
  });

  test("search filters the library", async ({ page }) => {
    await page.getByLabel("Search your library").fill("meditations");

    await expect(page.getByText("Meditations, Book II").first()).toBeVisible();
    await expect(page.getByText("The Time Machine")).not.toBeVisible();
    await expect(page.getByText("1 document", { exact: true })).toBeVisible();
  });

  test("opens the add-document modal with input tabs and voices", async ({ page }) => {
    await page
      .getByRole("button", { name: /Add document/ })
      .first()
      .click();

    await expect(page.getByRole("dialog", { name: "Add a document" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "PDF" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "EPUB" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Text file" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Paste" })).toBeVisible();
    await expect(page.getByText("Narrator voice")).toBeVisible();
    await expect(page.getByText("Drop your PDF here")).toBeVisible();
  });

  test("pasting text lands in the reader with the real words", async ({ page }) => {
    await page
      .getByRole("button", { name: /Add document/ })
      .first()
      .click();
    await page.getByRole("tab", { name: "Paste" }).click();
    await page
      .getByLabel("Text to narrate")
      .fill("Hello world. This is a pasted narration test. It has three sentences.");
    await page.getByRole("button", { name: /Narrate this text/ }).click();

    await expect(page.getByRole("button", { name: "Back to library" })).toBeVisible();
    // The reader renders the pasted prose, tokenized into clickable words
    // (the first sentence is the active teleprompter line at the start).
    await expect(page.locator(".word", { hasText: "Hello" }).first()).toBeVisible();
  });

  test("uploading a real text file extracts and narrates it", async ({ page }) => {
    await page
      .getByRole("button", { name: /Add document/ })
      .first()
      .click();
    await page.getByRole("tab", { name: "Text file" }).click();

    // Real upload: the file is parsed in-browser (no mock content).
    await page.setInputFiles('input[type="file"]', {
      name: "uploaded-notes.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(
        "# Uploaded Notes\n\nThe first real paragraph from a file.\n\n## Section Two\n\nAnd a second paragraph here.",
      ),
    });

    await expect(page.getByText("Building your narration")).toBeVisible();
    await expect(page.getByRole("button", { name: "Back to library" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Uploaded Notes").first()).toBeVisible();
    await expect(page.locator(".word", { hasText: "paragraph" }).first()).toBeVisible();
  });

  test("opens a document in the reader with transport controls", async ({ page }) => {
    await page.getByText("The Time Machine").first().click();

    await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Previous sentence" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Next sentence" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Chapters" })).toBeVisible();
  });

  test("playback toggles between play and pause", async ({ page }) => {
    await page.getByRole("button", { name: "Meditations, Book II", exact: true }).click();
    await page.getByRole("button", { name: "Play" }).click();

    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
    await page.getByRole("button", { name: "Pause" }).click();
    await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
  });

  test("chapters popover jumps within the document", async ({ page }) => {
    await page.getByText("The Time Machine").first().click();
    await page.getByRole("button", { name: "Chapters" }).click();

    await expect(page.getByRole("button", { name: /The Argument/ })).toBeVisible();
    await page.getByRole("button", { name: /The Machine/ }).click();
    await expect(page.getByRole("button", { name: /The Machine/ })).not.toBeVisible();
  });

  test("reader settings link opens the voice settings page", async ({ page }) => {
    await page.getByText("The Time Machine").first().click();
    await page.getByRole("button", { name: "Reader settings" }).click();
    await page
      .getByRole("group", { name: "Reader settings panel" })
      .getByRole("link", { name: /Voice settings/ })
      .click();

    await expect(page.getByRole("heading", { name: "Voice settings" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Reading voice" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "System voices" })).toBeVisible();
  });

  test("reader settings expose the system/natural voice engine toggle", async ({ page }) => {
    await page.getByText("The Time Machine").first().click();
    await page.getByRole("button", { name: "Reader settings" }).click();

    const panel = page.getByRole("group", { name: "Reader settings panel" });
    await expect(panel.getByRole("button", { name: "System", exact: true })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Natural", exact: true })).toBeVisible();
    // Switching to Natural surfaces the in-browser neural-voice explainer.
    await panel.getByRole("button", { name: "Natural", exact: true }).click();
    await expect(panel.getByText(/in-browser neural voice/i)).toBeVisible();
  });

  test("a document can be removed from the library", async ({ page }) => {
    const title = "Designing Data-Intensive Apps — Ch. 1";
    await page.getByRole("button", { name: title, exact: true }).hover();
    await page.getByRole("button", { name: `Remove ${title} from library` }).click();
    await page.getByRole("button", { name: "Remove", exact: true }).click();

    await expect(page.getByRole("button", { name: title, exact: true })).not.toBeVisible();
  });

  test("back button returns to the library", async ({ page }) => {
    await page.getByText("The Time Machine").first().click();
    await page.getByRole("button", { name: "Back to library" }).click();

    await expect(page.getByRole("heading", { name: "Your Library" })).toBeVisible();
  });
});

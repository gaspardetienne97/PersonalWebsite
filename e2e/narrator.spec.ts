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

  test("a first visit invites a first document; a played one is offered to continue", async ({
    page,
  }) => {
    // Nothing was played yet, so no sample is offered as "Continue listening".
    await expect(page.getByText("Add your first document")).toBeVisible();
    await expect(page.getByText("Continue listening")).not.toBeVisible();

    await page.getByRole("button", { name: "The Time Machine", exact: true }).click();
    await page.getByRole("button", { name: "Next sentence" }).click();
    await page.getByRole("button", { name: "Back to library" }).click();

    await expect(page.getByText("Continue listening")).toBeVisible();
    await expect(page.getByRole("button", { name: /Resume/ })).toBeVisible();
  });

  test("library app bar opens the voice settings page", async ({ page }) => {
    await page.getByRole("link", { name: "Voice settings" }).click();
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  });

  test("search filters the library", async ({ page }) => {
    await page.getByLabel("Search your library").fill("meditations");

    await expect(page.getByText("Meditations, Book II").first()).toBeVisible();
    await expect(page.getByText("The Time Machine")).not.toBeVisible();
    await expect(page.getByRole("heading", { name: "1 match for “meditations”" })).toBeVisible();
  });

  test("a search that matches nothing says so and can be cleared", async ({ page }) => {
    const search = page.getByLabel("Search your library");
    await search.fill("zebra");

    await expect(page.getByText("No documents match “zebra”")).toBeVisible();
    // The field has its own clear button now; this is the one in the "no match" message.
    await page.getByRole("status").getByRole("button", { name: "Clear search" }).click();
    await expect(search).toHaveValue("");
    await expect(page.getByText("The Time Machine").first()).toBeVisible();
  });

  test("opens the add-document modal with input tabs and voices", async ({ page }) => {
    await page
      .getByRole("button", { name: /Add document/ })
      .first()
      .click();

    await expect(page.getByRole("dialog", { name: "Add a document" })).toBeVisible();
    // One tab takes every file (the kind is detected), the other takes pasted text.
    await expect(page.getByRole("tab", { name: "File", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Paste text" })).toBeVisible();
    await expect(page.getByText("Narrator voice")).toBeVisible();
    await expect(page.getByText("Drop a file here")).toBeVisible();
  });

  test("pasting text lands in the reader with the real words", async ({ page }) => {
    await page
      .getByRole("button", { name: /Add document/ })
      .first()
      .click();
    await page.getByRole("tab", { name: "Paste text" }).click();
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
    // Real upload: the file is parsed in-browser (no mock content).
    await page.setInputFiles('input[type="file"]', {
      name: "uploaded-notes.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(
        "# Uploaded Notes\n\nThe first real paragraph from a file.\n\n## Section Two\n\nAnd a second paragraph here.",
      ),
    });

    await expect(page.getByText("Preparing your document")).toBeVisible();
    await expect(page.getByRole("button", { name: "Back to library" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Uploaded Notes").first()).toBeVisible();
    await expect(page.locator(".word", { hasText: "paragraph" }).first()).toBeVisible();
  });

  test("opens a document in the reader with transport controls", async ({ page }) => {
    await page.getByRole("button", { name: "The Time Machine", exact: true }).click();

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
    await page.getByRole("button", { name: "The Time Machine", exact: true }).click();
    await page.getByRole("button", { name: "Chapters" }).click();

    await expect(page.getByRole("button", { name: /The Argument/ })).toBeVisible();
    await page.getByRole("button", { name: /The Machine/ }).click();
    await expect(page.getByRole("button", { name: /The Machine/ })).not.toBeVisible();
  });

  test("a player menu closes on its chip or on a press outside, and never hides Play", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "The Time Machine", exact: true }).click();
    const chapters = page.getByRole("button", { name: "Chapters" });
    const item = page.getByRole("button", { name: /The Argument/ });

    await chapters.click();
    await expect(item).toBeVisible();
    await chapters.click();
    await expect(item).not.toBeVisible();

    await chapters.click();
    await expect(item).toBeVisible();
    // Far from the dock, over the text.
    await page.mouse.click(12, 200);
    await expect(item).not.toBeVisible();

    // The tallest menu, open: Play still takes the press (and the press closes the menu).
    await page.locator(".voice-chip").click();
    await expect(page.locator(".voices-pop")).toBeVisible();
    await page.getByRole("button", { name: "Play" }).click();
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
    await expect(page.locator(".voices-pop")).not.toBeVisible();
    await page.getByRole("button", { name: "Pause" }).click();
  });

  test("reader settings close on a press outside the panel", async ({ page }) => {
    await page.getByRole("button", { name: "The Time Machine", exact: true }).click();
    await page.getByRole("button", { name: "Reader settings" }).click();
    const panel = page.getByRole("group", { name: "Reader settings panel" });
    await expect(panel).toBeVisible();

    await page.mouse.click(12, 400);
    await expect(panel).not.toBeVisible();
  });

  test("reader settings link opens the voice settings page", async ({ page }) => {
    await page.getByRole("button", { name: "The Time Machine", exact: true }).click();
    await page.getByRole("button", { name: "Reader settings" }).click();
    await page.getByRole("tab", { name: "Voice" }).click();
    await page
      .getByRole("group", { name: "Reader settings panel" })
      .getByRole("link", { name: /Voice settings/ })
      .click();

    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Reading voice" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "System voices" })).toBeVisible();
  });

  test("reader settings expose the system/natural voice engine toggle", async ({ page }) => {
    await page.getByRole("button", { name: "The Time Machine", exact: true }).click();
    await page.getByRole("button", { name: "Reader settings" }).click();
    await page.getByRole("tab", { name: "Voice" }).click();

    const panel = page.getByRole("group", { name: "Reader settings panel" });
    await expect(panel.getByRole("button", { name: "System", exact: true })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Natural", exact: true })).toBeVisible();
    // Switching to Natural shows what the natural voice is.
    await panel.getByRole("button", { name: "Natural", exact: true }).click();
    await expect(panel.getByText(/closer to a person/i)).toBeVisible();
  });

  test("a document can be removed from the library", async ({ page }) => {
    const title = "Designing Data-Intensive Apps — Ch. 1";
    // Remove sits in the card's "More" menu, which is always in view: no hover needed.
    await page.getByRole("button", { name: `More actions for ${title}` }).click();
    await page.getByRole("button", { name: `Remove ${title} from library` }).click();
    await page.getByRole("button", { name: "Remove", exact: true }).click();

    await expect(page.getByRole("button", { name: title, exact: true })).not.toBeVisible();
  });

  test("back button returns to the library", async ({ page }) => {
    await page.getByRole("button", { name: "The Time Machine", exact: true }).click();
    await page.getByRole("button", { name: "Back to library" }).click();

    await expect(page.getByRole("heading", { name: "Your Library" })).toBeVisible();
  });
});

test.describe("Narrator on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the library fits the screen and a document is removed without hovering", async ({
    page,
  }) => {
    await page.goto("/pdf");
    const title = "Designing Data-Intensive Apps — Ch. 1";
    await expect(page.getByRole("button", { name: title, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    await expect(page.getByRole("button", { name: /Add document/ }).first()).toBeInViewport();

    // No pointer has been over the card: its "More" button is there to tap all the same.
    const more = page.getByRole("button", { name: `More actions for ${title}` });
    await expect(more).toHaveCSS("opacity", "1");
    await more.tap();
    await page.getByRole("button", { name: `Remove ${title} from library` }).tap();
    await page.getByRole("button", { name: "Remove", exact: true }).tap();

    await expect(page.getByRole("button", { name: title, exact: true })).not.toBeVisible();
  });
});

import { expect, test } from "@playwright/test";

test.describe("music reading workflows", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/music/learn/reading");
    await expect(page.getByRole("button", { name: "Start Flashcards" })).toBeEnabled();
  });

  test("completes a piano choice flashcard", async ({ page }) => {
    await page.getByRole("button", { name: "Start Flashcards" }).click();
    await expect(page.getByText("1 / 10")).toBeVisible();
    await page.locator('[aria-label="Answer choices"] button').first().click();
    await expect(page.getByText("2 / 10")).toBeVisible();
  });

  test("plays a guitar flashcard on the fretboard", async ({ page }) => {
    await page.getByRole("button", { name: "Guitar" }).click();
    // Exact match: the persistent transport bar also exposes a "Play metronome" button.
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.getByRole("button", { name: "Start Flashcards" }).click();
    const targets = page.locator('[aria-label*=", target"]');
    await expect(targets.first()).toBeVisible();
    await targets.first().click();
    await expect(page.getByText("2 / 10")).toBeVisible();
  });

  test("saves and selects a custom ukulele tuning", async ({ page }) => {
    await page.getByRole("button", { name: "Ukulele" }).click();
    await page.getByRole("button", { name: "New custom tuning" }).click();
    await page.getByLabel("Tuning name").fill("E2E Ukulele");
    await page.getByTestId("save-tuning").click();
    await expect(page.getByRole("button", { name: "Edit E2E Ukulele" })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("completes wait-mode polyphonic sight reading", async ({ page }) => {
    await page.getByRole("button", { name: "Sight-Reading" }).click();
    await page.getByRole("button", { name: "Start Sight-Reading" }).click();
    await page.getByRole("button", { name: "Start count-in" }).click();
    await expect(page.getByText("Expected notes")).toBeVisible();

    for (let index = 0; index < 32; index += 1) {
      if (await page.getByRole("button", { name: "Finish phrase" }).isEnabled()) break;
      const targets = page.getByTestId("expected-note");
      const count = await targets.count();
      for (let targetIndex = 0; targetIndex < count; targetIndex += 1) {
        await targets.nth(targetIndex).click();
      }
    }

    await page.getByRole("button", { name: "Finish phrase" }).click();
    await expect(page.getByText("100% accuracy")).toBeVisible();
  });

  test("completes performance-mode sight reading", async ({ page }) => {
    await page.getByRole("button", { name: "Sight-Reading" }).click();
    await page.getByRole("button", { name: "Performance" }).click();
    await page.getByRole("button", { name: "Start Sight-Reading" }).click();
    await page.getByRole("button", { name: "Start count-in" }).click();
    await expect(page.getByText("Timing feedback")).toBeVisible();

    for (let index = 0; index < 32; index += 1) {
      if (await page.getByRole("button", { name: "Finish phrase" }).isEnabled()) break;
      const targets = page.getByTestId("expected-note");
      const count = await targets.count();
      for (let targetIndex = 0; targetIndex < count; targetIndex += 1) {
        await targets.nth(targetIndex).click();
      }
    }

    await page.getByRole("button", { name: "Finish phrase" }).click();
    await expect(page.getByText("100% accuracy")).toBeVisible();
  });
});

import { expect, test } from "@playwright/test";

test.describe("music reading workflows", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/music/learn/reading");
    await expect(page.getByRole("button", { name: "Start", exact: true })).toBeEnabled();
    // Setup is collapsed behind its summary line.
    await page.getByRole("button", { name: "Edit setup" }).click();
    await expect(page.getByRole("button", { name: "Flashcards" })).toBeVisible();
  });

  test("holds a wrong flashcard for correction and retries only mistakes", async ({ page }) => {
    await page.goto("/music/learn/reading?low=60&high=60");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.getByText("1 / 10")).toBeVisible();
    await page
      .locator('[aria-label="Answer choices"]')
      .getByRole("button", { name: "D", exact: true })
      .click();
    await expect(page.getByText("Expected C", { exact: true })).toBeVisible();
    await expect(page.getByText("You chose D", { exact: true })).toBeVisible();
    await expect(page.getByText("1 / 10")).toBeVisible();
    await expect(page.locator('[aria-label="Answer choices"] button').first()).toBeDisabled();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByText("2 / 10")).toBeVisible();
    for (let index = 1; index < 10; index += 1) {
      await page
        .locator('[aria-label="Answer choices"]')
        .getByRole("button", { name: "C", exact: true })
        .click();
    }
    await page.getByRole("button", { name: "Retry mistakes", exact: true }).click();
    await expect(page.getByText("1 / 1", { exact: true })).toBeVisible();
    await page
      .locator('[aria-label="Answer choices"]')
      .getByRole("button", { name: "C", exact: true })
      .click();
    await expect(page.getByText("100% accuracy")).toBeVisible();
  });

  test("plays a guitar flashcard on the fretboard", async ({ page }) => {
    await page.getByRole("button", { name: "Guitar" }).click();
    // Exact match avoids other local preview controls on the reading screen.
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const targets = page.locator('[aria-label*=", target"]');
    await expect(targets).toHaveCount(0);
    await page.getByRole("button", { name: "Help", exact: true }).click();
    await expect(targets.first()).toBeVisible();
    await targets.first().focus();
    await page.keyboard.press("Enter");
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
    await page.getByRole("button", { name: "Start", exact: true }).click();
    // Wait mode has no count-in: the ready phrase offers Start again.
    await expect(page.getByText("Phrase ready")).toBeVisible();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.getByText("Expected notes")).toBeVisible();

    for (let index = 0; index < 32; index += 1) {
      if (await page.getByRole("button", { name: "Finish phrase" }).isEnabled()) break;
      const targets = page.getByTestId("score-expected-note");
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
    await page.getByRole("button", { name: "Assess" }).click();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await page.getByRole("button", { name: "Start count-in" }).click();
    await expect(page.getByText("Timing feedback")).toBeVisible();

    for (let index = 0; index < 32; index += 1) {
      if (await page.getByRole("button", { name: "Finish phrase" }).isEnabled()) break;
      const targets = page.getByTestId("score-expected-note");
      const count = await targets.count();
      for (let targetIndex = 0; targetIndex < count; targetIndex += 1) {
        await targets.nth(targetIndex).click();
      }
    }

    await page.getByRole("button", { name: "Finish phrase" }).click();
    await expect(page.getByRole("heading", { name: "Reading results" })).toBeVisible();
    await expect(page.getByText(/\d+% accuracy/)).toBeVisible();
  });
});

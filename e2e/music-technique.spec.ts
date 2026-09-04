import { expect, test } from "@playwright/test";

test.describe("music technique workflows", () => {
  test("opens scales from Play and completes a paced C major run", async ({ page }) => {
    await page.goto("/music/play");
    await page.getByRole("link", { name: /Scales & Technique/ }).click();

    await expect(page).toHaveURL(/\/music\/play\/scales(?:\?|$)/);
    await expect(page.getByRole("heading", { name: "Scales & Technique" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start", exact: true })).toBeEnabled();

    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "C major · one octave · ascending" }),
    ).toBeVisible();

    for (const note of ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"]) {
      await page.getByRole("button", { name: note }).focus();
      await page.keyboard.press("Enter");
      await page.waitForTimeout(600);
    }

    await expect(page.getByRole("heading", { name: "Scale complete" })).toBeVisible();
    await expect(page.getByText(/next target 110 BPM/)).toBeVisible();
  });
});

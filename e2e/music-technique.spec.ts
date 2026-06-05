import { expect, test } from "@playwright/test";

test.describe("music technique workflows", () => {
  test("opens scales from Play and completes a paced C major run", async ({ page }) => {
    await page.goto("/music/play");
    await page.getByRole("link", { name: /Scales & Technique/ }).click();

    await expect(page).toHaveURL("/music/play/scales");
    await expect(page.getByRole("heading", { name: "Scales & Technique" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start Scale" })).toBeEnabled();

    await page.getByRole("button", { name: "Start Scale" }).click();
    await expect(page.getByText("C major", { exact: true })).toBeVisible();

    for (const note of ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"]) {
      await page.getByRole("button", { name: note }).click();
      await page.waitForTimeout(600);
    }

    await expect(page.getByText("Scale complete")).toBeVisible();
    await expect(page.getByText("Next target: 110 BPM")).toBeVisible();
  });
});

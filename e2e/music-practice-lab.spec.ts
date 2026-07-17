import { expect, test } from "@playwright/test";

test("Practice Lab backing playback stays local across navigation", async ({ page }) => {
  await page.goto("/music/play");
  await page.getByRole("button", { name: "Generated backing" }).click();
  await page.getByRole("button", { name: "Play backing" }).click();
  await expect(page.getByRole("button", { name: "Pause backing" })).toBeVisible();

  await page.goto("/music");
  await expect(page.getByRole("button", { name: "Pause backing" })).toHaveCount(0);
});

test("Practice Lab has no horizontal overflow at supported widths", async ({ page }) => {
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 375, height: 812 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/music/play");
    await expect(page.getByRole("heading", { name: "Practice Lab" })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBe(0);
  }
});

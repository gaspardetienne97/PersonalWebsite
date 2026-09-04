import { expect, test } from "@playwright/test";

test.describe("music string spider", () => {
  test("opens from Play and completes a guitar 1-2-3-4 pattern", async ({ page }) => {
    await page.goto("/music/play");
    await page
      .getByRole("region", { name: "Play tools" })
      .locator('a[href="/music/play/spider"]')
      .click();

    await expect(page.getByRole("heading", { name: "String Independence" })).toBeVisible();
    await expect(page.getByTestId("spider-fret-range")).toContainText("Frets 4 to 9 shown");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();

    for (const fret of [5, 6, 7, 8]) {
      await page.getByRole("button", { name: new RegExp(`String 6 fret ${fret},`) }).focus();
      await page.keyboard.press("Enter");
    }

    await expect(page.getByText("Spider complete", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Again" }).first()).toBeVisible();
  });

  test("keeps the fretboard inside the mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/music/play/spider");

    const widths = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
    }));

    expect(widths.document).toBeLessThanOrEqual(widths.viewport);
  });
});

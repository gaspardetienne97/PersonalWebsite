// A drill's back link returns to where it was opened from: Today, Drills or
// Paths (and Drills when it was opened directly).
import { expect, test } from "@playwright/test";

test.describe("drill back link", () => {
  test.beforeEach(async ({ page }) => {
    await page.routeWebSocket(/\/\?token=|vite-hmr/, () => {});
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test("from Today, Drills and Paths, survives a reload, and defaults to Drills", async ({
    page,
  }) => {
    // Today's routine.
    await page.goto("/music");
    await page.getByRole("link", { name: /^(Start|Continue) with/ }).click();
    const back = page.getByRole("link", { name: /^Back to / });
    await expect(back).toHaveText("Back to Today");
    await back.click();
    await expect(page).toHaveURL(/\/music(\?tab=today)?$/);

    // The Drills tab.
    await page.goto("/music?tab=drills");
    await page.locator('a[href^="/music/scales"]').first().click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(back).toHaveText("Back to Drills");
    await back.click();
    await expect(page).toHaveURL(/tab=drills/);

    // A learning path, then a reload on the drill.
    await page.goto("/music?tab=paths");
    await page
      .getByRole("link", { name: /^(Start|Again)/ })
      .first()
      .click();
    await expect(back).toHaveText("Back to Paths");
    await page.reload();
    await expect(back).toHaveText("Back to Paths");
    await back.click();
    await expect(page).toHaveURL(/tab=paths/);

    // Opened directly in a fresh tab: back to Drills.
    const fresh = await page.context().newPage();
    await fresh.goto("/music/rhythm");
    await expect(fresh.getByRole("link", { name: /^Back to / })).toHaveText("Back to Drills");
    await expect(fresh.getByRole("link", { name: /^Back to / })).toHaveAttribute(
      "href",
      "/music?tab=drills",
    );
  });
});

import { expect, test } from "@playwright/test";

test.describe("music Aerophone technique workflows", () => {
  test("switches to a dynamic swell and can cancel the active drill", async ({ page }) => {
    await page.goto("/music/learn/aerophone");

    await expect(page.getByRole("heading", { name: "Aerophone Technique" })).toBeVisible();
    await page.getByRole("button", { name: "Dynamic swell" }).click();
    await expect(page.getByRole("heading", { name: "Dynamic Swell Trainer" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start", exact: true })).toBeEnabled();

    await page.getByRole("button", { name: "Start", exact: true }).click();
    // The stage appears after the transport count-in; allow for it under load.
    await expect(page.getByRole("button", { name: "Stop" })).toBeEnabled({ timeout: 15_000 });
    await expect(page.getByText("Soft", { exact: true })).toHaveCount(2);

    await page.getByRole("button", { name: "Stop" }).click();
    await expect(page.getByRole("button", { name: "Start", exact: true })).toBeEnabled();
  });

  test("fits the fingering chart at a mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/music/learn/aerophone");

    await expect(page.getByRole("heading", { name: "Fingering chart" })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

import { expect, test } from "@playwright/test";

test.describe("music rhythm workflows", () => {
  test("opens rhythm trainer directly and completes an on-screen pulse", async ({ page }) => {
    await page.goto("/music/learn/rhythm");
    await expect(page.getByRole("heading", { name: "Rhythm Trainer" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start microphone" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start", exact: true })).toBeEnabled({
      timeout: 10_000,
    });

    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.getByRole("button", { name: "Tap beat" })).toBeVisible();

    for (let index = 0; index < 4; index += 1) {
      await page.getByRole("button", { name: "Tap beat" }).click();
    }

    await expect(page.getByText("Pulse complete", { exact: true })).toBeVisible();
    // The summary now surfaces timing via the meter + readout tiles.
    await expect(page.getByText("Signed offset")).toBeVisible();
  });

  test("keeps microphone setup visible without mobile overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/music/learn/rhythm");

    await expect(page.getByRole("button", { name: "Start microphone" })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
});

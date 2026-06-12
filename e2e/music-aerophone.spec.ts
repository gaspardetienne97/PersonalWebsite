import { expect, test } from "@playwright/test";

test.describe("music Aerophone technique workflows", () => {
  test("switches to a dynamic swell and can cancel the active drill", async ({ page }) => {
    await page.goto("/music/learn/aerophone");

    await expect(page.getByRole("heading", { name: "Aerophone Technique" })).toBeVisible();
    await page.getByRole("button", { name: "Dynamic swell" }).click();
    await expect(page.getByRole("heading", { name: "Dynamic Swell Trainer" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start dynamic swell" })).toBeEnabled();

    await page.getByRole("button", { name: "Start dynamic swell" }).click();
    await expect(page.getByRole("button", { name: "Cancel dynamic swell" })).toBeEnabled();
    await expect(page.getByText("Soft", { exact: true })).toHaveCount(2);

    await page.getByRole("button", { name: "Cancel dynamic swell" }).click();
    await expect(page.getByRole("button", { name: "Start dynamic swell" })).toBeEnabled();
  });
});
